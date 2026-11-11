const express = require('express');
const router = express.Router();
const { getDb, ensureSnapshotColumns } = require('../db');

// Helper function to calculate and store a snapshot
async function takeSnapshot(isManual = false) {
  try {
    const db = getDb();
    ensureSnapshotColumns(db);

    const assetsTotal = db.prepare('SELECT COALESCE(SUM(current_value), 0) as total FROM assets').get();
    const liabilitiesTotal = db.prepare('SELECT COALESCE(SUM(current_value), 0) as total FROM liabilities').get();

    const investments = db.prepare('SELECT * FROM investments').all();
    let investmentValue = 0;
    let investmentCost = 0;
    for (const inv of investments) {
      investmentValue += inv.current_price * inv.quantity;
      investmentCost += inv.buy_price * inv.quantity;
    }
    const investmentPnl = investmentValue - investmentCost;

    let insuranceCashValue = 0;
    try {
      const insRow = db.prepare("SELECT COALESCE(SUM(cash_value), 0) as total FROM insurance WHERE status='active'").get();
      if (insRow) insuranceCashValue = insRow.total || 0;
    } catch (e) {}

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const incomeTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='income' AND strftime('%Y', date)=? AND strftime('%m', date)=?"
    ).get(String(year), month);

    const expenseTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='expense' AND strftime('%Y', date)=? AND strftime('%m', date)=?"
    ).get(String(year), month);

    const totalAssetsWithInvestments = assetsTotal.total + investmentValue + insuranceCashValue;
    const netCashflow = incomeTotal.total - expenseTotal.total;
    const netWorth = totalAssetsWithInvestments - liabilitiesTotal.total + netCashflow;

    const stmt = db.prepare(
      `INSERT INTO snapshots (direct_assets, total_assets, total_liabilities, net_worth, investment_value, investment_pnl,
       monthly_income, monthly_expenses, is_manual, snapshot_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    stmt.run(
      assetsTotal.total, totalAssetsWithInvestments, liabilitiesTotal.total, netWorth,
      investmentValue, investmentPnl,
      incomeTotal.total, expenseTotal.total,
      isManual ? 1 : 0
    );
  } catch (err) {
    console.error('Snapshot error:', err.message);
  }
}

// GET all snapshots with optional date filtering
router.get('/', (req, res) => {
  try {
    const db = getDb();
    ensureSnapshotColumns(db);
    const { period } = req.query; // 'daily', 'weekly', 'monthly', 'yearly', or 'all'
    let query = 'SELECT * FROM snapshots';
    const params = [];

    if (period === 'daily') {
      query += " WHERE snapshot_date >= datetime('now', '-30 days')";
    } else if (period === 'weekly') {
      query += " WHERE snapshot_date >= datetime('now', '-90 days')";
    } else if (period === 'monthly') {
      query += " WHERE snapshot_date >= datetime('now', '-12 months')";
    } else if (period === 'yearly') {
      query += " WHERE snapshot_date >= datetime('now', '-5 years')";
    }

    query += ' ORDER BY snapshot_date ASC';
    const items = db.prepare(query).all(...params).map((snapshot) => ({
      ...snapshot,
      direct_assets: Number(snapshot.direct_assets || 0) || Math.max(Number(snapshot.total_assets || 0) - Number(snapshot.investment_value || 0), 0)
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST manual snapshot
router.post('/', async (req, res) => {
  try {
    await takeSnapshot(true);
    const db = getDb();
    ensureSnapshotColumns(db);
    const latest = db.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1').get();
    res.status(201).json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET latest snapshot
router.get('/latest', (req, res) => {
  try {
    const db = getDb();
    ensureSnapshotColumns(db);
    const latest = db.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1').get();
    if (!latest) return res.json(null);

    // Get previous for change calculation
    const prev = db.prepare('SELECT * FROM snapshots WHERE id < ? ORDER BY id DESC LIMIT 1').get(latest.id);

    res.json({
      ...latest,
      prev_net_worth: prev ? prev.net_worth : latest.net_worth,
      net_worth_change: prev ? latest.net_worth - prev.net_worth : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE snapshot
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Snapshot not found' });
    db.prepare('DELETE FROM snapshots WHERE id = ?').run(req.params.id);
    res.json({ message: 'Snapshot deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.takeSnapshot = takeSnapshot;