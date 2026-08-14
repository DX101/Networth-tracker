const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all active subscriptions
router.get('/', (req, res) => {
  try {
    const subs = db.getDb().prepare('SELECT * FROM subscriptions WHERE active = 1 ORDER BY next_due_date ASC').all();
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new subscription
router.post('/', (req, res) => {
  try {
    const { name, amount, category, frequency, next_due_date } = req.body;
    if (!name || !amount || !category || !frequency || !next_due_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const info = db.getDb().prepare(`
      INSERT INTO subscriptions (name, amount, category, frequency, next_due_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, amount, category, frequency, next_due_date);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a subscription
router.put('/:id', (req, res) => {
  try {
    const { name, amount, category, frequency, next_due_date } = req.body;
    db.getDb().prepare(`
      UPDATE subscriptions 
      SET name = ?, amount = ?, category = ?, frequency = ?, next_due_date = ?
      WHERE id = ?
    `).run(name, amount, category, frequency, next_due_date, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a subscription
router.delete('/:id', (req, res) => {
  try {
    db.getDb().prepare('UPDATE subscriptions SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process due subscriptions (Auto-inject into cashflow)
router.post('/process', (req, res) => {
  try {
    const dueSubs = db.getDb().prepare(`
      SELECT * FROM subscriptions 
      WHERE active = 1 AND date(next_due_date) <= date('now')
    `).all();

    let injectedCount = 0;

    const injectTx = db.getDb().transaction((subs) => {
      for (const sub of subs) {
        // Inject into cashflow (Expense)
        db.getDb().prepare(`
          INSERT INTO cashflow (type, amount, category, date, description, is_recurring, frequency) 
          VALUES ('expense', ?, ?, ?, ?, 1, ?)
        `).run(sub.amount, sub.category, sub.next_due_date, `Auto-paid: ${sub.name}`, sub.frequency);
        
        // Calculate next due date
        // Note: SQLite date() function handles adding months/years
        let nextDueModifier = '+1 month';
        if (sub.frequency === 'yearly') nextDueModifier = '+1 year';
        if (sub.frequency === 'weekly') nextDueModifier = '+7 days';
        
        // Ensure we advance it to the next future date (in case they haven't opened the app in 3 months, we need to loop until it's in the future)
        db.getDb().prepare(`
          WITH RECURSIVE
            next_dates(d) AS (
              SELECT date(?, ?)
              UNION ALL
              SELECT date(d, ?) FROM next_dates WHERE date(d) <= date('now')
            )
          UPDATE subscriptions SET next_due_date = (SELECT MAX(d) FROM next_dates) WHERE id = ?
        `).run(sub.next_due_date, nextDueModifier, nextDueModifier, sub.id);
        
        injectedCount++;
      }
    });

    injectTx(dueSubs);
    res.json({ success: true, processed: injectedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
