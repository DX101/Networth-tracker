const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET all goals, with contributions
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const goals = db.prepare('SELECT * FROM goals ORDER BY target_date ASC, created_at DESC').all();
    
    // For each goal, if it's linked to an asset, dynamically update current_amount
    for (let goal of goals) {
      if (goal.linked_asset_id) {
        const asset = db.prepare('SELECT current_value FROM assets WHERE id = ?').get(goal.linked_asset_id);
        if (asset) {
          goal.current_amount = asset.current_value;
          // Optionally, persist this update to db:
          // db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').run(goal.current_amount, goal.id);
        }
      }
      
      const contributions = db.prepare('SELECT * FROM goal_contributions WHERE goal_id = ? ORDER BY date DESC').all(goal.id);
      goal.contributions = contributions;
    }

    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new goal
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, target_amount, current_amount = 0, target_date, color, icon, linked_asset_id } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Goal name is required' });
    if (target_amount === undefined || target_amount === null || target_amount === '') return res.status(400).json({ error: 'Target amount is required' });
    
    const stmt = db.prepare(
      'INSERT INTO goals (name, target_amount, current_amount, target_date, color, icon, linked_asset_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(name, target_amount, current_amount, target_date, color, icon, linked_asset_id);
    
    const newGoal = db.prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid);
    res.json(newGoal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update goal
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, target_amount, current_amount, target_date, color, icon, linked_asset_id } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Goal name cannot be empty' });
    if (target_amount !== undefined && (target_amount === null || target_amount === '')) return res.status(400).json({ error: 'Target amount cannot be empty' });
    
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    const stmt = db.prepare(
      'UPDATE goals SET name=?, target_amount=?, current_amount=?, target_date=?, color=?, icon=?, linked_asset_id=? WHERE id=?'
    );
    stmt.run(
      name ?? existing.name,
      target_amount ?? existing.target_amount,
      current_amount ?? existing.current_amount,
      target_date ?? existing.target_date,
      color ?? existing.color,
      icon ?? existing.icon,
      linked_asset_id !== undefined ? linked_asset_id : existing.linked_asset_id,
      req.params.id
    );
    
    const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE goal
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    // Delete contributions first
    db.prepare('DELETE FROM goal_contributions WHERE goal_id = ?').run(req.params.id);
    db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST contribute to goal
router.post('/:id/contribute', (req, res) => {
  try {
    const db = getDb();
    const goal_id = req.params.id;
    const { amount, date, notes } = req.body;
    
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal_id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.linked_asset_id) return res.status(400).json({ error: 'Cannot manually contribute to a goal linked to an asset' });

    // Add contribution
    const stmt = db.prepare('INSERT INTO goal_contributions (goal_id, amount, date, notes) VALUES (?, ?, ?, ?)');
    stmt.run(goal_id, amount, date || new Date().toISOString().split('T')[0], notes || '');

    // Update goal current_amount
    const newAmount = (goal.current_amount || 0) + parseFloat(amount);
    db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').run(newAmount, goal_id);
    
    const updatedGoal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal_id);
    res.json(updatedGoal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
