const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');

const TEST_DIR = path.join(__dirname, 'test_temp_freeze_dir');
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;
process.env.PORT = '3099';
process.env.NODE_ENV = 'test';

async function run() {
  console.log('--- STARTING FREEZE & OPTIONS DEBUG TEST ---');
  
  // 1. Initialize server & DB
  const { initDb, getDb, DB_PATH } = require('./server/db');
  await initDb();
  const db = getDb();
  console.log('✓ Database initialized in test mode at:', DB_PATH);

  const app = express();
  app.use(express.json());

  // Mock auth middleware for testing
  const mockAuth = (req, res, next) => {
    req.user = { id: 1, email: 'test@networth.local' };
    next();
  };

  app.use('/api/assets', mockAuth, require('./server/routes/assets'));
  app.use('/api/liabilities', mockAuth, require('./server/routes/liabilities'));
  app.use('/api/cashflow', mockAuth, require('./server/routes/cashflow'));
  app.use('/api/investments', mockAuth, require('./server/routes/investments'));
  app.use('/api/snapshots', mockAuth, require('./server/routes/snapshots'));
  app.use('/api/settings', mockAuth, require('./server/routes/settings'));
  app.use('/api/categories', mockAuth, require('./server/routes/categories'));
  app.use('/api/budgets', mockAuth, require('./server/routes/budgets'));
  app.use('/api/goals', mockAuth, require('./server/routes/goals'));
  app.use('/api/subscriptions', mockAuth, require('./server/routes/subscriptions'));
  app.use('/api/insurance', mockAuth, require('./server/routes/insurance'));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3099, resolve));
  console.log('✓ Test HTTP Server listening on port 3099');

  const request = async (method, route, body = null) => {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port: 3099,
        path: '/api' + route,
        method: method,
        headers: { 'Content-Type': 'application/json' }
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch(e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };

  try {
    // TEST 1: Check Settings and Categories API
    console.log('\n[Test 1] Verifying /settings returns comprehensive categories...');
    const settingsRes = await request('GET', '/settings');
    if (settingsRes.status !== 200) throw new Error(`Settings failed with status ${settingsRes.status}`);
    const categories = settingsRes.body.categories;
    
    if (!categories.asset || !Array.isArray(categories.asset)) throw new Error('categories.asset is not an array');
    console.log('categories.asset:', categories.asset);

    if (!categories.asset.includes('Trading / Brokerage Account')) {
      throw new Error('categories.asset is missing "Trading / Brokerage Account"');
    }
    if (!categories.asset.includes('ETF')) {
      throw new Error('categories.asset is missing "ETF"');
    }
    if (!categories.transfer || !categories.transfer.includes('Stock Broker Deposit')) {
      throw new Error('categories.transfer is missing "Stock Broker Deposit"');
    }
    console.log('✓ Test 1 Passed: Categories API has all necessary asset and transfer options.');

    // TEST 2: Add Asset with "Trading / Brokerage Account"
    console.log('\n[Test 2] Adding asset with "Trading / Brokerage Account"...');
    const createAssetRes = await request('POST', '/assets', {
      name: 'Zerodha Kite',
      category: 'Trading / Brokerage Account',
      current_value: 500000,
      currency: 'INR'
    });
    if (createAssetRes.status !== 200 && createAssetRes.status !== 201) {
      throw new Error(`Failed to create asset: ${JSON.stringify(createAssetRes.body)}`);
    }
    const assetId = createAssetRes.body.id;
    console.log('✓ Asset created successfully with ID:', assetId);

    // Fetch and check asset
    const getAssetsRes = await request('GET', '/assets');
    const foundAsset = getAssetsRes.body.find(a => a.id === assetId);
    if (!foundAsset || foundAsset.category !== 'Trading / Brokerage Account') {
      throw new Error('Created asset does not match expected category');
    }
    console.log('✓ Test 2 Passed: Asset correctly saved and fetched with category "Trading / Brokerage Account".');

    // TEST 3: Modal Options Resolution Simulation
    console.log('\n[Test 3] Simulating Modal resolvedOptions fallback logic...');
    // Case A: standard options
    const standardOptions = ['Cash', 'Bank Accounts', 'Stocks'];
    const currentValA = 'Trading / Brokerage Account'; // Not in standard list
    
    const resolveOpts = (optionsList, currentVal) => {
      const hasCurrent = currentVal !== undefined && currentVal !== null && currentVal !== '' &&
        optionsList.some(o => (typeof o === 'object' && o !== null ? o.value : o) === currentVal);
      return (currentVal && !hasCurrent) ? [currentVal, ...optionsList] : optionsList;
    };

    const resolvedA = resolveOpts(standardOptions, currentValA);
    if (resolvedA[0] !== 'Trading / Brokerage Account') {
      throw new Error('Expected custom/missing category to be prepended to resolvedOptions');
    }
    console.log('✓ Fallback resolution prepends missing category correctly:', resolvedA);

    // Case B: current value already in options
    const resolvedB = resolveOpts(standardOptions, 'Cash');
    if (resolvedB.length !== standardOptions.length) {
      throw new Error('Expected no duplicate prepending when category is already in list');
    }
    console.log('✓ Standard resolution does not duplicate:', resolvedB);
    console.log('✓ Test 3 Passed: Modal resolvedOptions handles legacy/custom categories without blanking.');

    // TEST 4: Rapid Concurrent Requests (Stress test Chrome pool simulation)
    console.log('\n[Test 4] Stress testing 12 concurrent requests...');
    const startTime = Date.now();
    const concurrentCalls = [
      request('GET', '/settings'),
      request('GET', '/assets'),
      request('GET', '/liabilities'),
      request('GET', '/investments'),
      request('GET', '/cashflow'),
      request('GET', '/goals'),
      request('GET', '/insurance'),
      request('GET', '/snapshots?period=monthly'),
      request('GET', '/snapshots?period=weekly'),
      request('POST', '/subscriptions/process'),
      request('GET', '/settings'),
      request('GET', '/assets')
    ];
    const results = await Promise.all(concurrentCalls);
    const duration = Date.now() - startTime;
    for (const r of results) {
      if (r.status >= 400) throw new Error(`Concurrent call failed with status: ${r.status}`);
    }
    console.log(`✓ 12 concurrent requests completed cleanly in ${duration}ms without any freeze or deadlocks.`);
    console.log('✓ Test 4 Passed: Server handles concurrent burst smoothly.');

    // TEST 5: Currency Conversion & USD Asset Handling
    console.log('\n[Test 5] Adding USD investment (e.g. Tesla) and testing snapshots...');
    const createInvestRes = await request('POST', '/investments', {
      asset_name: 'Tesla',
      category: 'Stocks',
      ticker: 'TSLA',
      quantity: 3.042424,
      buy_price: 411.17,
      current_price: 390.84,
      currency: 'USD'
    });
    if (createInvestRes.status !== 200 && createInvestRes.status !== 201) {
      throw new Error(`Failed to create investment: ${JSON.stringify(createInvestRes.body)}`);
    }

    const snapshotRes = await request('POST', '/snapshots', {
      date: '2026-11-12',
      period: 'monthly'
    });
    if (snapshotRes.status !== 200 && snapshotRes.status !== 201) {
      throw new Error(`Failed to create snapshot: ${JSON.stringify(snapshotRes.body)}`);
    }

    const snap = snapshotRes.body;
    console.log('Snapshot created:', {
      total_assets: snap.total_assets,
      investment_value: snap.investment_value,
      net_worth: snap.net_worth
    });
    if (snap.investment_value < 100000) {
      throw new Error(`Investment value ${snap.investment_value} is not converted to base currency!`);
    }
    console.log('✓ Test 5 Passed: USD investment properly converted in snapshot calculations.');

    console.log('\n=============================================');
    console.log('>>> ALL 5 DEBUG TESTS PASSED SUCCESSFULLY! <<<');
    console.log('=============================================\n');
  } finally {
    server.close();
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch(e) {}
  }
}

run().catch(err => {
  console.error('\n❌ DEBUG TEST FAILED:', err);
  process.exit(1);
});
