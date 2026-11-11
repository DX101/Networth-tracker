const fs = require('fs');
const path = require('path');
const http = require('http');

// Set test environment
const TEST_DIR = path.join(__dirname, 'scratch_test_env');
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;
process.env.PORT = '3899';
process.env.JWT_SECRET = 'debug-test-secret';
process.env.NODE_ENV = 'test';

const { initDb, getDb } = require('./server/db');

async function runFullDebugTest() {
  console.log("=================================================");
  console.log("   COMPREHENSIVE BACKEND & API DEBUG TEST SUITE  ");
  console.log("=================================================");

  // 1. Initialise database
  await initDb();
  const db = getDb();
  console.log("[Setup] Database initialized in:", TEST_DIR);

  // 2. Start Express Server
  const express = require('express');
  const app = express();
  app.use(express.json());
  
  // Register routes
  const settingsRouter = require('./server/routes/settings');
  const categoriesRouter = require('./server/routes/categories');
  const assetsRouter = require('./server/routes/assets');
  const cashflowRouter = require('./server/routes/cashflow');
  
  app.use('/api/settings', settingsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/cashflow', cashflowRouter);

  const server = await new Promise((resolve) => {
    const s = app.listen(3899, () => {
      console.log("[Setup] Test API Server listening on port 3899");
      resolve(s);
    });
  });

  // Helper function for API requests
  function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3899,
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
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed, raw: data });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Settings & Categories GET /api/settings
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 1: Settings & Categories GET /api/settings");
    const settingsRes = await request('GET', '/settings');
    console.log("  Status:", settingsRes.status);
    console.log("  Categories types:", Object.keys(settingsRes.body.categories));
    console.log("  Transfer categories:", settingsRes.body.categories.transfer);
    if (!settingsRes.body.categories.transfer || !settingsRes.body.categories.transfer.includes('Trading Account Fund')) {
      throw new Error("FAIL: Transfer categories missing 'Trading Account Fund'");
    }
    console.log("  ✔ PASS: /api/settings returned transfer categories properly");

    // -----------------------------------------------------------------
    // TEST 2: Add Custom Transfer Category via POST /api/categories
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 2: Add Custom Transfer Category POST /api/categories");
    const addCatRes = await request('POST', '/categories', {
      type: 'transfer',
      name: 'Zerodha / Sahi Broker Fund'
    });
    console.log("  Status:", addCatRes.status, "Body:", addCatRes.body);
    if (addCatRes.status !== 201) {
      throw new Error("FAIL: POST /categories returned status: " + addCatRes.status);
    }
    const settingsAfterAdd = await request('GET', '/settings');
    if (!settingsAfterAdd.body.categories.transfer.includes('Zerodha / Sahi Broker Fund')) {
      throw new Error("FAIL: Newly added transfer category not found in settings");
    }
    console.log("  ✔ PASS: Custom transfer category added and persisted successfully");

    // -----------------------------------------------------------------
    // TEST 3: Settings Save (PUT /api/settings with updated categories)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 3: Update Settings Categories PUT /api/settings");
    const updatedCats = {
      ...settingsAfterAdd.body.categories,
      transfer: [...settingsAfterAdd.body.categories.transfer, 'Crypto Exchange Deposit']
    };
    const putSettingsRes = await request('PUT', '/settings', { categories: updatedCats });
    console.log("  Status:", putSettingsRes.status);
    if (!putSettingsRes.body.categories.transfer.includes('Crypto Exchange Deposit')) {
      throw new Error("FAIL: Crypto Exchange Deposit not found after PUT /settings");
    }
    console.log("  ✔ PASS: Categories updated via PUT /settings successfully");

    // -----------------------------------------------------------------
    // TEST 4: Create Source Account (Kotak Bank)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 4: Create Kotak Bank POST /api/assets");
    const kotakRes = await request('POST', '/assets', {
      name: 'Kotak Mahindra Bank',
      category: 'Bank Accounts',
      current_value: 500000,
      currency: 'INR'
    });
    console.log("  Status:", kotakRes.status, "Body:", kotakRes.body);
    if (!kotakRes.body || !kotakRes.body.id || kotakRes.body.id <= 0) {
      throw new Error("FAIL: Kotak Bank creation returned invalid ID: " + JSON.stringify(kotakRes.body));
    }
    const kotakId = kotakRes.body.id;
    console.log(`  ✔ PASS: Kotak Bank created with ID: ${kotakId}, Balance: ₹${kotakRes.body.current_value}`);

    // -----------------------------------------------------------------
    // TEST 5: Inline Destination Account Creation (Sahi Broker)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 5: Inline Create Sahi Broker POST /api/assets");
    const brokerRes = await request('POST', '/assets', {
      name: 'Sahi Broker',
      category: 'Trading / Brokerage Account',
      current_value: 0,
      currency: 'INR'
    });
    console.log("  Status:", brokerRes.status, "Body:", brokerRes.body);
    if (!brokerRes.body || !brokerRes.body.id || brokerRes.body.id <= 0) {
      throw new Error("FAIL: Sahi Broker creation returned invalid ID: " + JSON.stringify(brokerRes.body));
    }
    const brokerId = brokerRes.body.id;
    console.log(`  ✔ PASS: Sahi Broker created with ID: ${brokerId}, Balance: ₹${brokerRes.body.current_value}`);

    // -----------------------------------------------------------------
    // TEST 6: Execute Transfer (₹200,000 from Kotak to Sahi Broker)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 6: Record Transfer of ₹200,000 POST /api/cashflow");
    const transferRes = await request('POST', '/cashflow', {
      type: 'transfer',
      amount: 200000,
      category: 'Trading Account Fund',
      date: '2026-11-11',
      description: 'Deposit in Sahi Broker Account',
      account_id: kotakId,
      to_account_id: brokerId,
      adjust_balance: 1
    });
    console.log("  Status:", transferRes.status, "Body:", transferRes.body);
    if (!transferRes.body || !transferRes.body.id) {
      throw new Error("FAIL: Transfer failed to record: " + JSON.stringify(transferRes.body));
    }
    const txId = transferRes.body.id;
    console.log(`  ✔ PASS: Transfer recorded with cashflow ID: ${txId}`);

    // -----------------------------------------------------------------
    // TEST 7: Verify Account Balances After Transfer
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 7: Check Balances After Transfer");
    const assetsAfter = await request('GET', '/assets');
    const kotakAfter = assetsAfter.body.find(a => a.id === kotakId);
    const brokerAfter = assetsAfter.body.find(a => a.id === brokerId);
    console.log(`  Kotak Balance: expected 300000, got: ${kotakAfter.current_value}`);
    console.log(`  Broker Balance: expected 200000, got: ${brokerAfter.current_value}`);
    if (kotakAfter.current_value !== 300000) throw new Error("FAIL: Kotak balance not 300000");
    if (brokerAfter.current_value !== 200000) throw new Error("FAIL: Broker balance not 200000");
    console.log("  ✔ PASS: Balances accurately synced after transfer");

    // -----------------------------------------------------------------
    // TEST 8: Query Cashflow History (Transfers filter)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 8: Verify Cashflow Listing GET /api/cashflow?type=transfer");
    const listRes = await request('GET', '/cashflow?type=transfer');
    console.log("  Transfers list length:", listRes.body.length);
    const foundTx = listRes.body.find(t => t.id === txId);
    if (!foundTx) throw new Error("FAIL: Transfer not found in cashflow list");
    console.log(`  Found Tx: From [${foundTx.account_name}] to [${foundTx.to_account_name}] Amount: ₹${foundTx.amount}`);
    if (foundTx.account_name !== 'Kotak Mahindra Bank' || foundTx.to_account_name !== 'Sahi Broker') {
      throw new Error("FAIL: Account names not joined properly on cashflow record");
    }
    console.log("  ✔ PASS: Cashflow list displays transfer with proper account names");

    // -----------------------------------------------------------------
    // TEST 9: Edit Transaction (Change Amount to ₹250,000)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 9: Edit Transfer Amount to ₹250,000 PUT /api/cashflow/:id");
    const editRes = await request('PUT', `/cashflow/${txId}`, {
      type: 'transfer',
      amount: 250000,
      category: 'Stock Broker Deposit',
      date: '2026-11-11',
      description: 'Updated: Deposit in Sahi Broker',
      account_id: kotakId,
      to_account_id: brokerId,
      adjust_balance: 1
    });
    console.log("  Status:", editRes.status, "Body:", editRes.body);

    const assetsAfterEdit = await request('GET', '/assets');
    const kotakAfterEdit = assetsAfterEdit.body.find(a => a.id === kotakId);
    const brokerAfterEdit = assetsAfterEdit.body.find(a => a.id === brokerId);
    console.log(`  Kotak Balance after edit: expected 250000, got: ${kotakAfterEdit.current_value}`);
    console.log(`  Broker Balance after edit: expected 250000, got: ${brokerAfterEdit.current_value}`);
    if (kotakAfterEdit.current_value !== 250000) throw new Error("FAIL: Kotak balance not updated to 250000");
    if (brokerAfterEdit.current_value !== 250000) throw new Error("FAIL: Broker balance not updated to 250000");
    console.log("  ✔ PASS: Transaction edit successfully adjusted balances");

    // -----------------------------------------------------------------
    // TEST 10: Delete/Undo Transaction (Restore Balances)
    // -----------------------------------------------------------------
    console.log("\n▶ TEST 10: Undo/Delete Transfer DELETE /api/cashflow/:id");
    const delRes = await request('DELETE', `/cashflow/${txId}`);
    console.log("  Status:", delRes.status, "Body:", delRes.body);

    const assetsAfterDel = await request('GET', '/assets');
    const kotakRestored = assetsAfterDel.body.find(a => a.id === kotakId);
    const brokerRestored = assetsAfterDel.body.find(a => a.id === brokerId);
    console.log(`  Kotak Balance restored: expected 500000, got: ${kotakRestored.current_value}`);
    console.log(`  Broker Balance restored: expected 0, got: ${brokerRestored.current_value}`);
    if (kotakRestored.current_value !== 500000) throw new Error("FAIL: Kotak balance not restored to 500000");
    if (brokerRestored.current_value !== 0) throw new Error("FAIL: Broker balance not restored to 0");
    console.log("  ✔ PASS: Deletion/Undo successfully restored balances to original state");

    console.log("\n=================================================");
    console.log("   🎉 ALL 10 COMPREHENSIVE DEBUG TESTS PASSED!   ");
    console.log("=================================================");

  } finally {
    server.close();
    // Clean up test directory
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
      console.log("[Cleanup] Cleaned up test sandbox directory.");
    } catch (e) {}
  }
}

runFullDebugTest().catch(err => {
  console.error("\n❌ DEBUG TEST FAILED:", err);
  process.exit(1);
});
