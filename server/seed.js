const { initDb, getDb } = require('./db');
const { takeSnapshot } = require('./routes/snapshots');
const bcrypt = require('bcryptjs');

async function seed() {
  await initDb();
  const db = getDb();

  // Clear existing data
  db.exec('DELETE FROM snapshots');
  db.exec('DELETE FROM investments');
  db.exec('DELETE FROM cashflow');
  db.exec('DELETE FROM liabilities');
  db.exec('DELETE FROM assets');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM users');

  // Seed default user (admin / admin123)
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Default user seeded: admin / admin123');

  // Seed Categories
  const insertCat = (name, type) =>
    db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(name, type);
  // Asset categories
  insertCat('Cash', 'asset');
  insertCat('Bank Accounts', 'asset');
  insertCat('Real Estate', 'asset');
  insertCat('Vehicles', 'asset');
  insertCat('Crypto', 'asset');
  insertCat('Stocks', 'asset');
  insertCat('Mutual Funds', 'asset');
  insertCat('PF/PPF', 'asset');
  insertCat('Gold', 'asset');
  insertCat('Other', 'asset');
  // Liability categories
  insertCat('Home Loan', 'liability');
  insertCat('Car Loan', 'liability');
  insertCat('Personal Loan', 'liability');
  insertCat('Credit Card', 'liability');
  insertCat('Other Debt', 'liability');
  // Income categories
  insertCat('Salary', 'income');
  insertCat('Freelance', 'income');
  insertCat('Rental', 'income');
  insertCat('Dividends', 'income');
  insertCat('Interest', 'income');
  insertCat('Business', 'income');
  insertCat('Other', 'income');
  // Expense categories
  insertCat('Housing', 'expense');
  insertCat('Food', 'expense');
  insertCat('Transport', 'expense');
  insertCat('EMI/Loan Payments', 'expense');
  insertCat('Subscriptions', 'expense');
  insertCat('Medical', 'expense');
  insertCat('Utilities', 'expense');
  insertCat('Entertainment', 'expense');
  insertCat('Shopping', 'expense');
  insertCat('Education', 'expense');
  insertCat('Insurance', 'expense');
  insertCat('Other', 'expense');
  // Investment categories
  insertCat('Stocks', 'investment');
  insertCat('Mutual Funds', 'investment');
  insertCat('Crypto', 'investment');
  insertCat('FD/RD', 'investment');
  insertCat('Bonds', 'investment');
  insertCat('Real Estate', 'investment');
  insertCat('Gold', 'investment');
  insertCat('SIP', 'investment');

  // Seed Assets
  const insertAsset = (name, category, current_value, date_added, notes) =>
    db.prepare('INSERT INTO assets (name, category, current_value, date_added, notes) VALUES (?, ?, ?, ?, ?)').run(name, category, current_value, date_added, notes);
  insertAsset('HDFC Savings Account', 'Bank Accounts', 850000, '2025-01-15', 'Primary savings account');
  insertAsset('SBI Fixed Deposit', 'Bank Accounts', 500000, '2024-06-01', '1-year FD at 7% interest');
  insertAsset('Primary Residence', 'Real Estate', 8500000, '2023-03-20', '3BHK apartment in Mumbai suburb');
  insertAsset('Maruti Swift', 'Vehicles', 600000, '2024-09-10', 'Current market value');
  insertAsset('Bitcoin Holdings', 'Crypto', 250000, '2024-11-01', '0.05 BTC on WazirX');
  insertAsset('PPF Account', 'PF/PPF', 350000, '2022-01-01', 'SBI PPF, matures 2037');
  insertAsset('Physical Gold', 'Gold', 400000, '2024-08-15', '50 grams, 24K');

  // Seed Liabilities
  const insertLiability = (name, category, current_value, date_added, notes) =>
    db.prepare('INSERT INTO liabilities (name, category, current_value, date_added, notes) VALUES (?, ?, ?, ?, ?)').run(name, category, current_value, date_added, notes);
  insertLiability('Home Loan - HDFC', 'Home Loan', 4500000, '2023-03-20', 'Outstanding principal, 8.5% p.a.');
  insertLiability('Car Loan - SBI', 'Car Loan', 350000, '2024-09-10', 'Remaining on Swift, 9% p.a.');
  insertLiability('HDFC Credit Card', 'Credit Card', 45000, '2026-05-01', 'Current month outstanding');

  // Seed Cashflow
  const insertCF = (type, amount, category, date, description, is_recurring, frequency) =>
    db.prepare('INSERT INTO cashflow (type, amount, category, date, description, is_recurring, frequency) VALUES (?, ?, ?, ?, ?, ?, ?)').run(type, amount, category, date, description, is_recurring, frequency);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const pad = (v) => String(v).padStart(2, '0');

  insertCF('income', 125000, 'Salary', `${y}-${pad(m)}-01`, 'Monthly salary', 1, 'monthly');
  insertCF('income', 15000, 'Rental', `${y}-${pad(m)}-05`, 'Rental income from property', 1, 'monthly');
  insertCF('income', 8000, 'Dividends', `${y}-${pad(m)}-10`, 'Stock dividends', 0, null);
  insertCF('expense', 32000, 'Housing', `${y}-${pad(m)}-01`, 'Rent + maintenance', 1, 'monthly');
  insertCF('expense', 38500, 'EMI/Loan Payments', `${y}-${pad(m)}-03`, 'Home loan EMI', 1, 'monthly');
  insertCF('expense', 12000, 'Food', `${y}-${pad(m)}-05`, 'Groceries + dining', 1, 'monthly');
  insertCF('expense', 8000, 'Transport', `${y}-${pad(m)}-02`, 'Fuel + maintenance', 1, 'monthly');
  insertCF('expense', 3000, 'Subscriptions', `${y}-${pad(m)}-07`, 'Netflix, Spotify, etc.', 1, 'monthly');
  insertCF('expense', 5000, 'Medical', `${y}-${pad(m)}-12`, 'Health checkup', 0, null);
  insertCF('expense', 6000, 'Other', `${y}-${pad(m)}-15`, 'Miscellaneous', 0, null);

  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  insertCF('income', 125000, 'Salary', `${prevY}-${pad(prevM)}-01`, 'Monthly salary', 1, 'monthly');
  insertCF('income', 15000, 'Rental', `${prevY}-${pad(prevM)}-05`, 'Rental income', 1, 'monthly');
  insertCF('expense', 32000, 'Housing', `${prevY}-${pad(prevM)}-01`, 'Rent + maintenance', 1, 'monthly');
  insertCF('expense', 38500, 'EMI/Loan Payments', `${prevY}-${pad(prevM)}-03`, 'Home loan EMI', 1, 'monthly');
  insertCF('expense', 11000, 'Food', `${prevY}-${pad(prevM)}-06`, 'Groceries + dining', 1, 'monthly');

  const prevM2 = prevM === 1 ? 12 : prevM - 1;
  const prevY2 = prevM === 1 ? prevY - 1 : prevY;
  insertCF('income', 125000, 'Salary', `${prevY2}-${pad(prevM2)}-01`, 'Monthly salary', 1, 'monthly');
  insertCF('income', 15000, 'Rental', `${prevY2}-${pad(prevM2)}-05`, 'Rental income', 1, 'monthly');
  insertCF('expense', 32000, 'Housing', `${prevY2}-${pad(prevM2)}-01`, 'Rent + maintenance', 1, 'monthly');
  insertCF('expense', 38500, 'EMI/Loan Payments', `${prevY2}-${pad(prevM2)}-03`, 'Home loan EMI', 1, 'monthly');
  insertCF('expense', 10500, 'Food', `${prevY2}-${pad(prevM2)}-08`, 'Groceries + dining', 1, 'monthly');

  // Seed Investments
  const insertInv = (asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes, is_sip, sip_monthly) =>
    db.prepare('INSERT INTO investments (asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes, is_sip, sip_monthly) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(asset_name, category, buy_price, current_price, quantity, buy_date, platform, notes, is_sip, sip_monthly);
  insertInv('Reliance Industries', 'Stocks', 2500, 2850, 50, '2024-01-15', 'Zerodha', 'Long-term hold', 0, 0);
  insertInv('HDFC Bank', 'Stocks', 1600, 1720, 100, '2024-03-10', 'Zerodha', 'Blue chip', 0, 0);
  insertInv('Mirae Asset Emerging Bluechip', 'Mutual Funds', 100, 135, 2000, '2023-06-01', 'Groww', 'SIP - ₹5,000/month', 1, 5000);
  insertInv('SBI Magnum Gilt Fund', 'Mutual Funds', 50, 58, 5000, '2023-08-15', 'Groww', 'Debt fund for safety', 0, 0);
  insertInv('Sovereign Gold Bond 2024', 'Bonds', 6000, 6500, 20, '2024-02-10', 'SBI', 'SGB series', 0, 0);

  // Historical snapshots
  const insertSnap = (total_assets, total_liabilities, net_worth, investment_value, investment_pnl, monthly_income, monthly_expenses, snapshot_date) =>
    db.prepare('INSERT INTO snapshots (total_assets, total_liabilities, net_worth, investment_value, investment_pnl, monthly_income, monthly_expenses, is_manual, snapshot_date) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)').run(total_assets, total_liabilities, net_worth, investment_value, investment_pnl, monthly_income, monthly_expenses, snapshot_date);
  insertSnap(10200000, 4895000, 5305000, 740000, 92000, 140000, 92000, `${prevY2}-${pad(prevM2)}-15 10:00:00`);
  insertSnap(10400000, 4890000, 5510000, 755000, 96000, 140000, 91000, `${prevY}-${pad(prevM)}-15 10:00:00`);

  // Take current snapshot
  await takeSnapshot();

  console.log('Database seeded successfully!');
  process.exit(0);
}

seed();