const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET all categories, optionally filtered by type
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { type } = req.query;
    let query = 'SELECT * FROM categories';
    const params = [];
    if (type) {
      // Support comma-separated types: "income,expense"
      const types = type.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        query += ' WHERE type IN (' + types.map(() => '?').join(',') + ')';
        params.push(...types);
      }
    }
    query += ' ORDER BY type, name';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single category
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Category not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create category
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    const validTypes = ['asset', 'liability', 'income', 'expense', 'investment'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type. Must be: ' + validTypes.join(', ') });

    // Prevent duplicate
    const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
    if (existing) return res.status(409).json({ error: 'Category already exists' });

    const result = db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(name, type);
    const item = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update category
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    const { name, type } = req.body;
    const newName = name ?? existing.name;
    const newType = type ?? existing.type;
    db.prepare('UPDATE categories SET name = ?, type = ? WHERE id = ?').run(newName, newType, req.params.id);
    const item = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE category
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;