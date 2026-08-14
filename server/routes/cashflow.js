const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { takeSnapshot } = require('./snapshots');

// GET all cashflow entries, with optional filters
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { type, category, month, year } = req.query;
    let query = 'SELECT * FROM cashflow WHERE 1=1';
    const params = [];

    if (type) { query += ' AND type = ?'; params.push(type); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (month) { query += " AND strftime('%m', date) = ?"; params.push(String(month).padStart(2, '0')); }
    if (year) { query += " AND strftime('%Y', date) = ?"; params.push(String(year)); }

    query += ' ORDER BY date DESC';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Cashflow entry not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { type, amount, category, date, description, is_recurring, frequency } = req.body;
    if (!type || !String(type).trim()) return res.status(400).json({ error: 'Cashflow type is required' });
    if (!category || !String(category).trim()) return res.status(400).json({ error: 'Cashflow category is required' });
    const stmt = db.prepare(
      'INSERT INTO cashflow (type, amount, category, date, description, is_recurring, frequency) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      type, amount || 0, category, date || new Date().toISOString().split('T')[0],
      description || '', is_recurring ? 1 : 0, frequency || null
    );
    await takeSnapshot();
    const item = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import Cashflow
router.post('/bulk', (req, res) => {
  try {
    const db = getDb();
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions must be a non-empty array' });
    }
    const insert = db.prepare('INSERT INTO cashflow (type, amount, category, date, description) VALUES (?, ?, ?, ?, ?)');
    for (const tx of transactions) {
      insert.run(tx.type, tx.amount, tx.category, tx.date, tx.description || '');
    }
    res.json({ success: true, count: transactions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { type, amount, category, date, description, is_recurring, frequency } = req.body;
    if (type !== undefined && !String(type).trim()) return res.status(400).json({ error: 'Cashflow type cannot be empty' });
    if (category !== undefined && !String(category).trim()) return res.status(400).json({ error: 'Cashflow category cannot be empty' });
    const existing = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cashflow entry not found' });
    const stmt = db.prepare(
      "UPDATE cashflow SET type=?, amount=?, category=?, date=?, description=?, is_recurring=?, frequency=?, updated_at=datetime('now') WHERE id=?"
    );
    stmt.run(
      type ?? existing.type,
      amount ?? existing.amount,
      category ?? existing.category,
      date ?? existing.date,
      description ?? existing.description,
      is_recurring !== undefined ? (is_recurring ? 1 : 0) : existing.is_recurring,
      frequency !== undefined ? frequency : existing.frequency,
      req.params.id
    );
    await takeSnapshot();
    const item = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM cashflow WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cashflow entry not found' });
    db.prepare('DELETE FROM cashflow WHERE id = ?').run(req.params.id);
    await takeSnapshot();
    res.json({ message: 'Cashflow entry deleted' });
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

    res.json({
      year: Number(year), month: Number(month),
      total_income: income.total,
      total_expenses: expenses.total,
      net_cashflow: income.total - expenses.total,
      savings_rate: income.total > 0 ? ((income.total - expenses.total) / income.total * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;