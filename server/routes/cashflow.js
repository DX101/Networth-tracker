const express = require('express');
const router = express.Router();
const { getDb, ensureCashflowColumns } = require('../db');
const { takeSnapshot } = require('./snapshots');

// Helper to safely adjust asset balances
function adjustAssetBalance(db, assetId, delta) {
  if (!assetId || delta === 0 || isNaN(delta)) return;
  db.prepare('UPDATE assets SET current_value = ROUND(current_value + ?, 2), updated_at = datetime(\'now\') WHERE id = ?')
    .run(Number(delta), assetId);
}

// GET all cashflow entries with account details
router.get('/', (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const { type, category, month, year, account_id } = req.query;

    let query = `
      SELECT c.*, 
             a1.name AS account_name, 
             a2.name AS to_account_name 
      FROM cashflow c
      LEFT JOIN assets a1 ON c.account_id = a1.id
      LEFT JOIN assets a2 ON c.to_account_id = a2.id
      WHERE 1=1
    `;
    const params = [];

    if (type) { query += ' AND c.type = ?'; params.push(type); }
    if (category) { query += ' AND c.category = ?'; params.push(category); }
    if (month) { query += " AND strftime('%m', c.date) = ?"; params.push(String(month).padStart(2, '0')); }
    if (year) { query += " AND strftime('%Y', c.date) = ?"; params.push(String(year)); }
    if (account_id) {
      query += ' AND (c.account_id = ? OR c.to_account_id = ?)';
      params.push(account_id, account_id);
    }

    query += ' ORDER BY c.date DESC, c.id DESC';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single entry
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const item = db.prepare(`
      SELECT c.*, 
             a1.name AS account_name, 
             a2.name AS to_account_name 
      FROM cashflow c
      LEFT JOIN assets a1 ON c.account_id = a1.id
      LEFT JOIN assets a2 ON c.to_account_id = a2.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!item) return res.status(404).json({ error: 'Cashflow entry not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET account statement / passbook
router.get('/account/:id/statement', (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const assetId = req.params.id;

    const account = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!account) return res.status(404).json({ error: 'Account/Asset not found' });

    const rawRows = db.prepare(`
      SELECT c.*, 
             a1.name AS account_name, 
             a2.name AS to_account_name 
      FROM cashflow c
      LEFT JOIN assets a1 ON c.account_id = a1.id
      LEFT JOIN assets a2 ON c.to_account_id = a2.id
      WHERE c.account_id = ? OR c.to_account_id = ?
      ORDER BY c.date ASC, c.id ASC
    `).all(assetId, assetId);

    let totalInflow = 0;
    let totalOutflow = 0;

    const transactions = rawRows.map(tx => {
      let direction = 'inflow';
      let descriptionLabel = tx.description || tx.category;

      if (tx.type === 'expense') {
        direction = 'outflow';
        totalOutflow += tx.amount;
      } else if (tx.type === 'income') {
        direction = 'inflow';
        totalInflow += tx.amount;
      } else if (tx.type === 'transfer') {
        if (Number(tx.account_id) === Number(assetId)) {
          direction = 'outflow';
          totalOutflow += tx.amount;
          descriptionLabel = `Transfer to ${tx.to_account_name || 'Account'} (${tx.description || 'Fund Transfer'})`;
        } else {
          direction = 'inflow';
          totalInflow += tx.amount;
          descriptionLabel = `Transfer from ${tx.account_name || 'Account'} (${tx.description || 'Fund Transfer'})`;
        }
      }

      return {
        ...tx,
        direction,
        display_label: descriptionLabel
      };
    });

    res.json({
      account,
      total_inflow: totalInflow,
      total_outflow: totalOutflow,
      net_change: totalInflow - totalOutflow,
      transactions: transactions.reverse() // Return newest first
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const {
      type, amount, category, date, description,
      is_recurring, frequency, account_id, to_account_id, adjust_balance
    } = req.body;

    if (!type || !['income', 'expense', 'transfer'].includes(type)) {
      return res.status(400).json({ error: 'Valid cashflow type (income, expense, transfer) is required' });
    }

    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    let cat = category ? String(category).trim() : '';
    if (type === 'transfer' && !cat) cat = 'Transfer';
    if (!cat) return res.status(400).json({ error: 'Category is required' });

    const shouldAdjust = adjust_balance !== false && adjust_balance !== 0 && adjust_balance !== '0';

    if (type === 'transfer') {
      if (!account_id || !to_account_id) {
        return res.status(400).json({ error: 'Both Source and Destination accounts are required for a transfer' });
      }
      if (Number(account_id) === Number(to_account_id)) {
        return res.status(400).json({ error: 'Source and Destination accounts cannot be the same' });
      }
    }

    const runInsert = db.transaction(() => {
      if (type === 'transfer') {
        if (shouldAdjust) {
          adjustAssetBalance(db, account_id, -amt);
          adjustAssetBalance(db, to_account_id, amt);
        }
      } else if (type === 'expense') {
        if (account_id && shouldAdjust) {
          adjustAssetBalance(db, account_id, -amt);
        }
      } else if (type === 'income') {
        if (account_id && shouldAdjust) {
          adjustAssetBalance(db, account_id, amt);
        }
      }

      const stmt = db.prepare(`
        INSERT INTO cashflow (
          type, amount, category, date, description,
          is_recurring, frequency, account_id, to_account_id, adjust_balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      return stmt.run(
        type, amt, cat, date || new Date().toISOString().split('T')[0],
        description || '', is_recurring ? 1 : 0, frequency || null,
        account_id ? Number(account_id) : null,
        to_account_id ? Number(to_account_id) : null,
        shouldAdjust ? 1 : 0
      );
    });

    const result = runInsert();

    await takeSnapshot();

    const item = db.prepare(`
      SELECT c.*, 
             a1.name AS account_name, 
             a2.name AS to_account_name 
      FROM cashflow c
      LEFT JOIN assets a1 ON c.account_id = a1.id
      LEFT JOIN assets a2 ON c.to_account_id = a2.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import Cashflow
router.post('/bulk', async (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions must be a non-empty array' });
    }
    const insert = db.prepare(`
      INSERT INTO cashflow (type, amount, category, date, description, account_id, to_account_id, adjust_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const tx of transactions) {
      const type = tx.type && ['income', 'expense', 'transfer'].includes(tx.type) ? tx.type : 'expense';
      const amt = Number(tx.amount) || 0;
      insert.run(
        type, amt, tx.category || 'General', tx.date || new Date().toISOString().split('T')[0],
        tx.description || '', tx.account_id || null, tx.to_account_id || null, 0
      );
    }

    await takeSnapshot();
    res.json({ success: true, count: transactions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const existing = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cashflow entry not found' });

    const {
      type, amount, category, date, description,
      is_recurring, frequency, account_id, to_account_id, adjust_balance
    } = req.body;

    const newType = type !== undefined ? type : existing.type;
    const newAmount = amount !== undefined ? Number(amount) : Number(existing.amount);
    const newCat = category !== undefined ? (category ? String(category).trim() : 'Transfer') : existing.category;
    const newAccountId = account_id !== undefined ? (account_id ? Number(account_id) : null) : existing.account_id;
    const newToAccountId = to_account_id !== undefined ? (to_account_id ? Number(to_account_id) : null) : existing.to_account_id;
    const newAdjustBalance = adjust_balance !== undefined ? (adjust_balance ? 1 : 0) : existing.adjust_balance;

    const runUpdate = db.transaction(() => {
      // 1. Revert previous asset adjustment
      if (existing.adjust_balance) {
        const oldAmt = Number(existing.amount) || 0;
        if (existing.type === 'expense' && existing.account_id) {
          adjustAssetBalance(db, existing.account_id, oldAmt);
        } else if (existing.type === 'income' && existing.account_id) {
          adjustAssetBalance(db, existing.account_id, -oldAmt);
        } else if (existing.type === 'transfer' && existing.account_id && existing.to_account_id) {
          adjustAssetBalance(db, existing.account_id, oldAmt);
          adjustAssetBalance(db, existing.to_account_id, -oldAmt);
        }
      }

      // 2. Apply new asset adjustment
      if (newAdjustBalance) {
        if (newType === 'expense' && newAccountId) {
          adjustAssetBalance(db, newAccountId, -newAmount);
        } else if (newType === 'income' && newAccountId) {
          adjustAssetBalance(db, newAccountId, newAmount);
        } else if (newType === 'transfer' && newAccountId && newToAccountId) {
          adjustAssetBalance(db, newAccountId, -newAmount);
          adjustAssetBalance(db, newToAccountId, newAmount);
        }
      }

      // 3. Update record
      const stmt = db.prepare(`
        UPDATE cashflow SET 
          type = ?, amount = ?, category = ?, date = ?, description = ?,
          is_recurring = ?, frequency = ?, account_id = ?, to_account_id = ?,
          adjust_balance = ?, updated_at = datetime('now')
        WHERE id = ?
      `);

      stmt.run(
        newType, newAmount, newCat, date ?? existing.date,
        description ?? existing.description,
        is_recurring !== undefined ? (is_recurring ? 1 : 0) : existing.is_recurring,
        frequency !== undefined ? frequency : existing.frequency,
        newAccountId, newToAccountId, newAdjustBalance,
        req.params.id
      );
    });

    runUpdate();

    await takeSnapshot();

    const item = db.prepare(`
      SELECT c.*, 
             a1.name AS account_name, 
             a2.name AS to_account_name 
      FROM cashflow c
      LEFT JOIN assets a1 ON c.account_id = a1.id
      LEFT JOIN assets a2 ON c.to_account_id = a2.id
      WHERE c.id = ?
    `).get(req.params.id);

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    ensureCashflowColumns(db);
    const existing = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cashflow entry not found' });

    const runDelete = db.transaction(() => {
      // Revert balance adjustment if was applied
      if (existing.adjust_balance) {
        const amt = Number(existing.amount) || 0;
        if (existing.type === 'expense' && existing.account_id) {
          adjustAssetBalance(db, existing.account_id, amt);
        } else if (existing.type === 'income' && existing.account_id) {
          adjustAssetBalance(db, existing.account_id, -amt);
        } else if (existing.type === 'transfer' && existing.account_id && existing.to_account_id) {
          adjustAssetBalance(db, existing.account_id, amt);
          adjustAssetBalance(db, existing.to_account_id, -amt);
        }
      }

      db.prepare('DELETE FROM cashflow WHERE id = ?').run(req.params.id);
    });

    runDelete();
    await takeSnapshot();
    res.json({ message: 'Cashflow entry deleted and balance reversed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET summary for a month
router.get('/summary/:year/:month', (req, res) => {
  try {
    const db = getDb();
    const { year, month } = req.params;
    const m = String(month).padStart(2, '0');

    const income = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='income' AND strftime('%Y', date)=? AND strftime('%m', date)=?"
    ).get(String(year), m);

    const expenses = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='expense' AND strftime('%Y', date)=? AND strftime('%m', date)=?"
    ).get(String(year), m);

    const transfers = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='transfer' AND strftime('%Y', date)=? AND strftime('%m', date)=?"
    ).get(String(year), m);

    res.json({
      year: Number(year), month: Number(month),
      total_income: income.total,
      total_expenses: expenses.total,
      total_transfers: transfers.total,
      net_cashflow: income.total - expenses.total,
      savings_rate: income.total > 0 ? ((income.total - expenses.total) / income.total * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
