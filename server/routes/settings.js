const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET settings
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    
    // Fetch categories and format them
    const catRows = db.prepare('SELECT * FROM categories ORDER BY type, name').all();
    const categories = {};
    for (const c of catRows) {
      if (!categories[c.type]) categories[c.type] = [];
      categories[c.type].push(c.name);
    }
    
    res.json({ settings, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET live rates from Yahoo Finance
router.get('/live-rates', async (req, res) => {
  const { base, symbols } = req.query;
  if (!base || !symbols) {
    return res.status(400).json({ error: 'Missing base or symbols query parameters' });
  }
  
  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s && s !== base);
  if (symbolList.length === 0) return res.json({});
  
  try {
    const rates = {};
    for (const sym of symbolList) {
      const ticker = `${sym}${base}=X`;
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
      if (response.ok) {
        const data = await response.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price !== undefined && price !== null) {
          rates[sym] = price;
        }
      }
    }
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live rates' });
  }
});

// PUT update settings
router.put('/', (req, res) => {
  try {
    const db = getDb();
    const { currency, currency_symbol, date_format, app_name, dashboard_layout, exchange_rates, categories } = req.body;
    
    // Update settings
    const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const stmt = db.prepare(
      'UPDATE settings SET currency=?, currency_symbol=?, date_format=?, app_name=?, dashboard_layout=?, exchange_rates=? WHERE id=1'
    );
    stmt.run(
      currency ?? existing.currency,
      currency_symbol ?? existing.currency_symbol,
      date_format ?? existing.date_format,
      app_name ?? existing.app_name,
      dashboard_layout ?? existing.dashboard_layout,
      exchange_rates ?? existing.exchange_rates
    );

    // If categories object is provided, completely overwrite the categories table
    if (categories && typeof categories === 'object') {
      db.prepare('DELETE FROM categories').run();
      const insertCat = db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)');
      for (const [type, names] of Object.entries(categories)) {
        if (Array.isArray(names)) {
          for (const name of names) {
            insertCat.run(name, type);
          }
        }
      }
    }

    // Return the updated state
    const updatedSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const catRows = db.prepare('SELECT * FROM categories ORDER BY type, name').all();
    const updatedCategories = {};
    for (const c of catRows) {
      if (!updatedCategories[c.type]) updatedCategories[c.type] = [];
      updatedCategories[c.type].push(c.name);
    }
    
    res.json({ settings: updatedSettings, categories: updatedCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;