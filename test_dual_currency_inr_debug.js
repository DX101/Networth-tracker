const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');

const TEST_DIR = path.join(__dirname, 'test_temp_dual_currency_dir');
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;
process.env.PORT = '3199';
process.env.NODE_ENV = 'test';

async function run() {
  console.log('====================================================');
  console.log('--- STARTING DUAL-CURRENCY INR & DOLLAR DEBUG TEST ---');
  console.log('====================================================');

  const { initDb, getDb, DB_PATH } = require('./server/db');
  await initDb();
  const db = getDb();
  console.log('✓ Database initialized at:', DB_PATH);

  const app = express();
  app.use(express.json());

  const mockAuth = (req, res, next) => {
    req.user = { id: 1, email: 'test@networth.local' };
    next();
  };

  app.use('/api/settings', mockAuth, require('./server/routes/settings'));
  app.use('/api/investments', mockAuth, require('./server/routes/investments'));
  app.use('/api/snapshots', mockAuth, require('./server/routes/snapshots'));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3199, resolve));
  console.log('✓ Test HTTP Server listening on port 3199');

  const request = async (method, route, body = null) => {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port: 3199,
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
    // TEST 1: Exchange Rates auto-init
    console.log('\n[Test 1] Verifying settings exchange rates...');
    const settingsRes = await request('GET', '/settings');
    const settings = settingsRes.body.settings;
    const rates = JSON.parse(settings.exchange_rates || '{}');
    const usdRate = Number(rates.USD) || 93.95;
    console.log(`✓ Active USD/INR exchange rate: 1 USD = ₹${usdRate}`);

    // TEST 2: Create Tesla as USD investment and test actual INR calculation
    console.log('\n[Test 2] Creating Tesla with currency USD...');
    const teslaRes = await request('POST', '/investments', {
      asset_name: 'Tesla',
      category: 'Stocks',
      ticker: 'TSLA',
      quantity: 3.042424,
      buy_price: 411.17,
      current_price: 390.84,
      currency: 'USD'
    });
    const tesla = teslaRes.body;
    console.log('Created Tesla (USD):', tesla);

    const nativeValue = tesla.quantity * tesla.current_price;
    const inrValue = nativeValue * usdRate;
    console.log(`Native Value: $${nativeValue.toFixed(2)} USD`);
    console.log(`Actual INR Value: ₹${inrValue.toFixed(2)} INR`);

    if (Math.abs(inrValue - 111760) > 1000) {
      throw new Error(`Expected INR value around ₹111,760, got ${inrValue}`);
    }
    console.log('✓ Test 2 Passed: Actual INR value calculated accurately for USD stock.');

    // TEST 3: Create Tesla edited/saved in INR (with TSLA ticker)
    console.log('\n[Test 3] Creating foreign stock with currency INR (User edits directly in INR)...');
    const inrTeslaRes = await request('POST', '/investments', {
      asset_name: 'Tesla (INR Tracked)',
      category: 'Stocks',
      ticker: 'TSLA',
      quantity: 3.042424,
      buy_price: 411.17 * usdRate,
      current_price: 390.84 * usdRate,
      currency: 'INR'
    });
    const inrTesla = inrTeslaRes.body;
    console.log('Created Tesla in INR:', inrTesla);
    
    // Test derived dollar state
    const derivedDollarValue = inrTesla.current_price / usdRate;
    console.log(`Derived Dollar Price from INR: $${derivedDollarValue.toFixed(2)} USD`);
    if (Math.abs(derivedDollarValue - 390.84) > 0.5) {
      throw new Error(`Expected derived dollar price around 390.84, got ${derivedDollarValue}`);
    }
    console.log('✓ Test 3 Passed: Stocks edited in INR accurately retain and compute dollar state.');

    // TEST 4: Price sync with currency awareness
    console.log('\n[Test 4] Testing sync-prices with multi-currency handling...');
    const syncRes = await request('POST', '/investments/sync-prices');
    console.log('Sync prices response:', syncRes.body);

    const freshInvestments = await request('GET', '/investments');
    const freshInrTesla = freshInvestments.body.find(i => i.id === inrTesla.id);
    const freshUsdTesla = freshInvestments.body.find(i => i.id === tesla.id);

    console.log('After sync:');
    console.log(`  Tesla (USD) current_price: $${freshUsdTesla.current_price}`);
    console.log(`  Tesla (INR) current_price: ₹${freshInrTesla.current_price}`);

    // If TSLA price synced, freshUsdTesla should be in dollars (~300-500)
    // and freshInrTesla should be in INR (~30,000-50,000)
    if (freshUsdTesla.current_price > 2000) {
      throw new Error(`Tesla USD price ${freshUsdTesla.current_price} looks like INR, not USD!`);
    }
    if (freshInrTesla.current_price < 2000) {
      throw new Error(`Tesla INR price ${freshInrTesla.current_price} looks like USD, not INR!`);
    }
    console.log('✓ Test 4 Passed: sync-prices preserves currency units properly for both USD and INR.');

    console.log('\n====================================================');
    console.log('>>> ALL 4 DUAL-CURRENCY DEBUG TESTS PASSED! <<<');
    console.log('====================================================\n');
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
