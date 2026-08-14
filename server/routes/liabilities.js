const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { takeSnapshot } = require('./snapshots');

// GET all liabilities
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare('SELECT * FROM liabilities ORDER BY date_added DESC').all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Liability not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, category, current_value, date_added, notes } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Liability name is required' });
    if (!category || !String(category).trim()) return res.status(400).json({ error: 'Liability category is required' });
    const stmt = db.prepare(
      'INSERT INTO liabilities (name, category, current_value, date_added, notes) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name, category, current_value || 0, date_added || new Date().toISOString().split('T')[0], notes || '');
    await takeSnapshot();
    const item = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { name, category, current_value, date_added, notes } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Liability name cannot be empty' });
    if (category !== undefined && !String(category).trim()) return res.status(400).json({ error: 'Liability category cannot be empty' });
    const existing = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Liability not found' });
    const stmt = db.prepare(
      "UPDATE liabilities SET name=?, category=?, current_value=?, date_added=?, notes=?, updated_at=datetime('now') WHERE id=?"
    );
    stmt.run(
      name ?? existing.name,
      category ?? existing.category,
      current_value ?? existing.current_value,
      date_added ?? existing.date_added,
      notes ?? existing.notes,
      req.params.id
    );
    await takeSnapshot();
    const item = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Liability not found' });
    db.prepare('DELETE FROM liabilities WHERE id = ?').run(req.params.id);
    await takeSnapshot();
    res.json({ message: 'Liability deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;