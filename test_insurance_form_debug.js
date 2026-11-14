const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const express = require('express');

// Set isolated test directory
const TEST_DIR = path.join(__dirname, 'test_temp_insurance_dir');
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_DIR = TEST_DIR;

const { initDb, getDb, ensureInsuranceTable } = require('./server/db');
const insuranceRoutes = require('./server/routes/insurance');

function makeRequest(server, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== Running Insurance Form Custom Fields & Route Verification ===\n');

  const db = await initDb();
  ensureInsuranceTable(db);

  const app = express();
  app.use(express.json());
  app.use('/api/insurance', insuranceRoutes);

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  console.log('✓ Express test server listening on port', server.address().port);

  // 1. POST create policy via API
  const createPayload = {
    policy_name: "LIC's Nivesh Plus",
    provider: 'LIC',
    policy_type: 'ulip',
    policy_number: '507864590',
    sum_assured: 125000,
    cash_value: 111036.26,
    premium_amount: 0,
    premium_frequency: 'annual',
    start_date: '2024-03-26',
    maturity_date: '2034-03-26',
    policy_term: '10 Years',
    maturity_payout_option: 'Payment on Maturity + Accrued Bonuses',
    maturity_amount: 155000,
    vested_bonus: 25000,
    loyalty_addition: 5000,
    status: 'active',
    notes: 'LIC ULIP single premium endowment'
  };

  const postRes = await makeRequest(server, '/api/insurance', 'POST', createPayload);
  assert.strictEqual(postRes.status, 201, `Expected status 201, got ${postRes.status}: ${JSON.stringify(postRes.body)}`);
  const createdPolicy = postRes.body;
  assert.strictEqual(createdPolicy.policy_name, "LIC's Nivesh Plus");
  assert.strictEqual(createdPolicy.policy_term, '10 Years');
  assert.strictEqual(createdPolicy.maturity_payout_option, 'Payment on Maturity + Accrued Bonuses');
  assert.strictEqual(Number(createdPolicy.maturity_amount), 155000);
  assert.strictEqual(Number(createdPolicy.vested_bonus), 25000);
  assert.strictEqual(Number(createdPolicy.loyalty_addition), 5000);
  console.log('✓ Successfully created policy via POST /api/insurance: id =', createdPolicy.id);

  // 2. GET all policies via API
  const getRes = await makeRequest(server, '/api/insurance', 'GET');
  assert.strictEqual(getRes.status, 200);
  assert(Array.isArray(getRes.body));
  const found = getRes.body.find(p => p.id === createdPolicy.id);
  assert(found, 'Created policy should be found in GET list');
  assert.strictEqual(found.policy_term, '10 Years');
  assert.strictEqual(found.maturity_payout_option, 'Payment on Maturity + Accrued Bonuses');
  console.log('✓ Successfully verified policy in GET /api/insurance');

  // 3. PUT update policy via API
  const updatePayload = {
    ...createdPolicy,
    policy_term: '12 Years',
    maturity_payout_option: 'Periodic Survival / Money Back Payouts',
    maturity_amount: 175000,
    vested_bonus: 40000,
    loyalty_addition: 10000
  };

  const putRes = await makeRequest(server, `/api/insurance/${createdPolicy.id}`, 'PUT', updatePayload);
  assert.strictEqual(putRes.status, 200, `Expected 200, got ${putRes.status}`);
  assert.strictEqual(putRes.body.policy_term, '12 Years');
  assert.strictEqual(putRes.body.maturity_payout_option, 'Periodic Survival / Money Back Payouts');
  assert.strictEqual(Number(putRes.body.maturity_amount), 175000);
  assert.strictEqual(Number(putRes.body.vested_bonus), 40000);
  assert.strictEqual(Number(putRes.body.loyalty_addition), 10000);
  console.log('✓ Successfully updated policy via PUT /api/insurance/:id');

  // Close server
  await new Promise(r => server.close(r));
  console.log('✓ Server closed.');

  // Clean up
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  console.log('\n=== ALL END-TO-END INSURANCE ROUTE TESTS PASSED! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
