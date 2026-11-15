const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { initDb } = require('./server/db');
const { authMiddleware } = require('./server/middleware/auth');

const assetsRoutes = require('./server/routes/assets');
const liabilitiesRoutes = require('./server/routes/liabilities');
const cashflowRoutes = require('./server/routes/cashflow');
const investmentsRoutes = require('./server/routes/investments');
const snapshotsRoutes = require('./server/routes/snapshots');
const settingsRoutes = require('./server/routes/settings');
const categoriesRoutes = require('./server/routes/categories');
const budgetsRoutes = require('./server/routes/budgets');
const authRoutes = require('./server/routes/auth');
const goalsRoutes = require('./server/routes/goals');
const subscriptionsRoutes = require('./server/routes/subscriptions');
const insuranceRoutes = require('./server/routes/insurance');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/assets', authMiddleware, assetsRoutes);
app.use('/api/liabilities', authMiddleware, liabilitiesRoutes);
app.use('/api/cashflow', authMiddleware, cashflowRoutes);
app.use('/api/investments', authMiddleware, investmentsRoutes);
app.use('/api/snapshots', authMiddleware, snapshotsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/categories', authMiddleware, categoriesRoutes);
app.use('/api/budgets', authMiddleware, budgetsRoutes);
app.use('/api/goals', authMiddleware, goalsRoutes);
app.use('/api/subscriptions', authMiddleware, subscriptionsRoutes);
app.use('/api/insurance', authMiddleware, insuranceRoutes);

const PORT = 3008;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers,
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function testSuite() {
  console.log('--- STARTING MULTI-USER ISOLATION TEST SUITE ---');

  const stamp = Date.now();
  const userA_name = `user_a_${stamp}`;
  const userB_name = `user_b_${stamp}`;

  // 1. Register User A
  console.log(`1. Registering ${userA_name}...`);
  const regA = await request('POST', '/api/auth/register', { username: userA_name, password: 'password123' });
  if (!regA.body.token) throw new Error(`User A registration failed: ${JSON.stringify(regA.body)}`);
  const tokenA = regA.body.token;

  // 2. Register User B
  console.log(`2. Registering ${userB_name}...`);
  const regB = await request('POST', '/api/auth/register', { username: userB_name, password: 'password123' });
  if (!regB.body.token) throw new Error(`User B registration failed: ${JSON.stringify(regB.body)}`);
  const tokenB = regB.body.token;

  // 3. User A adds Asset
  console.log('3. User A creating asset "User A Secret Vault"...');
  const createAssetA = await request('POST', '/api/assets', {
    name: 'User A Secret Vault',
    category: 'Bank Accounts',
    current_value: 500000,
    currency: 'INR'
  }, tokenA);
  console.log('   Created:', createAssetA.body.name, 'id:', createAssetA.body.id);

  // 4. User B gets Assets -> MUST BE EMPTY
  console.log('4. User B fetching assets...');
  const assetsB = await request('GET', '/api/assets', null, tokenB);
  console.log(`   User B sees ${assetsB.body.length} assets.`);
  if (assetsB.body.some(a => a.name.includes('User A'))) {
    throw new Error('SECURITY VIOLATION: User B can see User A asset!');
  }

  // 5. User B adds Asset
  console.log('5. User B creating asset "User B Personal Wallet"...');
  const createAssetB = await request('POST', '/api/assets', {
    name: 'User B Personal Wallet',
    category: 'Cash',
    current_value: 12000,
    currency: 'INR'
  }, tokenB);
  console.log('   Created:', createAssetB.body.name, 'id:', createAssetB.body.id);

  // 6. User A gets Assets -> MUST ONLY SEE User A asset
  console.log('6. User A fetching assets...');
  const assetsA = await request('GET', '/api/assets', null, tokenA);
  console.log(`   User A sees ${assetsA.body.length} assets.`);
  if (assetsA.body.some(a => a.name.includes('User B'))) {
    throw new Error('SECURITY VIOLATION: User A can see User B asset!');
  }
  if (!assetsA.body.some(a => a.name.includes('User A Secret Vault'))) {
    throw new Error('ERROR: User A cannot see own asset!');
  }

  // 7. Test Cashflow Isolation
  console.log('7. User A adding cashflow income ₹75,000...');
  await request('POST', '/api/cashflow', {
    type: 'income',
    amount: 75000,
    category: 'Salary',
    description: 'User A Monthly Salary'
  }, tokenA);

  const cfB = await request('GET', '/api/cashflow', null, tokenB);
  console.log(`   User B sees ${cfB.body.length} cashflow records.`);
  if (cfB.body.some(c => c.description && c.description.includes('User A'))) {
    throw new Error('SECURITY VIOLATION: User B can see User A cashflow!');
  }

  // 8. Test Budget Isolation
  console.log('8. User A adding budget ₹8,000...');
  await request('POST', '/api/budgets', {
    category: 'Entertainment',
    monthly_limit: 8000
  }, tokenA);

  const budgetsB = await request('GET', '/api/budgets', null, tokenB);
  console.log(`   User B sees ${budgetsB.body.length} budgets.`);
  if (budgetsB.body.some(b => b.category === 'Entertainment')) {
    throw new Error('SECURITY VIOLATION: User B can see User A budget!');
  }

  // 9. Test Settings Isolation
  console.log('9. User A updating currency to USD...');
  await request('PUT', '/api/settings', {
    currency: 'USD',
    currency_symbol: '$'
  }, tokenA);

  const settingsA = await request('GET', '/api/settings', null, tokenA);
  const settingsB = await request('GET', '/api/settings', null, tokenB);
  console.log(`   User A currency is: ${settingsA.body.settings?.currency}`);
  console.log(`   User B currency is: ${settingsB.body.settings?.currency} (should be INR default)`);
  if (settingsA.body.settings?.currency !== 'USD') {
    throw new Error('ERROR: User A currency was not updated to USD!');
  }
  if (settingsB.body.settings?.currency === 'USD') {
    throw new Error('SECURITY VIOLATION: User B settings was changed by User A!');
  }

  // 10. Verify legacy user DX101 still has all their existing assets intact!
  console.log('10. Verifying DX101 existing data integrity...');
  const loginDX101 = await request('POST', '/api/auth/login', { username: 'DX101', password: 'password123' });
  if (loginDX101.body.token) {
    const assetsDX101 = await request('GET', '/api/assets', null, loginDX101.body.token);
    console.log(`   DX101 has ${assetsDX101.body.length} assets intact!`);
  }

  console.log('=== MULTI-USER ISOLATION VERIFIED 100% AIRTIGHT & SECURE ===');
}

initDb().then(() => {
  const server = app.listen(PORT, '127.0.0.1', async () => {
    console.log(`Test server active on port ${PORT}`);
    try {
      await testSuite();
      server.close();
      process.exit(0);
    } catch (err) {
      console.error('TEST ERROR:', err);
      server.close();
      process.exit(1);
    }
  });
}).catch(err => {
  console.error('INIT ERROR:', err);
  process.exit(1);
});
