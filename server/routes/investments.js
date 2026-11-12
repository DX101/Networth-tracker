const express = require('express');
const router = express.Router();
const { getDb, ensureInvestmentColumns } = require('../db');
const { takeSnapshot } = require('./snapshots');

function isFd(category) {
  if (!category) return false;
  const s = String(category).trim().toLowerCase();
  return (
    s === 'fixed deposit (fd)' ||
    s === 'fixed deposit' ||
    s === 'fd' ||
    s.includes('fixed deposit') ||
    s === 'term deposit' ||
    s === 'fd/rd'
  );
}

function isRd(category) {
  if (!category) return false;
  const s = String(category).trim().toLowerCase();
  return (
    s === 'recurring deposit (rd)' ||
    s === 'recurring deposit' ||
    s === 'rd' ||
    s.includes('recurring deposit')
  );
}

function isFdorRd(category) {
  return isFd(category) || isRd(category);
}

// GET all investments
router.get('/', (req, res) => {
  try {
    const db = getDb();
    ensureInvestmentColumns(db);
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
    ensureInvestmentColumns(db);
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
    ensureInvestmentColumns(db);
    const {
      asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes,
      is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker,
      tenure, payout_frequency, receiving_account_id, receiving_account_name, last_interest_date
    } = req.body;

    if (!asset_name || !category) return res.status(400).json({ error: 'Name and Category required' });

    const isFd = isFdorRd(category);
    const finalQty = isFd ? 1 : (quantity || 1);
    const finalTicker = isFd ? '' : (ticker || '');
    const finalCurPrice = (current_price !== undefined && current_price !== null && current_price !== '')
      ? Number(current_price)
      : (isFd ? Number(buy_price || 0) : 0);
    const finalPayout = payout_frequency || (isFd ? 'Payment on Maturity' : '');

    const stmt = db.prepare(`
      INSERT INTO investments (
        asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes,
        is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker,
        tenure, payout_frequency, receiving_account_id, receiving_account_name, last_interest_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      asset_name, category, buy_price || 0, finalCurPrice, finalQty,
      buy_date || new Date().toISOString().split('T')[0], platform || '', notes || '',
      is_sip ? 1 : 0, sip_monthly || 0, interest_rate || 0, maturity_date || null, currency || null, finalTicker,
      tenure || '', finalPayout, receiving_account_id ? Number(receiving_account_id) : null, receiving_account_name || '', last_interest_date || null
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
    ensureInvestmentColumns(db);
    const {
      asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes,
      is_sip, sip_monthly, interest_rate, maturity_date, currency, ticker,
      tenure, payout_frequency, receiving_account_id, receiving_account_name, last_interest_date
    } = req.body;

    const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const isFd = isFdorRd(category ?? existing.category);
    const finalQty = isFd ? 1 : (quantity ?? existing.quantity ?? 1);
    const finalTicker = isFd ? '' : (ticker ?? existing.ticker ?? '');
    const finalCurPrice = current_price ?? existing.current_price;

    const stmt = db.prepare(`
      UPDATE investments SET 
        asset_name = ?, category = ?, buy_price = ?, current_price = ?, 
        quantity = ?, buy_date = ?, platform = ?, notes = ?, is_sip = ?, sip_monthly = ?, interest_rate = ?, maturity_date = ?, currency = ?, ticker = ?,
        tenure = ?, payout_frequency = ?, receiving_account_id = ?, receiving_account_name = ?, last_interest_date = ?, updated_at = datetime('now')
       WHERE id = ?
    `);
    stmt.run(
      asset_name ?? existing.asset_name,
      category ?? existing.category,
      buy_price ?? existing.buy_price,
      finalCurPrice,
      finalQty,
      buy_date ?? existing.buy_date,
      platform ?? existing.platform,
      notes ?? existing.notes,
      is_sip !== undefined ? (is_sip ? 1 : 0) : existing.is_sip,
      sip_monthly ?? existing.sip_monthly,
      interest_rate ?? existing.interest_rate,
      maturity_date ?? existing.maturity_date,
      currency ?? existing.currency,
      finalTicker,
      tenure ?? existing.tenure ?? '',
      payout_frequency ?? existing.payout_frequency ?? 'Payment on Maturity',
      receiving_account_id !== undefined ? (receiving_account_id ? Number(receiving_account_id) : null) : existing.receiving_account_id,
      receiving_account_name ?? existing.receiving_account_name ?? '',
      last_interest_date ?? existing.last_interest_date ?? null,
      req.params.id
    );

    // Sync current_price and ticker to all lots of the same asset_name!
    if (current_price !== undefined && current_price !== existing.current_price) {
       const syncStmt = db.prepare("UPDATE investments SET current_price=?, updated_at=datetime('now') WHERE asset_name=?");
       syncStmt.run(current_price, asset_name ?? existing.asset_name);
    }
    if (ticker !== undefined && ticker !== existing.ticker && !isFd) {
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

// POST record interest payout for FD/RD
router.post('/:id/record-interest', async (req, res) => {
  try {
    const db = getDb();
    ensureInvestmentColumns(db);
    const item = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Investment not found' });

    let { amount, date, account_id, description, adjust_balance } = req.body;

    // Auto-calculate if amount not provided or <= 0
    let amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      const principal = Number(item.buy_price || 0);
      const rate = Number(item.interest_rate || 0);
      const freq = item.payout_frequency || 'Monthly Payout';
      if (freq === 'Quarterly Payout') {
        amt = Number(((principal * (rate / 100)) / 4).toFixed(2));
      } else {
        amt = Number(((principal * (rate / 100)) / 12).toFixed(2));
      }
    }

    if (amt <= 0) {
      return res.status(400).json({ error: 'Interest amount must be greater than 0' });
    }

    const txDate = date || new Date().toISOString().split('T')[0];
    const targetAccountId = account_id || item.receiving_account_id;
    const shouldAdjust = adjust_balance !== false && adjust_balance !== 0 && adjust_balance !== '0';

    let accountName = '';
    if (targetAccountId) {
      const acc = db.prepare('SELECT name FROM assets WHERE id = ?').get(targetAccountId);
      if (acc) accountName = acc.name;
    }

    const txDesc = description || `Interest payout from ${item.asset_name} (${item.payout_frequency || 'Monthly/Quarterly'})`;

    const txResult = db.transaction(() => {
      // 1. Credit target account if requested and target exists
      if (targetAccountId && shouldAdjust) {
        db.prepare("UPDATE assets SET current_value = ROUND(current_value + ?, 2), updated_at = datetime('now') WHERE id = ?")
          .run(amt, targetAccountId);
      }

      // 2. Insert into cashflow
      const cfStmt = db.prepare(`
        INSERT INTO cashflow (
          type, amount, category, date, description, is_recurring, frequency, account_id, adjust_balance
        ) VALUES ('income', ?, 'Interest Income', ?, ?, 0, NULL, ?, ?)
      `);
      const cfResult = cfStmt.run(amt, txDate, txDesc, targetAccountId || null, shouldAdjust ? 1 : 0);

      // 3. Update investment last_interest_date and receiving_account
      db.prepare(`
        UPDATE investments SET 
          last_interest_date = ?, 
          receiving_account_id = COALESCE(?, receiving_account_id),
          receiving_account_name = CASE WHEN ? != '' THEN ? ELSE receiving_account_name END,
          updated_at = datetime('now') 
        WHERE id = ?
      `).run(txDate, targetAccountId || null, accountName, accountName, item.id);

      return { cashflow_id: cfResult.lastInsertRowid };
    })();

    await takeSnapshot();

    res.json({
      success: true,
      message: `Recorded interest of ₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })} successfully${accountName ? ' into ' + accountName : ''}!`,
      amount: amt,
      date: txDate,
      account_id: targetAccountId,
      account_name: accountName,
      last_interest_date: txDate,
      cashflow_id: txResult.cashflow_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST sync prices
router.post('/sync-prices', async (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT ticker, asset_name, currency FROM investments WHERE ticker IS NOT NULL AND ticker != ""').all();
    if (rows.length === 0) return res.json({ message: 'No tickers to sync', updated: 0 });

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
    let rates = {};
    try { rates = JSON.parse(settings.exchange_rates || '{}'); } catch(e) {}
    const usdRate = Number(rates.USD) || 94.0;

    let updatedCount = 0;
    const updateStmt = db.prepare("UPDATE investments SET current_price=?, updated_at=datetime('now') WHERE ticker=? AND (currency=? OR (currency IS NULL AND ?='INR'))");
    
    // Group by ticker to avoid redundant Yahoo Finance requests
    const tickersMap = {};
    for (const r of rows) {
      if (!tickersMap[r.ticker]) tickersMap[r.ticker] = [];
      tickersMap[r.ticker].push(r);
    }

    for (const [ticker, items] of Object.entries(tickersMap)) {
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
          signal: AbortSignal.timeout(4000)
        });
        if (response.ok) {
          const data = await response.json();
          const rawPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          const quoteCurrency = data?.chart?.result?.[0]?.meta?.currency || 'USD';
          if (rawPrice !== undefined && rawPrice !== null) {
            for (const item of items) {
              const itemCur = item.currency || 'INR';
              let finalPrice = rawPrice;
              // If quote is USD and item is tracked in INR:
              if (itemCur === 'INR' && quoteCurrency === 'USD') {
                finalPrice = Number((rawPrice * usdRate).toFixed(2));
              } else if (itemCur === 'USD' && quoteCurrency === 'INR') {
                finalPrice = Number((rawPrice / usdRate).toFixed(4));
              }
              updateStmt.run(finalPrice, ticker, item.currency, item.currency);
              updatedCount++;
            }
          }
        }
      } catch (e) {
        console.error(`Failed to fetch price for ${ticker}`, e);
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