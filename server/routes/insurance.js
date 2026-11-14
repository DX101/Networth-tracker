const express = require('express');
const router = express.Router();
const { getDb, ensureInsuranceTable, ensureCashflowColumns } = require('../db');
const { takeSnapshot } = require('./snapshots');

function advanceDueDate(currentDateStr, frequency) {
  const d = currentDateStr ? new Date(currentDateStr) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];

  const freq = (frequency || 'annual').toLowerCase();
  if (freq === 'annual' || freq === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else if (freq === 'semi_annual' || freq === 'half_yearly') {
    d.setMonth(d.getMonth() + 6);
  } else if (freq === 'quarterly') {
    d.setMonth(d.getMonth() + 3);
  } else if (freq === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().split('T')[0];
}

// GET all policies
router.get('/', (req, res) => {
  try {
    const db = getDb();
    ensureInsuranceTable(db);
    const policies = db.prepare(`
      SELECT ins.*, 
             a.name AS account_name 
      FROM insurance ins
      LEFT JOIN assets a ON ins.account_id = a.id
      ORDER BY ins.next_due_date ASC, ins.id DESC
    `).all();
    res.json(policies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single policy
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    ensureInsuranceTable(db);
    const policy = db.prepare(`
      SELECT ins.*, 
             a.name AS account_name 
      FROM insurance ins
      LEFT JOIN assets a ON ins.account_id = a.id
      WHERE ins.id = ?
    `).get(req.params.id);

    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create policy
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    ensureInsuranceTable(db);
    const {
      policy_name, provider, policy_type, policy_number,
      sum_assured, cash_value, premium_amount, premium_frequency,
      next_due_date, start_date, maturity_date, account_id,
      nominee, status, notes,
      policy_term, maturity_payout_option, maturity_amount, vested_bonus, loyalty_addition
    } = req.body;

    if (!policy_name || !String(policy_name).trim()) {
      return res.status(400).json({ error: 'Policy name is required' });
    }
    if (!provider || !String(provider).trim()) {
      return res.status(400).json({ error: 'Insurance provider is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO insurance (
        policy_name, provider, policy_type, policy_number,
        sum_assured, cash_value, premium_amount, premium_frequency,
        next_due_date, start_date, maturity_date, account_id,
        nominee, status, notes,
        policy_term, maturity_payout_option, maturity_amount, vested_bonus, loyalty_addition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      policy_name.trim(),
      provider.trim(),
      policy_type || 'term_life',
      policy_number || '',
      Number(sum_assured) || 0,
      Number(cash_value) || 0,
      Number(premium_amount) || 0,
      premium_frequency || 'annual',
      next_due_date || null,
      start_date || new Date().toISOString().split('T')[0],
      maturity_date || null,
      account_id ? Number(account_id) : null,
      nominee || '',
      status || 'active',
      notes || '',
      policy_term || '',
      maturity_payout_option || '',
      maturity_amount !== undefined && maturity_amount !== null && maturity_amount !== '' ? Number(maturity_amount) : 0,
      vested_bonus !== undefined && vested_bonus !== null && vested_bonus !== '' ? Number(vested_bonus) : 0,
      loyalty_addition !== undefined && loyalty_addition !== null && loyalty_addition !== '' ? Number(loyalty_addition) : 0
    );

    await takeSnapshot();

    const policy = db.prepare(`
      SELECT ins.*, a.name AS account_name 
      FROM insurance ins
      LEFT JOIN assets a ON ins.account_id = a.id
      WHERE ins.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(policy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update policy
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    ensureInsuranceTable(db);
    const existing = db.prepare('SELECT * FROM insurance WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Policy not found' });

    const {
      policy_name, provider, policy_type, policy_number,
      sum_assured, cash_value, premium_amount, premium_frequency,
      next_due_date, start_date, maturity_date, account_id,
      nominee, status, notes,
      policy_term, maturity_payout_option, maturity_amount, vested_bonus, loyalty_addition
    } = req.body;

    const stmt = db.prepare(`
      UPDATE insurance SET
        policy_name = ?, provider = ?, policy_type = ?, policy_number = ?,
        sum_assured = ?, cash_value = ?, premium_amount = ?, premium_frequency = ?,
        next_due_date = ?, start_date = ?, maturity_date = ?, account_id = ?,
        nominee = ?, status = ?, notes = ?,
        policy_term = ?, maturity_payout_option = ?, maturity_amount = ?, vested_bonus = ?, loyalty_addition = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      policy_name !== undefined ? policy_name.trim() : existing.policy_name,
      provider !== undefined ? provider.trim() : existing.provider,
      policy_type !== undefined ? policy_type : existing.policy_type,
      policy_number !== undefined ? policy_number : existing.policy_number,
      sum_assured !== undefined ? Number(sum_assured) : existing.sum_assured,
      cash_value !== undefined ? Number(cash_value) : existing.cash_value,
      premium_amount !== undefined ? Number(premium_amount) : existing.premium_amount,
      premium_frequency !== undefined ? premium_frequency : existing.premium_frequency,
      next_due_date !== undefined ? (next_due_date || null) : existing.next_due_date,
      start_date !== undefined ? (start_date || null) : existing.start_date,
      maturity_date !== undefined ? (maturity_date || null) : existing.maturity_date,
      account_id !== undefined ? (account_id ? Number(account_id) : null) : existing.account_id,
      nominee !== undefined ? nominee : existing.nominee,
      status !== undefined ? status : existing.status,
      notes !== undefined ? notes : existing.notes,
      policy_term !== undefined ? policy_term : (existing.policy_term || ''),
      maturity_payout_option !== undefined ? maturity_payout_option : (existing.maturity_payout_option || ''),
      maturity_amount !== undefined ? (Number(maturity_amount) || 0) : (existing.maturity_amount || 0),
      vested_bonus !== undefined ? (Number(vested_bonus) || 0) : (existing.vested_bonus || 0),
      loyalty_addition !== undefined ? (Number(loyalty_addition) || 0) : (existing.loyalty_addition || 0),
      req.params.id
    );

    await takeSnapshot();

    const policy = db.prepare(`
      SELECT ins.*, a.name AS account_name 
      FROM insurance ins
      LEFT JOIN assets a ON ins.account_id = a.id
      WHERE ins.id = ?
    `).get(req.params.id);

    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE policy
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    ensureInsuranceTable(db);
    const existing = db.prepare('SELECT * FROM insurance WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Policy not found' });

    db.prepare('DELETE FROM insurance WHERE id = ?').run(req.params.id);
    await takeSnapshot();
    res.json({ message: 'Policy deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST pay-premium: records payment in Cashflow and advances next_due_date
router.post('/:id/pay-premium', async (req, res) => {
  try {
    const db = getDb();
    ensureInsuranceTable(db);
    ensureCashflowColumns(db);

    const policy = db.prepare('SELECT * FROM insurance WHERE id = ?').get(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const { amount, date, account_id, syncCashflow } = req.body;
    const paymentAmount = Number(amount) || Number(policy.premium_amount) || 0;
    const paymentDate = date || new Date().toISOString().split('T')[0];
    const targetAccountId = account_id ? Number(account_id) : policy.account_id;

    if (paymentAmount <= 0) {
      return res.status(400).json({ error: 'Premium payment amount must be greater than 0' });
    }

    // 1. Advance next_due_date
    const newDueDate = advanceDueDate(policy.next_due_date || paymentDate, policy.premium_frequency);
    db.prepare("UPDATE insurance SET next_due_date = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newDueDate, req.params.id);

    // 2. Record Cashflow Expense
    if (syncCashflow !== false) {
      // Deduct from bank account if specified
      if (targetAccountId) {
        db.prepare("UPDATE assets SET current_value = ROUND(current_value - ?, 2), updated_at = datetime('now') WHERE id = ?")
          .run(paymentAmount, targetAccountId);
      }

      db.prepare(`
        INSERT INTO cashflow (type, amount, category, date, description, account_id, adjust_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'expense', paymentAmount, 'Insurance', paymentDate,
        `Premium - ${policy.policy_name} (${policy.provider})`,
        targetAccountId || null,
        targetAccountId ? 1 : 0
      );
    }

    await takeSnapshot();

    const updated = db.prepare(`
      SELECT ins.*, a.name AS account_name 
      FROM insurance ins
      LEFT JOIN assets a ON ins.account_id = a.id
      WHERE ins.id = ?
    `).get(req.params.id);

    res.json({
      success: true,
      policy: updated,
      payment: {
        amount: paymentAmount,
        date: paymentDate,
        new_due_date: newDueDate
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
