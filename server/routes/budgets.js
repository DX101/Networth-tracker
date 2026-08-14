const express = require('express');
const router = express.Router();
const { getDb, ensureBudgetColumns } = require('../db');

function getBudgetDb() {
  const db = getDb();
  ensureBudgetColumns(db);
  return db;
}

function decorateBudget(db, budget) {
  if (!budget) return null;
  const expenses = db.prepare('SELECT * FROM budget_expenses WHERE budget_id = ? ORDER BY date DESC, id DESC').all(budget.id);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const limit = Number(budget.monthly_limit || 0);
  return {
    ...budget,
    expenses,
    spent,
    remaining: limit - spent,
    percent_used: limit > 0 ? (spent / limit) * 100 : 0,
  };
}

function getBudgetByInsertResult(db, result, payload) {
  const byId = result?.lastInsertRowid
    ? db.prepare('SELECT * FROM budgets WHERE id = ?').get(result.lastInsertRowid)
    : null;
  if (byId) return byId;

  return db.prepare(
    'SELECT * FROM budgets WHERE category = ? AND month IS ? AND year IS ? ORDER BY id DESC LIMIT 1'
  ).get(payload.category, payload.month || null, payload.year || null);
}

// GET all budgets, optionally filtered by month/year/date overlap
router.get('/', (req, res) => {
  try {
    const db = getBudgetDb();
    const { month, year, from, to } = req.query;
    let query = 'SELECT * FROM budgets WHERE 1=1';
    const params = [];

    if (month) { query += ' AND month = ?'; params.push(Number(month)); }
    if (year)  { query += ' AND year = ?';  params.push(Number(year)); }
    if (from) { query += ' AND (end_date IS NULL OR end_date >= ?)'; params.push(from); }
    if (to) { query += ' AND (start_date IS NULL OR start_date <= ?)'; params.push(to); }

    query += ' ORDER BY created_at DESC, id DESC';
    const items = db.prepare(query).all(...params).map((item) => decorateBudget(db, item));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single budget
router.get('/:id', (req, res) => {
  try {
    const db = getBudgetDb();
    const item = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Budget not found' });
    res.json(decorateBudget(db, item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a budget
router.post('/', (req, res) => {
  try {
    const db = getBudgetDb();
    const { category, monthly_limit, month, year, start_date, end_date, notes } = req.body;
    if (!category || !String(category).trim()) return res.status(400).json({ error: 'Budget category is required' });
    const payload = {
      category: String(category).trim(),
      monthly_limit: monthly_limit || 0,
      month: month || null,
      year: year || null,
      start_date: start_date || null,
      end_date: end_date || null,
      notes: notes || ''
    };
    const stmt = db.prepare(
      'INSERT INTO budgets (category, monthly_limit, month, year, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(payload.category, payload.monthly_limit, payload.month, payload.year, payload.start_date, payload.end_date, payload.notes);
    const item = getBudgetByInsertResult(db, result, payload);
    if (!item) return res.status(500).json({ error: 'Budget was saved, but could not be reloaded' });
    res.status(201).json(decorateBudget(db, item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update a budget
router.put('/:id', (req, res) => {
  try {
    const db = getBudgetDb();
    const { category, monthly_limit, month, year, start_date, end_date, notes } = req.body;
    const existing = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Budget not found' });

    const stmt = db.prepare(
      "UPDATE budgets SET category=?, monthly_limit=?, month=?, year=?, start_date=?, end_date=?, notes=?, updated_at=datetime('now') WHERE id=?"
    );
    stmt.run(
      category ?? existing.category,
      monthly_limit ?? existing.monthly_limit,
      month ?? existing.month,
      year ?? existing.year,
      start_date ?? existing.start_date,
      end_date ?? existing.end_date,
      notes ?? existing.notes,
      req.params.id
    );
    const item = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!item) return res.status(500).json({ error: 'Budget was updated, but could not be reloaded' });
    res.json(decorateBudget(db, item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a budget
router.delete('/:id', (req, res) => {
  try {
    const db = getBudgetDb();
    const existing = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Budget not found' });
    db.prepare('DELETE FROM budget_expenses WHERE budget_id = ?').run(req.params.id);
    db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
    res.json({ message: 'Budget deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST expense under budget
router.post('/:id/expenses', (req, res) => {
  try {
    const db = getBudgetDb();
    const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const { title, amount, date, notes } = req.body;
    const result = db.prepare('INSERT INTO budget_expenses (budget_id, title, amount, date, notes) VALUES (?, ?, ?, ?, ?)').run(req.params.id, title, amount || 0, date || new Date().toISOString().split('T')[0], notes || '');
    const item = db.prepare('SELECT * FROM budget_expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE expense under budget
router.delete('/:id/expenses/:expenseId', (req, res) => {
  try {
    const db = getBudgetDb();
    const existing = db.prepare('SELECT * FROM budget_expenses WHERE id = ? AND budget_id = ?').get(req.params.expenseId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Budget expense not found' });
    db.prepare('DELETE FROM budget_expenses WHERE id = ?').run(req.params.expenseId);
    res.json({ message: 'Budget expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET planner summary for a specific month/year
router.get('/summary/:year/:month', (req, res) => {
  try {
    const db = getBudgetDb();
    const { year, month } = req.params;
    const m = String(month).padStart(2, '0');
    const y = String(year);

    const monthStart = `${y}-${m}-01`;
    const monthEnd = `${y}-${m}-31`;
    const budgets = db.prepare(
      'SELECT * FROM budgets WHERE (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?) ORDER BY created_at DESC'
    ).all(monthEnd, monthStart).map((budget) => decorateBudget(db, budget));

    const totalBudget = budgets.reduce((s, b) => s + Number(b.monthly_limit || 0), 0);
    const totalSpent = budgets.reduce((s, b) => s + Number(b.spent || 0), 0);

    res.json({
      year: Number(year),
      month: Number(month),
      total_budget: totalBudget,
      total_spent: totalSpent,
      total_remaining: totalBudget - totalSpent,
      percent_used: totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0,
      categories: budgets
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;