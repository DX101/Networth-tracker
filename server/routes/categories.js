const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET all categories (system defaults + user's custom), optionally filtered by type
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user?.id || 1;
    const { type } = req.query;
    let query = 'SELECT * FROM categories WHERE (user_id = ? OR user_id IS NULL)';
    const params = [userId];
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length > 0) {
        query += ' AND type IN (' + types.map(() => '?').join(',') + ')';
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
    const userId = req.user?.id || 1;
    const item = db.prepare('SELECT * FROM categories WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(req.params.id, userId);
    if (!item) return res.status(404).json({ error: 'Category not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create custom category
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user?.id || 1;
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    const validTypes = ['asset', 'liability', 'income', 'expense', 'investment', 'transfer'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type. Must be: ' + validTypes.join(', ') });

    // Prevent duplicate within user's view
    const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ? AND (user_id = ? OR user_id IS NULL)').get(name, type, userId);
    if (existing) return res.status(409).json({ error: 'Category already exists' });

    const result = db.prepare('INSERT INTO categories (name, type, user_id) VALUES (?, ?, ?)').run(name, type, userId);
    const item = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update category (only custom categories owned by this user)
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user?.id || 1;
    const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!existing) return res.status(404).json({ error: 'Category not found or is a default system category' });
    const { name, type } = req.body;
    const newName = name ?? existing.name;
    const newType = type ?? existing.type;
    db.prepare('UPDATE categories SET name = ?, type = ? WHERE id = ? AND user_id = ?').run(newName, newType, req.params.id, userId);
    const item = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE category (only custom categories owned by this user)
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.user?.id || 1;
    const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!existing) return res.status(404).json({ error: 'Category not found or cannot delete system category' });
    db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
