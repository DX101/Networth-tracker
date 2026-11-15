const express = require('express');
const router = express.Router();
const { getDb, ensureSnapshotColumns } = require('../db');

const FALLBACK_RATES = {
  INR: { USD: 93.95, EUR: 102.5, GBP: 121.0, AED: 25.5, CAD: 66.5, SGD: 70.0, JPY: 0.60 },
  USD: { INR: 0.01064, EUR: 1.09, GBP: 1.28, AED: 0.27, CAD: 0.71, SGD: 0.74, JPY: 0.0064 },
  EUR: { USD: 0.917, INR: 0.00975, GBP: 1.17, AED: 0.25 },
  GBP: { USD: 0.781, EUR: 0.854, INR: 0.00826 },
  AED: { USD: 0.272, INR: 0.0392, EUR: 0.297 }
};

function toBase(amount, fromCurrency, baseCurrency, rates = {}) {
  const num = Number(amount) || 0;
  if (!fromCurrency || fromCurrency === baseCurrency) return num;
  if (rates && rates[fromCurrency] && Number(rates[fromCurrency]) > 0) {
    return num * Number(rates[fromCurrency]);
  }
  if (FALLBACK_RATES[baseCurrency] && FALLBACK_RATES[baseCurrency][fromCurrency]) {
    return num * FALLBACK_RATES[baseCurrency][fromCurrency];
  }
  return num;
}

// Helper function to calculate and store a snapshot for a user
async function takeSnapshot(userIdOrManual = 1, isManualParam = false) {
  let userId = 1;
  let isManual = false;
  if (typeof userIdOrManual === 'boolean') {
    isManual = userIdOrManual;
    userId = 1;
  } else {
    userId = Number(userIdOrManual) || 1;
    isManual = Boolean(isManualParam);
  }

  try {
    const db = getDb();
    ensureSnapshotColumns(db);

    const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId)
      || db.prepare('SELECT * FROM settings LIMIT 1').get()
      || {};
    const baseCur = settings.currency || 'INR';
    let rates = {};
    try { rates = JSON.parse(settings.exchange_rates || '{}'); } catch(e) {}

    const assets = db.prepare('SELECT current_value, currency FROM assets WHERE user_id = ?').all(userId);
    let directAssets = 0;
    for (const a of assets) directAssets += toBase(a.current_value, a.currency, baseCur, rates);

    const liabilities = db.prepare('SELECT current_value, currency FROM liabilities WHERE user_id = ?').all(userId);
    let liabilitiesTotal = 0;
    for (const l of liabilities) liabilitiesTotal += toBase(l.current_value, l.currency, baseCur, rates);

    const investments = db.prepare('SELECT current_price, buy_price, quantity, currency FROM investments WHERE user_id = ?').all(userId);
    let investmentValue = 0;
    let investmentCost = 0;
    for (const inv of investments) {
      investmentValue += toBase((inv.current_price || 0) * (inv.quantity || 0), inv.currency, baseCur, rates);
      investmentCost += toBase((inv.buy_price || 0) * (inv.quantity || 0), inv.currency, baseCur, rates);
    }
    const investmentPnl = investmentValue - investmentCost;

    let insuranceCashValue = 0;
    try {
      const insRow = db.prepare("SELECT COALESCE(SUM(cash_value), 0) as total FROM insurance WHERE status='active' AND user_id = ?").get(userId);
      if (insRow) insuranceCashValue = insRow.total || 0;
    } catch (e) {}

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const incomeTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='income' AND strftime('%Y', date)=? AND strftime('%m', date)=? AND user_id = ?"
    ).get(String(year), month, userId);

    const expenseTotal = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM cashflow WHERE type='expense' AND strftime('%Y', date)=? AND strftime('%m', date)=? AND user_id = ?"
    ).get(String(year), month, userId);

    const totalAssetsWithInvestments = directAssets + investmentValue + insuranceCashValue;
    const netCashflow = (incomeTotal?.total || 0) - (expenseTotal?.total || 0);
    const netWorth = totalAssetsWithInvestments - liabilitiesTotal + netCashflow;

    const stmt = db.prepare(
      `INSERT INTO snapshots (direct_assets, total_assets, total_liabilities, net_worth, investment_value, investment_pnl,
       monthly_income, monthly_expenses, is_manual, snapshot_date, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    );
    stmt.run(
      directAssets, totalAssetsWithInvestments, liabilitiesTotal, netWorth,
      investmentValue, investmentPnl,
      incomeTotal?.total || 0, expenseTotal?.total || 0,
      isManual ? 1 : 0,
      userId
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
    const userId = req.user?.id || 1;
    const { period } = req.query; // 'daily', 'weekly', 'monthly', 'yearly', or 'all'
    let query = 'SELECT * FROM snapshots WHERE user_id = ?';
    const params = [userId];

    if (period === 'daily') {
      query += " AND snapshot_date >= datetime('now', '-30 days')";
    } else if (period === 'weekly') {
      query += " AND snapshot_date >= datetime('now', '-90 days')";
    } else if (period === 'monthly') {
      query += " AND snapshot_date >= datetime('now', '-12 months')";
    } else if (period === 'yearly') {
      query += " AND snapshot_date >= datetime('now', '-5 years')";
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
    const userId = req.user?.id || 1;
    await takeSnapshot(userId, true);
    const db = getDb();
    ensureSnapshotColumns(db);
    const latest = db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
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
    const userId = req.user?.id || 1;
    const latest = db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    if (!latest) return res.json(null);

    // Get previous for change calculation
    const prev = db.prepare('SELECT * FROM snapshots WHERE id < ? AND user_id = ? ORDER BY id DESC LIMIT 1').get(latest.id, userId);

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
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user?.id || 1;
    const existing = db.prepare('SELECT * FROM snapshots WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!existing) return res.status(404).json({ error: 'Snapshot not found' });
    db.prepare('DELETE FROM snapshots WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ message: 'Snapshot deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.takeSnapshot = takeSnapshot;
