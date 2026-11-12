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

const { initDb, getDb, ensureInvestmentColumns, ensureCategoriesColumns } = require('./server/db');

async function runTests() {
  console.log('====================================================');
  console.log('--- STARTING INDIVIDUAL FD & RD CATEGORIES TEST ---');
  console.log('====================================================');

  const db = await initDb();
  ensureInvestmentColumns(db);
  ensureCategoriesColumns(db);
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
  const settingsRouter = require('./server/routes/settings');
  app.use('/api/investments', investmentsRouter);
  app.use('/api/cashflow', cashflowRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/settings', settingsRouter);

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
    // 1. Verify Individual Categories in Settings API
    console.log('\n[Test 1] Checking that FD and RD are individual categories in Settings...');
    const settingsRes = await request('/settings');
    if (!settingsRes.ok) throw new Error('Failed to fetch settings: ' + JSON.stringify(settingsRes.data));
    const invCats = settingsRes.data.categories?.investment || [];
    console.log('Investment Categories in DB:', invCats);

    if (!invCats.includes('Fixed Deposit (FD)')) {
      throw new Error("Expected 'Fixed Deposit (FD)' in investment categories!");
    }
    if (!invCats.includes('Recurring Deposit (RD)')) {
      throw new Error("Expected 'Recurring Deposit (RD)' in investment categories!");
    }
    if (invCats.includes('FD/RD')) {
      throw new Error("'FD/RD' combined category should no longer be present!");
    }
    console.log('✓ Test 1 Passed: FD and RD are separated into individual categories.');

    // 2. Create a Bank Account in Assets
    console.log('\n[Test 2] Creating linked bank account in Assets...');
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

    // 3. Create FD with individual category "Fixed Deposit (FD)"
    console.log('\n[Test 3] Creating FD with category "Fixed Deposit (FD)"...');
    const fdRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'HDFC 1-Year Fixed Deposit',
        category: 'Fixed Deposit (FD)',
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
      quantity: fd.quantity,
      ticker: fd.ticker,
      tenure: fd.tenure,
      payout_frequency: fd.payout_frequency,
      receiving_account: fd.receiving_account_name
    });

    if (fd.quantity !== 1) throw new Error(`Expected quantity 1 for FD, got ${fd.quantity}`);
    if (fd.ticker !== '') throw new Error(`Expected empty ticker for FD, got ${fd.ticker}`);
    if (fd.payout_frequency !== 'Monthly Payout') throw new Error(`Expected Monthly Payout, got ${fd.payout_frequency}`);
    console.log('✓ Test 3 Passed: FD created with category "Fixed Deposit (FD)" and custom defaults.');

    // 4. Test Recording Monthly Interest
    console.log('\n[Test 4] Recording Monthly Interest Payout for FD...');
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
    if (bankCheck.data.current_value !== 501250) {
      throw new Error(`Expected bank balance ₹501,250, got ₹${bankCheck.data.current_value}`);
    }
    console.log('✓ Test 4 Passed: Interest recorded and bank balance credited successfully.');

    // 5. Create RD with individual category "Recurring Deposit (RD)"
    console.log('\n[Test 5] Creating RD with category "Recurring Deposit (RD)" and Quarterly Payout...');
    const rdRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'SBI Monthly Recurring Deposit',
        category: 'Recurring Deposit (RD)',
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
      category: rd.category,
      tenure: rd.tenure,
      payout: rd.payout_frequency,
      is_sip: rd.is_sip
    });
    if (rd.category !== 'Recurring Deposit (RD)') throw new Error(`Expected Recurring Deposit (RD), got ${rd.category}`);
    if (rd.quantity !== 1) throw new Error(`Expected quantity 1 for RD, got ${rd.quantity}`);

    // Record quarterly interest: 100000 * 8% / 4 = 2000
    const qInterestRes = await request(`/investments/${rd.id}/record-interest`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (!qInterestRes.ok) throw new Error('Failed to record quarterly interest: ' + JSON.stringify(qInterestRes.data));
    if (qInterestRes.data.amount !== 2000) throw new Error(`Expected ₹2000 quarterly interest, got ₹${qInterestRes.data.amount}`);
    console.log('✓ Test 5 Passed: RD with individual category "Recurring Deposit (RD)" created and quarterly interest processed.');

    // 6. Test Legacy Migration
    console.log('\n[Test 6] Testing automatic migration of any legacy "FD/RD" entries...');
    // Manually insert legacy FD/RD
    db.prepare("INSERT INTO investments (asset_name, category, buy_price, current_price, quantity) VALUES ('Old Test FD', 'FD/RD', 50000, 50000, 1)").run();
    ensureCategoriesColumns(db);
    const migrated = db.prepare("SELECT * FROM investments WHERE asset_name = 'Old Test FD'").get();
    console.log('Migrated old investment:', { name: migrated.asset_name, category: migrated.category });
    if (migrated.category !== 'Fixed Deposit (FD)') {
      throw new Error(`Expected category 'Fixed Deposit (FD)', got ${migrated.category}`);
    }
    console.log('✓ Test 6 Passed: Legacy "FD/RD" entries are automatically migrated to "Fixed Deposit (FD)".');

    console.log('\n====================================================');
    console.log('>>> ALL 6 INDIVIDUAL FD & RD TESTS PASSED! <<<');
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
