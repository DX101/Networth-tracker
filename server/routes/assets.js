const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { takeSnapshot } = require('./snapshots');

// GET all assets
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const assets = db.prepare('SELECT * FROM assets ORDER BY date_added DESC').all();
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single asset
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create asset
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, category, current_value, currency, date_added, notes } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Asset name is required' });
    if (!category || !String(category).trim()) return res.status(400).json({ error: 'Asset category is required' });
    const stmt = db.prepare(
      'INSERT INTO assets (name, category, current_value, currency, date_added, notes) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name, category, current_value || 0, currency || null, date_added || new Date().toISOString().split('T')[0], notes || '');
    await takeSnapshot();
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update asset
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { name, category, current_value, currency, date_added, notes } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Asset name cannot be empty' });
    if (category !== undefined && !String(category).trim()) return res.status(400).json({ error: 'Asset category cannot be empty' });
    const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Asset not found' });
    const stmt = db.prepare(
      "UPDATE assets SET name=?, category=?, current_value=?, currency=?, date_added=?, notes=?, updated_at=datetime('now') WHERE id=?"
    );
    stmt.run(
      name ?? existing.name,
      category ?? existing.category,
      current_value !== undefined ? (Number(current_value) || 0) : existing.current_value,
      currency !== undefined ? (currency || null) : existing.currency,
      date_added ?? existing.date_added,
      notes ?? existing.notes,
      req.params.id
    );
    await takeSnapshot();
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE asset
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Asset not found' });
    db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
    await takeSnapshot();
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;