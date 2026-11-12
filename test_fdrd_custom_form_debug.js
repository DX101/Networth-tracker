const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

// Set isolated test directory
const TEST_DIR = path.join(__dirname, 'test_temp_fdrd_dir');
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;

const { initDb, getDb, ensureInvestmentColumns } = require('./server/db');

async function runTests() {
  console.log('====================================================');
  console.log('--- STARTING FD / RD CUSTOM FORM & INTEREST TEST ---');
  console.log('====================================================');

  const db = await initDb();
  ensureInvestmentColumns(db);
  console.log('✓ Database initialized in test mode at:', path.join(TEST_DIR, 'networth.db'));

  // Setup Express App
  const app = express();
  app.use(express.json());

  // Mock authentication & settings middleware
  app.use((req, res, next) => {
    req.userId = 1;
    next();
  });

  const investmentsRouter = require('./server/routes/investments');
  const cashflowRouter = require('./server/routes/cashflow');
  const assetsRouter = require('./server/routes/assets');
  app.use('/api/investments', investmentsRouter);
  app.use('/api/cashflow', cashflowRouter);
  app.use('/api/assets', assetsRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3299, resolve));
  console.log('✓ Test HTTP Server listening on port 3299');

  const request = async (path, options = {}) => {
    const res = await fetch(`http://localhost:3299/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  };

  try {
    // 1. Create a Bank Account in Assets
    console.log('\n[Test 1] Creating linked bank account in Assets...');
    const bankRes = await request('/assets', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Kotak Mahindra Bank',
        category: 'Bank Accounts',
        current_value: 500000
      })
    });
    if (!bankRes.ok) throw new Error('Failed to create bank account: ' + JSON.stringify(bankRes.data));
    const bankId = bankRes.data.id;
    console.log(`✓ Bank Account created: ${bankRes.data.name} (Balance: ₹${bankRes.data.current_value}, ID: ${bankId})`);

    // 2. Create FD investment
    console.log('\n[Test 2] Creating FD with specialized FD/RD parameters...');
    const fdRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'HDFC 1-Year Fixed Deposit',
        category: 'FD/RD',
        buy_price: 200000,
        interest_rate: 7.5,
        buy_date: '2026-11-12',
        maturity_date: '2027-11-12',
        tenure: '1 Year',
        payout_frequency: 'Monthly Payout',
        receiving_account_id: bankId,
        receiving_account_name: 'Kotak Mahindra Bank',
        platform: 'HDFC NetBanking',
        notes: 'Annual FD at 7.5%'
      })
    });

    if (!fdRes.ok) throw new Error('Failed to create FD: ' + JSON.stringify(fdRes.data));
    const fd = fdRes.data;
    console.log('Created FD:', {
      id: fd.id,
      name: fd.asset_name,
      category: fd.category,
      invested: fd.buy_price,
      current_value: fd.current_price,
      quantity: fd.quantity,
      ticker: fd.ticker,
      tenure: fd.tenure,
      payout_frequency: fd.payout_frequency,
      receiving_account: fd.receiving_account_name
    });

    if (fd.quantity !== 1) throw new Error(`Expected quantity 1 for FD, got ${fd.quantity}`);
    if (fd.ticker !== '') throw new Error(`Expected empty ticker for FD, got ${fd.ticker}`);
    if (fd.current_price !== 200000) throw new Error(`Expected current_price 200000 for FD, got ${fd.current_price}`);
    if (fd.payout_frequency !== 'Monthly Payout') throw new Error(`Expected Monthly Payout, got ${fd.payout_frequency}`);
    console.log('✓ Test 2 Passed: FD created with correct defaults (Quantity=1, Ticker="", Current Value=200000).');

    // 3. Test Recording Monthly Interest
    console.log('\n[Test 3] Recording Monthly Interest Payout for FD...');
    // ₹2,00,000 * 7.5% / 12 = ₹1,250
    const interestRes = await request(`/investments/${fd.id}/record-interest`, {
      method: 'POST',
      body: JSON.stringify({
        account_id: bankId,
        adjust_balance: true
      })
    });

    if (!interestRes.ok) throw new Error('Failed to record interest: ' + JSON.stringify(interestRes.data));
    console.log('Record Interest Response:', interestRes.data);
    if (interestRes.data.amount !== 1250) throw new Error(`Expected interest ₹1250, got ₹${interestRes.data.amount}`);

    // Verify bank account balance was incremented: 500000 + 1250 = 501250
    const bankCheck = await request(`/assets/${bankId}`);
    console.log(`Bank Account Balance after interest: ₹${bankCheck.data.current_value}`);
    if (bankCheck.data.current_value !== 501250) {
      throw new Error(`Expected bank balance ₹501,250, got ₹${bankCheck.data.current_value}`);
    }

    // Verify Cashflow entry created
    const cfList = await request(`/cashflow?account_id=${bankId}`);
    const interestTx = cfList.data.find(tx => tx.category === 'Interest Income');
    if (!interestTx) throw new Error('Interest transaction not found in cashflow!');
    console.log('Created Cashflow Transaction:', {
      type: interestTx.type,
      category: interestTx.category,
      amount: interestTx.amount,
      description: interestTx.description,
      date: interestTx.date
    });
    if (interestTx.amount !== 1250) throw new Error(`Expected cashflow amount 1250, got ${interestTx.amount}`);

    // Verify investment last_interest_date was recorded
    const fdCheck = await request(`/investments/${fd.id}`);
    console.log(`FD last_interest_date: ${fdCheck.data.last_interest_date}`);
    if (!fdCheck.data.last_interest_date) throw new Error('Expected last_interest_date to be updated!');
    console.log('✓ Test 3 Passed: Interest recorded, bank balance credited, cashflow added, and investment updated.');

    // 4. Test Recurring Deposit (RD) with Quarterly Payout
    console.log('\n[Test 4] Creating RD with Quarterly Payout...');
    const rdRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'SBI Recurring Deposit',
        category: 'RD',
        buy_price: 100000,
        interest_rate: 8.0,
        tenure: '2 Years',
        payout_frequency: 'Quarterly Payout',
        receiving_account_id: bankId,
        is_sip: 1,
        sip_monthly: 5000
      })
    });
    if (!rdRes.ok) throw new Error('Failed to create RD: ' + JSON.stringify(rdRes.data));
    const rd = rdRes.data;
    console.log('Created RD:', {
      id: rd.id,
      name: rd.asset_name,
      tenure: rd.tenure,
      payout: rd.payout_frequency,
      is_sip: rd.is_sip
    });
    // Record quarterly interest: 100000 * 8% / 4 = 2000
    const qInterestRes = await request(`/investments/${rd.id}/record-interest`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (!qInterestRes.ok) throw new Error('Failed to record quarterly interest: ' + JSON.stringify(qInterestRes.data));
    console.log('Quarterly Interest Response:', qInterestRes.data);
    if (qInterestRes.data.amount !== 2000) throw new Error(`Expected ₹2000 quarterly interest, got ₹${qInterestRes.data.amount}`);
    console.log('✓ Test 4 Passed: RD with Quarterly Payout calculated and recorded ₹2,000 correctly.');

    // 5. Verify Non-FD/RD investments (e.g. Stocks) are completely unaffected
    console.log('\n[Test 5] Verifying Standard Stock investment remains unaffected...');
    const stockRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'Apple Inc.',
        category: 'Stocks',
        buy_price: 150,
        current_price: 220,
        quantity: 10,
        ticker: 'AAPL',
        currency: 'USD'
      })
    });
    if (!stockRes.ok) throw new Error('Failed to create stock: ' + JSON.stringify(stockRes.data));
    const stock = stockRes.data;
    console.log('Created Stock:', {
      name: stock.asset_name,
      quantity: stock.quantity,
      ticker: stock.ticker,
      invested: stock.buy_price * stock.quantity
    });
    if (stock.quantity !== 10) throw new Error(`Expected quantity 10, got ${stock.quantity}`);
    if (stock.ticker !== 'AAPL') throw new Error(`Expected ticker AAPL, got ${stock.ticker}`);
    console.log('✓ Test 5 Passed: Standard stocks retain quantity, ticker, and prices normally.');

    console.log('\n====================================================');
    console.log('>>> ALL 5 FD/RD & INTEREST DEBUG TESTS PASSED! <<<');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    server.close();
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch (e) {}
  }
}

runTests();
