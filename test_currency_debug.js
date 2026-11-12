const fs = require('fs');
const path = require('path');
const http = require('http');

const TEST_DIR = path.join(__dirname, 'scratch_currency_test_env');
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;
process.env.PORT = '3898';
process.env.JWT_SECRET = 'currency-debug-secret';
process.env.NODE_ENV = 'test';

const { initDb, getDb } = require('./server/db');

async function runCurrencyDebugTest() {
  console.log("=========================================================");
  console.log("   COMPREHENSIVE MULTI-CURRENCY & REALTIME DEBUG TEST   ");
  console.log("=========================================================");

  // 1. Initialise database in sandbox
  await initDb();
  const db = getDb();
  console.log("[Setup] Database initialized in test sandbox.");

  // 2. Start Express API server
  const express = require('express');
  const app = express();
  app.use(express.json());

  const settingsRouter = require('./server/routes/settings');
  const investmentsRouter = require('./server/routes/investments');
  const snapshotsRouter = require('./server/routes/snapshots');
  const assetsRouter = require('./server/routes/assets');

  app.use('/api/settings', settingsRouter);
  app.use('/api/investments', investmentsRouter);
  app.use('/api/snapshots', snapshotsRouter);
  app.use('/api/assets', assetsRouter);

  const server = await new Promise(resolve => {
    const s = app.listen(3898, () => {
      console.log("[Setup] Test API Server listening on port 3898");
      resolve(s);
    });
  });

  function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3898,
        path: `/api${path}`,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Currency Formatting (money helper)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 1: Currency Formatting (money function logic)");
    const CURRENCIES = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ' };
    function money(value, settings) {
      const num = Number(value || 0);
      const isNeg = num < 0;
      const absNum = Math.abs(num);
      let sym = '₹';
      if (settings) {
        if (settings.currency_symbol === '') sym = '';
        else if (settings.currency && CURRENCIES[settings.currency]) sym = CURRENCIES[settings.currency];
        else if (settings.currency_symbol) sym = settings.currency_symbol;
        else if (settings.currency) sym = settings.currency + ' ';
      }
      const formatted = absNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${isNeg ? '-' : ''}${sym}${formatted}`;
    }

    const t1 = money(411.17, { currency: 'USD', currency_symbol: '₹' });
    const t2 = money(-61.852, { currency: 'USD', currency_symbol: '₹' });
    const t3 = money(1250.953, { currency: 'USD' });
    const t4 = money(2427.9, { currency: 'INR' });
    const t5 = money(-500, { currency: 'INR' });

    console.log("  Tesla Buy Price (USD):", t1);
    console.log("  Tesla P&L (USD):", t2);
    console.log("  Tesla Invested (USD):", t3);
    console.log("  Indian Stock (INR):", t4);
    console.log("  Negative INR:", t5);

    if (t1 !== '$411.17') throw new Error(`FAIL: expected $411.17, got ${t1}`);
    if (t2 !== '-$61.85') throw new Error(`FAIL: expected -$61.85, got ${t2}`);
    if (t3 !== '$1,250.95') throw new Error(`FAIL: expected $1,250.95, got ${t3}`);
    if (t4 !== '₹2,427.90') throw new Error(`FAIL: expected ₹2,427.90, got ${t4}`);
    if (t5 !== '-₹500.00') throw new Error(`FAIL: expected -₹500.00, got ${t5}`);
    console.log("  ✔ PASS: money() properly handles USD, INR, negatives and decimals.");

    // -------------------------------------------------------------
    // TEST 2: GET /api/settings Auto-Initializes Exchange Rates
    // -------------------------------------------------------------
    console.log("\n▶ TEST 2: GET /api/settings Auto-Initialization of Exchange Rates");
    const settingsRes = await request('GET', '/settings');
    console.log("  Status:", settingsRes.status);
    console.log("  Base Currency:", settingsRes.body.settings.currency);
    console.log("  Exchange Rates in DB:", settingsRes.body.settings.exchange_rates);
    
    const ratesInDb = JSON.parse(settingsRes.body.settings.exchange_rates || '{}');
    if (!ratesInDb.USD || Number(ratesInDb.USD) <= 0) {
      throw new Error("FAIL: exchange_rates in settings was not auto-populated with USD rate!");
    }
    console.log(`  ✔ PASS: Settings auto-populated with USD exchange rate: ${ratesInDb.USD}`);

    // -------------------------------------------------------------
    // TEST 3: Realtime Yahoo Finance Live Rates API
    // -------------------------------------------------------------
    console.log("\n▶ TEST 3: Realtime Live Rates Endpoint GET /api/settings/live-rates");
    const liveRes = await request('GET', '/settings/live-rates?base=INR&symbols=USD,EUR');
    console.log("  Status:", liveRes.status);
    console.log("  Live Rates returned:", liveRes.body);
    if (!liveRes.body.USD || Number(liveRes.body.USD) <= 0) {
      throw new Error("FAIL: Realtime endpoint failed to return valid USD rate!");
    }
    const liveUsdRate = Number(liveRes.body.USD);
    console.log(`  ✔ PASS: Live Yahoo Finance rate retrieved: 1 USD = ₹${liveUsdRate} INR`);

    // -------------------------------------------------------------
    // TEST 4: convertValue Calculation
    // -------------------------------------------------------------
    console.log("\n▶ TEST 4: convertValue Logic (USD to INR)");
    const FALLBACK_EXCHANGE_RATES = {
      INR: { USD: 93.95, EUR: 102.5, GBP: 121.0, AED: 25.5 },
      USD: { INR: 0.01064, EUR: 1.09, GBP: 1.28, AED: 0.27 }
    };
    function convertValue(amount, fromCurrency, settings) {
      const num = Number(amount) || 0;
      if (!fromCurrency || fromCurrency === settings?.currency) return num;
      try {
        const rates = JSON.parse(settings?.exchange_rates || '{}');
        if (rates[fromCurrency] && Number(rates[fromCurrency]) > 0) {
          return num * Number(rates[fromCurrency]);
        }
      } catch (e) {}
      const base = settings?.currency || 'INR';
      if (FALLBACK_EXCHANGE_RATES[base] && FALLBACK_EXCHANGE_RATES[base][fromCurrency]) {
        return num * FALLBACK_EXCHANGE_RATES[base][fromCurrency];
      }
      return num;
    }

    const teslaUsdValue = 1189.10;
    const convertedInr = convertValue(teslaUsdValue, 'USD', settingsRes.body.settings);
    console.log(`  Tesla Value in USD: $${teslaUsdValue}`);
    console.log(`  Converted to INR: ₹${convertedInr.toFixed(2)} (using rate ${ratesInDb.USD})`);
    
    if (convertedInr < 100000 || convertedInr > 130000) {
      throw new Error(`FAIL: Converted value ${convertedInr} is not within realistic ₹1.1 Lakh range!`);
    }
    console.log("  ✔ PASS: Tesla USD value converted accurately to INR.");

    // -------------------------------------------------------------
    // TEST 5: Create Investments & Test Backend Snapshot Conversion
    // -------------------------------------------------------------
    console.log("\n▶ TEST 5: Investment Creation & Snapshot Currency Conversion");
    // Add Tesla in USD
    const teslaRes = await request('POST', '/investments', {
      asset_name: 'Tesla',
      category: 'Stocks',
      buy_price: 411.17,
      current_price: 390.84,
      quantity: 3.042424,
      currency: 'USD',
      ticker: 'TSLA'
    });
    console.log("  Tesla created with ID:", teslaRes.body.id, "Currency:", teslaRes.body.currency);

    // Add TCS in INR
    const tcsRes = await request('POST', '/investments', {
      asset_name: 'Tata Consultancy Services',
      category: 'Stocks',
      buy_price: 2268.80,
      current_price: 2427.90,
      quantity: 15,
      currency: 'INR',
      ticker: 'TCS.NS'
    });
    console.log("  TCS created with ID:", tcsRes.body.id, "Currency:", tcsRes.body.currency);

    // Trigger snapshot
    const snapRes = await request('POST', '/snapshots');
    console.log("  Snapshot status:", snapRes.status);
    console.log("  Snapshot investment_value:", snapRes.body.investment_value);
    console.log("  Snapshot total_assets:", snapRes.body.total_assets);
    console.log("  Snapshot net_worth:", snapRes.body.net_worth);

    // Read current rate in settings after live sync
    const currentSettings = await request('GET', '/settings');
    const currentRates = JSON.parse(currentSettings.body.settings.exchange_rates || '{}');
    const activeUsdRate = Number(currentRates.USD) || liveUsdRate;

    const expectedTcs = 2427.90 * 15; // ₹36,418.50
    const expectedTeslaInr = (390.84 * 3.042424) * activeUsdRate; // ~$1,189.10 * activeUsdRate
    const expectedTotal = expectedTcs + expectedTeslaInr;
    console.log(`  Expected Investment Value in INR (at rate ${activeUsdRate}): ≈ ₹${expectedTotal.toFixed(2)}`);

    const diff = Math.abs(snapRes.body.investment_value - expectedTotal);
    if (diff > 5) {
      throw new Error(`FAIL: Snapshot investment_value (${snapRes.body.investment_value}) did not match expected converted total (${expectedTotal})!`);
    }
    console.log("  ✔ PASS: Backend snapshot properly converts foreign currency investments into base currency.");

    // -------------------------------------------------------------
    // TEST 6: Changing Base Currency to USD (Cross-Currency Inversion)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 6: Changing Base Currency to USD");
    await request('PUT', '/settings', { currency: 'USD', currency_symbol: '$' });
    const settingsUsdRes = await request('GET', '/settings');
    console.log("  New Base Currency:", settingsUsdRes.body.settings.currency);

    const usdSettings = settingsUsdRes.body.settings;
    const tcsInUsd = convertValue(expectedTcs, 'INR', usdSettings);
    console.log(`  TCS ₹${expectedTcs.toFixed(2)} INR converted to USD: $${tcsInUsd.toFixed(2)}`);
    if (tcsInUsd < 350 || tcsInUsd > 450) {
      throw new Error(`FAIL: TCS INR to USD conversion (${tcsInUsd}) is out of expected range!`);
    }
    console.log("  ✔ PASS: Cross-currency inversion properly converts INR to USD when base currency is USD.");

    console.log("\n=========================================================");
    console.log("   🎉 ALL 6 MULTI-CURRENCY DEBUG TESTS PASSED!          ");
    console.log("=========================================================");

  } finally {
    server.close();
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
      console.log("[Cleanup] Cleaned up sandbox test directory.");
    } catch (e) {}
  }
}

runCurrencyDebugTest().catch(err => {
  console.error("\n❌ DEBUG TEST FAILED:", err);
  process.exit(1);
});
