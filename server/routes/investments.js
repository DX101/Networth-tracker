const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { takeSnapshot } = require('./snapshots');

// GET all investments
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare('SELECT * FROM investments ORDER BY buy_date DESC').all();
    // Calculate computed fields
    const enriched = items.map(item => ({
      ...item,
      invested_amount: item.buy_price * item.quantity,
      current_value: item.current_price * item.quantity,
      pnl: (item.current_price - item.buy_price) * item.quantity,
      pnl_percent: item.buy_price > 0 ? ((item.current_price - item.buy_price) / item.buy_price * 100) : 0
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Investment not found' });
    res.json({
      ...item,
      invested_amount: item.buy_price * item.quantity,
      current_value: item.current_price * item.quantity,
      pnl: (item.current_price - item.buy_price) * item.quantity,
      pnl_percent: item.buy_price > 0 ? ((item.current_price - item.buy_price) / item.buy_price * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes, is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker } = req.body;
    if (!asset_name || !category) return res.status(400).json({ error: 'Name and Category required' });
    const stmt = db.prepare(
      'INSERT INTO investments (asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes, is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      asset_name, category, buy_price || 0, current_price || 0, quantity || 1,
      buy_date || new Date().toISOString().split('T')[0], platform || '', notes || '',
      is_sip ? 1 : 0, sip_monthly || 0, interest_rate || 0, maturity_date || null, currency || null, ticker || ''
    );
    await takeSnapshot();
    const item = db.prepare('SELECT * FROM investments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes, is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker } = req.body;
    const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    
    const stmt = db.prepare(
      `UPDATE investments SET 
        asset_name = ?, category = ?, buy_price = ?, current_price = ?, 
        quantity = ?, buy_date = ?, platform = ?, notes = ?, is_sip = ?, sip_monthly = ?, interest_rate = ?, maturity_date = ?, currency = ?, ticker = ?
       WHERE id = ?`
    );
    stmt.run(
      asset_name ?? existing.asset_name,
      category ?? existing.category,
      buy_price ?? existing.buy_price,
      current_price ?? existing.current_price,
      quantity ?? existing.quantity,
      buy_date ?? existing.buy_date,
      platform ?? existing.platform,
      notes ?? existing.notes,
      is_sip !== undefined ? (is_sip ? 1 : 0) : existing.is_sip,
      sip_monthly ?? existing.sip_monthly,
      interest_rate ?? existing.interest_rate,
      maturity_date ?? existing.maturity_date,
      currency ?? existing.currency,
      ticker ?? existing.ticker,
      req.params.id
    );

    // Sync current_price and ticker to all lots of the same asset_name!
    if (current_price !== undefined && current_price !== existing.current_price) {
       const syncStmt = db.prepare("UPDATE investments SET current_price=?, updated_at=datetime('now') WHERE asset_name=?");
       syncStmt.run(current_price, asset_name ?? existing.asset_name);
    }
    if (ticker !== undefined && ticker !== existing.ticker) {
       const syncStmt = db.prepare("UPDATE investments SET ticker=?, updated_at=datetime('now') WHERE asset_name=?");
       syncStmt.run(ticker, asset_name ?? existing.asset_name);
    }

    await takeSnapshot();
    const item = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync prices
router.post('/sync-prices', async (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT ticker, asset_name FROM investments WHERE ticker IS NOT NULL AND ticker != ""').all();
    if (rows.length === 0) return res.json({ message: 'No tickers to sync', updated: 0 });

    let updatedCount = 0;
    const updateStmt = db.prepare("UPDATE investments SET current_price=?, updated_at=datetime('now') WHERE ticker=?");
    
    for (const row of rows) {
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${row.ticker}`);
        if (response.ok) {
          const data = await response.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price !== undefined && price !== null) {
            updateStmt.run(price, row.ticker);
            updatedCount++;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch price for ${row.ticker}`, e);
      }
    }
    
    if (updatedCount > 0) {
      await takeSnapshot();
    }
    
    res.json({ message: 'Sync complete', updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Investment not found' });
    db.prepare('DELETE FROM investments WHERE id = ?').run(req.params.id);
    await takeSnapshot();
    res.json({ message: 'Investment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;