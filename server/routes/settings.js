const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const FALLBACK_RATES = {
  INR: { USD: 93.95, EUR: 102.5, GBP: 121.0, AED: 25.5, CAD: 66.5, SGD: 70.0, JPY: 0.60 },
  USD: { INR: 0.01064, EUR: 1.09, GBP: 1.28, AED: 0.27, CAD: 0.71, SGD: 0.74, JPY: 0.0064 },
  EUR: { USD: 0.917, INR: 0.00975, GBP: 1.17, AED: 0.25 },
  GBP: { USD: 0.781, EUR: 0.854, INR: 0.00826 },
  AED: { USD: 0.272, INR: 0.0392, EUR: 0.297 }
};

// GET settings
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    let settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    
    // Auto-populate exchange rates if null or empty
    if (!settings.exchange_rates || settings.exchange_rates === '{}') {
      const base = settings.currency || 'INR';
      const initialRates = FALLBACK_RATES[base] || { USD: 93.95 };
      const ratesJson = JSON.stringify(initialRates, null, 2);
      db.prepare('UPDATE settings SET exchange_rates = ? WHERE id = 1').run(ratesJson);
      settings.exchange_rates = ratesJson;
    }
    
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
  
  const rates = {};
  for (const sym of symbolList) {
    try {
      const ticker = `${sym}${base}=X`;
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
      if (response.ok) {
        const data = await response.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price !== undefined && price !== null && Number(price) > 0) {
          rates[sym] = price;
          continue;
        }
      }
    } catch (e) {
      console.warn(`Yahoo rate fetch failed for ${sym}${base}=X:`, e.message);
    }
    
    // Smart fallback if Yahoo is unreachable or rate limited
    if (FALLBACK_RATES[base] && FALLBACK_RATES[base][sym]) {
      rates[sym] = FALLBACK_RATES[base][sym];
    }
  }

  // Auto-persist fresh rates to settings in background
  try {
    const db = getDb();
    const existing = db.prepare('SELECT exchange_rates FROM settings WHERE id = 1').get();
    let current = {};
    try { current = JSON.parse(existing?.exchange_rates || '{}'); } catch(e) {}
    const merged = { ...current, ...rates };
    db.prepare('UPDATE settings SET exchange_rates = ? WHERE id = 1').run(JSON.stringify(merged, null, 2));
  } catch (e) {}

  res.json(rates);
});

// PUT update settings
router.put('/', (req, res) => {
  try {
    const db = getDb();
    const { currency, currency_symbol, date_format, app_name, dashboard_layout, exchange_rates, categories, gdrive_client_id, gdrive_client_secret, gdrive_refresh_token, dropbox_client_id, dropbox_client_secret, dropbox_refresh_token } = req.body;
    
    // Update settings
    const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const stmt = db.prepare(
      'UPDATE settings SET currency=?, currency_symbol=?, date_format=?, app_name=?, dashboard_layout=?, exchange_rates=?, gdrive_client_id=?, gdrive_client_secret=?, gdrive_refresh_token=?, dropbox_client_id=?, dropbox_client_secret=?, dropbox_refresh_token=? WHERE id=1'
    );
    stmt.run(
      currency ?? existing.currency,
      currency_symbol ?? existing.currency_symbol,
      date_format ?? existing.date_format,
      app_name ?? existing.app_name,
      dashboard_layout ?? existing.dashboard_layout,
      exchange_rates ?? existing.exchange_rates,
      gdrive_client_id !== undefined ? gdrive_client_id : existing.gdrive_client_id,
      gdrive_client_secret !== undefined ? gdrive_client_secret : existing.gdrive_client_secret,
      gdrive_refresh_token !== undefined ? gdrive_refresh_token : existing.gdrive_refresh_token,
      dropbox_client_id !== undefined ? dropbox_client_id : existing.dropbox_client_id,
      dropbox_client_secret !== undefined ? dropbox_client_secret : existing.dropbox_client_secret,
      dropbox_refresh_token !== undefined ? dropbox_refresh_token : existing.dropbox_refresh_token
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