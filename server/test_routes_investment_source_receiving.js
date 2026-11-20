const http = require('http');
const express = require('express');
const { initDb, getDb, ensureInvestmentColumns } = require('./db');
const investmentsRouter = require('./routes/investments');
const assetsRouter = require('./routes/assets');
const cashflowRouter = require('./routes/cashflow');

async function testApiRoutes() {
  await initDb();
  const db = getDb();
  ensureInvestmentColumns(db);

  const app = express();
  app.use(express.json());
  // Mock auth middleware
  app.use((req, res, next) => {
    req.user = { id: 8888, username: 'testuser_invest' };
    next();
  });
  app.use('/api/investments', investmentsRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/cashflow', cashflowRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const userId = 8888;
  db.prepare('DELETE FROM investments WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM cashflow WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM assets WHERE user_id = ?').run(userId);

  try {
    // 1. Create source asset & receiving asset via API
    const srcRes = await fetch(`${baseUrl}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ICICI Bank', category: 'Bank Accounts', current_value: 50000 })
    });
    const srcAccount = await srcRes.json();

    const recRes = await fetch(`${baseUrl}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Groww Demat', category: 'Trading / Brokerage Account', current_value: 10000 })
    });
    const recAccount = await recRes.json();

    console.log(`Created ICICI Bank (id=${srcAccount.id}, bal=50000) and Groww Demat (id=${recAccount.id}, bal=10000)`);

    // 2. Buy Stock via POST /api/investments: 5 shares of Tata Motors @ ₹800 = ₹4,000
    // With source_account_id, deduct_from_source = true, receiving_account_id
    const buyRes = await fetch(`${baseUrl}/investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_name: 'Tata Motors',
        category: 'Stocks',
        buy_price: 800,
        current_price: 800,
        quantity: 5,
        buy_date: '2026-11-20',
        platform: 'Groww',
        source_account_id: srcAccount.id,
        deduct_from_source: true,
        receiving_account_id: recAccount.id
      })
    });
    const investment = await buyRes.json();
    console.log('Created Investment:', investment.asset_name, 'from:', investment.source_account_name, 'to:', investment.receiving_account_name);

    if (investment.source_account_name !== 'ICICI Bank') throw new Error('source_account_name not populated');
    if (investment.receiving_account_name !== 'Groww Demat') throw new Error('receiving_account_name not populated');

    // Verify source asset was debited (50000 - 4000 = 46000)
    const checkSrc = await (await fetch(`${baseUrl}/assets/${srcAccount.id}`)).json();
    if (checkSrc.current_value !== 46000) throw new Error(`Source balance expected 46000, got ${checkSrc.current_value}`);
    console.log('✓ Source account debited properly to ₹46,000');

    // Verify Cashflow record exists
    const cfList = await (await fetch(`${baseUrl}/cashflow`)).json();
    const purchaseCf = cfList.find(c => c.account_id === srcAccount.id);
    if (!purchaseCf || purchaseCf.amount !== 4000 || purchaseCf.type !== 'expense') {
      throw new Error('Cashflow purchase entry not found or incorrect');
    }
    console.log('✓ Cashflow expense recorded for ₹4,000');

    // 3. Record Dividend: ₹500 via POST /api/investments/:id/record-dividend
    const divRes = await fetch(`${baseUrl}/investments/${investment.id}/record-dividend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 500,
        date: '2026-11-20',
        account_id: recAccount.id,
        adjust_balance: true
      })
    });
    const divResult = await divRes.json();
    console.log('Dividend result:', divResult.message);

    // Verify Groww Demat balance credited (10000 + 500 = 10500)
    const checkRec = await (await fetch(`${baseUrl}/assets/${recAccount.id}`)).json();
    if (checkRec.current_value !== 10500) throw new Error(`Receiving balance expected 10500, got ${checkRec.current_value}`);
    console.log('✓ Receiving account credited with dividend to ₹10,500');

    // 4. Sell 2 shares @ ₹900 = ₹1,800 via POST /api/investments/:id/sell
    const sellRes = await fetch(`${baseUrl}/investments/${investment.id}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity_sold: 2,
        sale_price: 900,
        date: '2026-11-20',
        account_id: recAccount.id,
        adjust_balance: true
      })
    });
    const sellResult = await sellRes.json();
    console.log('Sell result:', sellResult.message);

    // Verify Groww Demat balance credited with sale proceeds (10500 + 1800 = 12300)
    const checkRec2 = await (await fetch(`${baseUrl}/assets/${recAccount.id}`)).json();
    if (checkRec2.current_value !== 12300) throw new Error(`Receiving balance expected 12300, got ${checkRec2.current_value}`);
    console.log('✓ Receiving account credited with sale proceeds to ₹12,300');

    // Verify remaining shares on investment = 3
    const checkInv = await (await fetch(`${baseUrl}/investments/${investment.id}`)).json();
    if (checkInv.quantity !== 3) throw new Error(`Expected remaining quantity 3, got ${checkInv.quantity}`);
    console.log('✓ Investment lot quantity reduced to 3');

    console.log('\nEXPRESS API ROUTE TESTS PASSED 100%!');
  } finally {
    // Cleanup
    db.prepare('DELETE FROM investments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cashflow WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM assets WHERE user_id = ?').run(userId);
    server.close();
  }
}

testApiRoutes().catch(err => {
  console.error('API Test Failed:', err);
  process.exit(1);
});
