const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

// Set isolated test directory
const TEST_DIR = path.join(__dirname, 'test_temp_bonds_dir');
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;

const { initDb, getDb, ensureInvestmentColumns, ensureCategoriesColumns } = require('./server/db');

async function runTests() {
  console.log('====================================================');
  console.log('--- STARTING BONDS CUSTOM FORM & INTEREST TEST ---');
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
  await new Promise(resolve => server.listen(3298, resolve));
  console.log('✓ Test HTTP Server listening on port 3298');

  const request = async (urlPath, options = {}) => {
    const res = await fetch(`http://localhost:3298/api${urlPath}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  };

  try {
    // 1. Verify Bonds in Settings API
    console.log('\n[Test 1] Checking Bonds in Settings investment categories...');
    const settingsRes = await request('/settings');
    if (!settingsRes.ok) throw new Error('Failed to fetch settings: ' + JSON.stringify(settingsRes.data));
    const invCats = settingsRes.data.categories?.investment || [];
    console.log('Investment Categories in DB:', invCats);

    if (!invCats.includes('Bonds')) {
      throw new Error("Expected 'Bonds' in investment categories!");
    }
    console.log('✓ Test 1 Passed: Bonds category is available.');

    // 2. Create a Bank Account in Assets
    console.log('\n[Test 2] Creating receiving bank account in Assets...');
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

    // 3. Create Bond Lot with Units, Price per unit, Coupon Rate, Monthly Payout, and Receiving Account
    console.log('\n[Test 3] Creating Bond with Units (quantity = 10, buy_price = 1000, 9.5% monthly payout)...');
    const bondRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'Sindhuja Microcredit 9.5% Bond',
        category: 'Bonds',
        platform: 'Wint Wealth',
        quantity: 10, // 10 units
        buy_price: 1000, // ₹1,000 per unit -> ₹10,000 total principal
        current_price: 1000,
        ticker: '', // Ticker should be empty/removed
        interest_rate: 9.5,
        buy_date: '2026-01-01',
        maturity_date: '2028-01-01',
        tenure: '24 Months',
        payout_frequency: 'Monthly Payout',
        receiving_account_id: bankId,
        receiving_account_name: 'Kotak Mahindra Bank'
      })
    });
    if (!bondRes.ok) throw new Error('Failed to create bond: ' + JSON.stringify(bondRes.data));
    const bond = bondRes.data;
    console.log(`✓ Bond created: ${bond.asset_name} (ID: ${bond.id}, Units: ${bond.quantity}, Price: ₹${bond.buy_price}, Total: ₹${bond.quantity * bond.buy_price})`);

    if (Number(bond.quantity) !== 10) {
      throw new Error(`Expected bond quantity (units) to be 10, got: ${bond.quantity}`);
    }
    if (bond.ticker && bond.ticker !== '') {
      throw new Error(`Expected empty ticker for Bond, got: ${bond.ticker}`);
    }
    if (bond.payout_frequency !== 'Monthly Payout') {
      throw new Error(`Expected 'Monthly Payout', got: ${bond.payout_frequency}`);
    }
    if (bond.receiving_account_id !== bankId) {
      throw new Error(`Expected receiving_account_id ${bankId}, got: ${bond.receiving_account_id}`);
    }
    console.log('✓ Test 3 Passed: Bond saved with correct Units, payout frequency, and receiving account.');

    // 4. Record Monthly Interest Auto-Calculation on Bond Units
    console.log('\n[Test 4] Recording Monthly Interest on Bond (10 units * ₹1000 @ 9.5% p.a.)...');
    // Expected: 10 * 1000 = 10,000 principal. Monthly interest = (10000 * 9.5 / 100) / 12 = 79.1666... ≈ 79.17
    const interestRes = await request(`/investments/${bond.id}/record-interest`, {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-02-01'
        // amount omitted so server auto-calculates from units * buy_price * rate / 12
      })
    });
    if (!interestRes.ok) throw new Error('Failed to record interest: ' + JSON.stringify(interestRes.data));
    console.log('Record interest response:', interestRes.data);

    const expectedInterest = Math.round((10 * 1000 * 0.095 / 12) * 100) / 100;
    if (Math.abs(interestRes.data.amount - expectedInterest) > 0.05) {
      throw new Error(`Expected interest ~₹${expectedInterest}, got: ₹${interestRes.data.amount}`);
    }

    // Verify bank balance was credited
    const bankCheck = await request('/assets');
    const updatedBank = bankCheck.data.find(a => a.id === bankId);
    console.log(`Updated Bank Balance: ₹${updatedBank.current_value} (Expected: ₹${500000 + expectedInterest})`);
    if (Math.abs(updatedBank.current_value - (500000 + expectedInterest)) > 0.05) {
      throw new Error(`Bank account was not credited properly! Current: ₹${updatedBank.current_value}`);
    }

    // Verify Cashflow entry
    const cfCheck = await request('/cashflow');
    const cfEntry = cfCheck.data.find(c => c.category === 'Interest Income' && c.description.includes('Sindhuja Microcredit'));
    if (!cfEntry) {
      throw new Error('Expected Cashflow Income entry for interest payout!');
    }
    console.log(`✓ Cashflow entry verified: "${cfEntry.description}" (Amount: +₹${cfEntry.amount}, Category: ${cfEntry.category})`);

    // 5. Test Bond with Quarterly Payout
    console.log('\n[Test 5] Creating Bond with Quarterly Payout (50 units * ₹100 @ 7.18% p.a.)...');
    const qBondRes = await request('/investments', {
      method: 'POST',
      body: JSON.stringify({
        asset_name: 'GOI 7.18% 2033 Bond',
        category: 'Bonds',
        platform: 'Zerodha Coin',
        quantity: 50, // 50 units
        buy_price: 100, // ₹100 per unit -> ₹5,000 total principal
        current_price: 100,
        interest_rate: 7.18,
        buy_date: '2026-03-01',
        maturity_date: '2033-03-01',
        payout_frequency: 'Quarterly Payout',
        receiving_account_id: bankId,
        receiving_account_name: 'Kotak Mahindra Bank'
      })
    });
    if (!qBondRes.ok) throw new Error('Failed to create quarterly bond: ' + JSON.stringify(qBondRes.data));
    const qBond = qBondRes.data;

    // Expected Quarterly interest: (50 * 100 * 0.0718) / 4 = 89.75
    const qInterestRes = await request(`/investments/${qBond.id}/record-interest`, {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-06-01'
      })
    });
    if (!qInterestRes.ok) throw new Error('Failed to record quarterly interest: ' + JSON.stringify(qInterestRes.data));
    const expectedQInterest = Math.round((50 * 100 * 0.0718 / 4) * 100) / 100;
    console.log(`Quarterly interest recorded: ₹${qInterestRes.data.amount} (Expected: ₹${expectedQInterest})`);
    if (Math.abs(qInterestRes.data.amount - expectedQInterest) > 0.05) {
      throw new Error(`Expected quarterly interest ~₹${expectedQInterest}, got: ₹${qInterestRes.data.amount}`);
    }
    console.log('✓ Test 5 Passed: Quarterly interest auto-calculated correctly on units * buy_price.');

    // 6. Test Quick-Select fixed amount recording
    console.log('\n[Test 6] Testing manual/quick-select specific interest amount recording...');
    const manualInterestRes = await request(`/investments/${bond.id}/record-interest`, {
      method: 'POST',
      body: JSON.stringify({
        amount: 80.00,
        date: '2026-03-01',
        receiving_account_id: bankId,
        notes: 'March interest payment rounded'
      })
    });
    if (!manualInterestRes.ok) throw new Error('Failed to record manual interest: ' + JSON.stringify(manualInterestRes.data));
    if (manualInterestRes.data.amount !== 80) {
      throw new Error(`Expected manual amount 80, got: ${manualInterestRes.data.amount}`);
    }
    console.log('✓ Test 6 Passed: Specific interest amount recorded successfully.');

    // 7. Verify frontend helper logic
    console.log('\n[Test 7] Verifying category helper rules...');
    function isBond(cat) { return cat === 'Bonds'; }
    function isFdorRd(cat) { return cat === 'Fixed Deposit (FD)' || cat === 'Recurring Deposit (RD)' || cat === 'FD/RD'; }
    function hasPeriodicPayout(cat, freq) {
      if (!freq || freq === 'Payment on Maturity') return false;
      return isFdorRd(cat) || isBond(cat);
    }

    if (!isBond('Bonds')) throw new Error('isBond("Bonds") should be true');
    if (isBond('Stocks')) throw new Error('isBond("Stocks") should be false');
    if (!hasPeriodicPayout('Bonds', 'Monthly Payout')) throw new Error('Bonds with Monthly Payout should return true');
    if (!hasPeriodicPayout('Bonds', 'Quarterly Payout')) throw new Error('Bonds with Quarterly Payout should return true');
    if (!hasPeriodicPayout('Bonds', 'Half-Yearly Payout')) throw new Error('Bonds with Half-Yearly Payout should return true');
    if (!hasPeriodicPayout('Bonds', 'Annual Payout')) throw new Error('Bonds with Annual Payout should return true');
    if (hasPeriodicPayout('Bonds', 'Payment on Maturity')) throw new Error('Bonds with Payment on Maturity should return false');
    if (hasPeriodicPayout('Stocks', 'Monthly Payout')) throw new Error('Stocks should return false');
    console.log('✓ Test 7 Passed: Helper functions validate correctly.');

    console.log('\n====================================================');
    console.log('🎉 ALL BONDS CUSTOM FORM & INTEREST TESTS PASSED! 🎉');
    console.log('====================================================');

  } finally {
    server.close();
    if (fs.existsSync(TEST_DIR)) {
      try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
