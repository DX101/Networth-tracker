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
    const { name, category, current_value, currency, interest_rate, minimum_payment, total_emis, remaining_emis, maturity_date, emi_day, date_added, notes } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Liability name is required' });
    if (!category || !String(category).trim()) return res.status(400).json({ error: 'Liability category is required' });
    const stmt = db.prepare(
      'INSERT INTO liabilities (name, category, current_value, currency, interest_rate, minimum_payment, total_emis, remaining_emis, maturity_date, emi_day, date_added, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      name,
      category,
      current_value || 0,
      currency || null,
      interest_rate !== undefined && interest_rate !== '' && interest_rate !== null ? Number(interest_rate) : null,
      minimum_payment !== undefined && minimum_payment !== '' && minimum_payment !== null ? Number(minimum_payment) : null,
      total_emis !== undefined && total_emis !== '' && total_emis !== null ? Number(total_emis) : null,
      remaining_emis !== undefined && remaining_emis !== '' && remaining_emis !== null ? Number(remaining_emis) : null,
      maturity_date || null,
      emi_day !== undefined && emi_day !== '' && emi_day !== null ? Number(emi_day) : null,
      date_added || new Date().toISOString().split('T')[0],
      notes || ''
    );
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
    const { name, category, current_value, currency, interest_rate, minimum_payment, total_emis, remaining_emis, maturity_date, emi_day, date_added, notes } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Liability name cannot be empty' });
    if (category !== undefined && !String(category).trim()) return res.status(400).json({ error: 'Liability category cannot be empty' });
    const existing = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Liability not found' });
    const stmt = db.prepare(
      "UPDATE liabilities SET name=?, category=?, current_value=?, currency=?, interest_rate=?, minimum_payment=?, total_emis=?, remaining_emis=?, maturity_date=?, emi_day=?, date_added=?, notes=?, updated_at=datetime('now') WHERE id=?"
    );
    stmt.run(
      name ?? existing.name,
      category ?? existing.category,
      current_value !== undefined ? (Number(current_value) || 0) : existing.current_value,
      currency !== undefined ? (currency || null) : existing.currency,
      interest_rate !== undefined ? (interest_rate !== '' && interest_rate !== null ? Number(interest_rate) : null) : existing.interest_rate,
      minimum_payment !== undefined ? (minimum_payment !== '' && minimum_payment !== null ? Number(minimum_payment) : null) : existing.minimum_payment,
      total_emis !== undefined ? (total_emis !== '' && total_emis !== null ? Number(total_emis) : null) : existing.total_emis,
      remaining_emis !== undefined ? (remaining_emis !== '' && remaining_emis !== null ? Number(remaining_emis) : null) : existing.remaining_emis,
      maturity_date !== undefined ? (maturity_date || null) : existing.maturity_date,
      emi_day !== undefined ? (emi_day !== '' && emi_day !== null ? Number(emi_day) : null) : existing.emi_day,
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

// POST pay-emi: confirms an EMI payment, calculates interest/principal, deducts balance & remaining EMIs, and logs cashflow
router.post('/:id/pay-emi', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    const { amount, date, syncCashflow } = req.body;
    const payment = Number(amount) || Number(existing.minimum_payment) || 0;
    if (payment <= 0) return res.status(400).json({ error: 'Payment amount must be greater than 0' });

    const balance = Number(existing.current_value) || 0;
    const rate = Number(existing.interest_rate) || 0;
    const monthlyInterest = Math.round((balance * (rate / 100 / 12)) * 100) / 100;
    const principalPaid = Math.max(0, Math.round((payment - monthlyInterest) * 100) / 100);
    const newBalance = Math.max(0, Math.round((balance - principalPaid) * 100) / 100);

    let newRemaining = existing.remaining_emis;
    if (newRemaining !== null && newRemaining !== undefined) {
      newRemaining = Math.max(0, Number(newRemaining) - 1);
    }

    const paymentDate = date || new Date().toISOString().split('T')[0];

    // Update liability
    db.prepare(
      "UPDATE liabilities SET current_value=?, remaining_emis=?, updated_at=datetime('now') WHERE id=?"
    ).run(newBalance, newRemaining, req.params.id);

    // Optionally record in cashflow
    if (syncCashflow !== false) {
      db.prepare(
        'INSERT INTO cashflow (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)'
      ).run('expense', 'EMI/Loan Payments', `EMI Payment - ${existing.name}`, payment, paymentDate);
    }

    await takeSnapshot();

    const updated = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    res.json({
      success: true,
      liability: updated,
      breakdown: {
        payment,
        monthlyInterest,
        principalPaid,
        newBalance,
        remaining_emis: newRemaining
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST foreclose: pays off remaining loan balance in full (or partial settlement) and closes the loan
router.post('/:id/foreclose', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    const { amount, charges, date, syncCashflow, notes } = req.body;
    const balance = Number(existing.current_value) || 0;
    const payoffAmount = amount !== undefined ? Number(amount) : balance;
    const extraCharges = Number(charges) || 0;
    const totalPaid = payoffAmount + extraCharges;
    const payoffDate = date || new Date().toISOString().split('T')[0];

    // Close the liability
    const closeNote = (existing.notes ? existing.notes + ' | ' : '') + `Foreclosed on ${payoffDate} for ₹${payoffAmount}` + (extraCharges > 0 ? ` (Charges: ₹${extraCharges})` : '');
    db.prepare(
      "UPDATE liabilities SET current_value=0, remaining_emis=0, notes=?, updated_at=datetime('now') WHERE id=?"
    ).run(closeNote, req.params.id);

    // Optionally record in cashflow
    if (syncCashflow !== false && totalPaid > 0) {
      db.prepare(
        'INSERT INTO cashflow (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)'
      ).run('expense', 'EMI/Loan Payments', `Loan Foreclosure / Settlement - ${existing.name}`, totalPaid, payoffDate);
    }

    await takeSnapshot();

    const updated = db.prepare('SELECT * FROM liabilities WHERE id = ?').get(req.params.id);
    res.json({ success: true, liability: updated, totalPaid });
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