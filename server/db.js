const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_DIR = (() => {
  if (process.env.DB_DIR) return process.env.DB_DIR;
  return __dirname;
})();
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'networth.db');

let _rawDb = null;  // raw sql.js Database — used internally
let _db = null;     // wrapped db with better-sqlite3-like API
let inTransaction = false;

/** Called once at startup. Returns a wrapped db ready for synchronous use. */
async function initDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    _rawDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _rawDb = new SQL.Database();
  }
  _db = wrapDb();
  initSchema(_db);
  return _db;
}

/** Synchronous getter — use only after initDb() has resolved. */
function getDb() {
  if (!_db) throw new Error('Database not initialised. Call initDb() first.');
  return _db;
}

function saveDb() {
  if (!_rawDb || inTransaction) return;
  const data = _rawDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Compatibility wrappers (mirror better-sqlite3 API) ──
// Note: queryAll / queryOne use the raw sql.js Database.prepare(), not the wrapped db.prepare()

function queryAll(sql, params = []) {
  const stmt = _rawDb.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = _rawDb.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : undefined;
  stmt.free();
  return result;
}

function prepareAndRun(sql, params = []) {
  _rawDb.run(sql, params);
  const changes = _rawDb.getRowsModified();
  const row = queryOne('SELECT last_insert_rowid() AS id');
  saveDb();
  return { changes, lastInsertRowid: row ? row.id : 0 };
}

function execRaw(sql) {
  _rawDb.run(sql);
  saveDb();
}

function wrapDb() {
  const db = {};
  db._raw = _rawDb;
  db.prepare = function (sql) {
    return {
      all: (...p) => queryAll(sql, p),
      get: (...p) => queryOne(sql, p),
      run: (...p) => prepareAndRun(sql, p),
    };
  };
  db.exec = (sql) => execRaw(sql);
  db.transaction = function (fn) {
    return function (...args) {
      _rawDb.exec('BEGIN TRANSACTION;');
      inTransaction = true;
      try {
        const result = fn(...args);
        inTransaction = false;
        _rawDb.exec('COMMIT;');
        saveDb();
        return result;
      } catch (err) {
        inTransaction = false;
        try { _rawDb.exec('ROLLBACK;'); saveDb(); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr.message); }
        throw err;
      }
    };
  };
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      date_added TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liabilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      date_added TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cashflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      amount REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      description TEXT DEFAULT '',
      is_recurring INTEGER DEFAULT 0,
      frequency TEXT DEFAULT NULL,
      account_id INTEGER DEFAULT NULL,
      to_account_id INTEGER DEFAULT NULL,
      adjust_balance INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_name TEXT NOT NULL,
      category TEXT NOT NULL,
      buy_price REAL NOT NULL DEFAULT 0,
      current_price REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 1,
      buy_date TEXT NOT NULL DEFAULT (date('now')),
      platform TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      currency TEXT,
      ticker TEXT DEFAULT '',
      is_sip INTEGER DEFAULT 0,
      sip_monthly REAL DEFAULT 0,
      interest_rate REAL NOT NULL DEFAULT 0,
      maturity_date TEXT DEFAULT NULL,
      tenure TEXT DEFAULT '',
      payout_frequency TEXT DEFAULT 'Payment on Maturity',
      receiving_account_id INTEGER DEFAULT NULL,
      receiving_account_name TEXT DEFAULT '',
      last_interest_date TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('asset','liability','income','expense','investment','transfer')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direct_assets REAL NOT NULL DEFAULT 0,
      total_assets REAL NOT NULL DEFAULT 0,
      total_liabilities REAL NOT NULL DEFAULT 0,
      net_worth REAL NOT NULL DEFAULT 0,
      investment_value REAL NOT NULL DEFAULT 0,
      investment_pnl REAL NOT NULL DEFAULT 0,
      monthly_income REAL NOT NULL DEFAULT 0,
      monthly_expenses REAL NOT NULL DEFAULT 0,
      snapshot_date TEXT NOT NULL DEFAULT (datetime('now')),
      is_manual INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      monthly_limit REAL NOT NULL DEFAULT 0,
      month INTEGER,
      year INTEGER,
      start_date TEXT,
      end_date TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (budget_id) REFERENCES budgets(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      currency TEXT DEFAULT 'INR',
      currency_symbol TEXT DEFAULT '₹',
      date_format TEXT DEFAULT 'DD/MM/YYYY',
      app_name TEXT DEFAULT 'Net Worth Tracker',
      dashboard_layout TEXT DEFAULT NULL,
      exchange_rates TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      target_date TEXT,
      color TEXT DEFAULT '#14b8a6',
      icon TEXT DEFAULT '🎯',
      linked_asset_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (linked_asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS goal_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'monthly',
      next_due_date TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insurance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      policy_type TEXT NOT NULL,
      policy_number TEXT DEFAULT '',
      sum_assured REAL NOT NULL DEFAULT 0,
      cash_value REAL DEFAULT 0,
      premium_amount REAL NOT NULL DEFAULT 0,
      premium_frequency TEXT NOT NULL DEFAULT 'annual',
      next_due_date TEXT DEFAULT NULL,
      start_date TEXT DEFAULT NULL,
      maturity_date TEXT DEFAULT NULL,
      account_id INTEGER DEFAULT NULL,
      nominee TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const exists = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!exists) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }

  ensureBudgetColumns(db);
  ensureSnapshotColumns(db);
  ensureInvestmentColumns(db);
  ensureSettingsColumns(db);
  ensureGoalColumns(db);
  ensureSubscriptionColumns(db);
  ensureAssetColumns(db);
  ensureLiabilityColumns(db);
  ensureCashflowColumns(db);

  // Auto-seed default categories if none exist (e.g., fresh Electron install)
  const catCount = db.prepare('SELECT COUNT(*) AS cnt FROM categories').get();
  if (!catCount || catCount.cnt === 0) {
    seedDefaultCategories(db);
  }
  ensureCategoriesColumns(db);
  ensureInsuranceTable(db);
}

function ensureBudgetColumns(db) {
  const columns = db.prepare('PRAGMA table_info(budgets)').all().map((column) => column.name);
  if (!columns.includes('start_date')) db.exec('ALTER TABLE budgets ADD COLUMN start_date TEXT');
  if (!columns.includes('end_date')) db.exec('ALTER TABLE budgets ADD COLUMN end_date TEXT');
  if (!columns.includes('notes')) db.exec("ALTER TABLE budgets ADD COLUMN notes TEXT DEFAULT ''");
}

function ensureSnapshotColumns(db) {
  const columns = db.prepare('PRAGMA table_info(snapshots)').all().map((column) => column.name);
  if (!columns.includes('direct_assets')) db.exec('ALTER TABLE snapshots ADD COLUMN direct_assets REAL NOT NULL DEFAULT 0');
}

function ensureInvestmentColumns(db) {
  const columns = db.prepare('PRAGMA table_info(investments)').all().map((column) => column.name);
  if (!columns.includes('interest_rate')) db.exec('ALTER TABLE investments ADD COLUMN interest_rate REAL NOT NULL DEFAULT 0');
  if (!columns.includes('maturity_date')) db.exec('ALTER TABLE investments ADD COLUMN maturity_date TEXT');
  if (!columns.includes('currency')) db.exec('ALTER TABLE investments ADD COLUMN currency TEXT');
  if (!columns.includes('ticker')) db.exec('ALTER TABLE investments ADD COLUMN ticker TEXT DEFAULT ""');
  if (!columns.includes('tenure')) db.exec("ALTER TABLE investments ADD COLUMN tenure TEXT DEFAULT ''");
  if (!columns.includes('payout_frequency')) db.exec("ALTER TABLE investments ADD COLUMN payout_frequency TEXT DEFAULT 'Payment on Maturity'");
  if (!columns.includes('receiving_account_id')) db.exec('ALTER TABLE investments ADD COLUMN receiving_account_id INTEGER DEFAULT NULL');
  if (!columns.includes('receiving_account_name')) db.exec("ALTER TABLE investments ADD COLUMN receiving_account_name TEXT DEFAULT ''");
  if (!columns.includes('last_interest_date')) db.exec('ALTER TABLE investments ADD COLUMN last_interest_date TEXT DEFAULT NULL');
}

function ensureSettingsColumns(db) {
  const columns = db.prepare('PRAGMA table_info(settings)').all().map((column) => column.name);
  if (!columns.includes('app_name')) db.exec("ALTER TABLE settings ADD COLUMN app_name TEXT DEFAULT 'Net Worth Tracker'");
  if (!columns.includes('dashboard_layout')) db.exec("ALTER TABLE settings ADD COLUMN dashboard_layout TEXT DEFAULT NULL");
  if (!columns.includes('exchange_rates')) db.exec("ALTER TABLE settings ADD COLUMN exchange_rates TEXT DEFAULT NULL");
  if (!columns.includes('gdrive_client_id')) db.exec("ALTER TABLE settings ADD COLUMN gdrive_client_id TEXT DEFAULT NULL");
  if (!columns.includes('gdrive_client_secret')) db.exec("ALTER TABLE settings ADD COLUMN gdrive_client_secret TEXT DEFAULT NULL");
  if (!columns.includes('gdrive_refresh_token')) db.exec("ALTER TABLE settings ADD COLUMN gdrive_refresh_token TEXT DEFAULT NULL");
  if (!columns.includes('dropbox_client_id')) db.exec("ALTER TABLE settings ADD COLUMN dropbox_client_id TEXT DEFAULT NULL");
  if (!columns.includes('dropbox_client_secret')) db.exec("ALTER TABLE settings ADD COLUMN dropbox_client_secret TEXT DEFAULT NULL");
  if (!columns.includes('dropbox_refresh_token')) db.exec("ALTER TABLE settings ADD COLUMN dropbox_refresh_token TEXT DEFAULT NULL");
}

function ensureAssetColumns(db) {
  const columns = db.prepare('PRAGMA table_info(assets)').all().map((column) => column.name);
  if (!columns.includes('currency')) db.exec("ALTER TABLE assets ADD COLUMN currency TEXT DEFAULT NULL");
}

function ensureLiabilityColumns(db) {
  const columns = db.prepare('PRAGMA table_info(liabilities)').all().map((column) => column.name);
  if (!columns.includes('interest_rate')) db.exec("ALTER TABLE liabilities ADD COLUMN interest_rate REAL DEFAULT NULL");
  if (!columns.includes('minimum_payment')) db.exec("ALTER TABLE liabilities ADD COLUMN minimum_payment REAL DEFAULT NULL");
  if (!columns.includes('currency')) db.exec("ALTER TABLE liabilities ADD COLUMN currency TEXT DEFAULT NULL");
  if (!columns.includes('total_emis')) db.exec("ALTER TABLE liabilities ADD COLUMN total_emis INTEGER DEFAULT NULL");
  if (!columns.includes('remaining_emis')) db.exec("ALTER TABLE liabilities ADD COLUMN remaining_emis INTEGER DEFAULT NULL");
  if (!columns.includes('maturity_date')) db.exec("ALTER TABLE liabilities ADD COLUMN maturity_date TEXT DEFAULT NULL");
  if (!columns.includes('emi_day')) db.exec("ALTER TABLE liabilities ADD COLUMN emi_day INTEGER DEFAULT NULL");
}

function ensureGoalColumns(db) {
  // If we ever need to add columns to goals or contributions later, do it here.
}

function ensureSubscriptionColumns(db) {
  // Add columns to subscriptions later if needed
}

function ensureCashflowColumns(db) {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cashflow'").get();
  const sql = tableInfo?.sql || '';

  if (!sql.includes("'transfer'") || !sql.includes('account_id') || !sql.includes('to_account_id') || !sql.includes('adjust_balance')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cashflow_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
        amount REAL NOT NULL DEFAULT 0,
        category TEXT NOT NULL,
        date TEXT NOT NULL DEFAULT (date('now')),
        description TEXT DEFAULT '',
        is_recurring INTEGER DEFAULT 0,
        frequency TEXT DEFAULT NULL,
        account_id INTEGER DEFAULT NULL,
        to_account_id INTEGER DEFAULT NULL,
        adjust_balance INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const oldCols = db.prepare('PRAGMA table_info(cashflow)').all().map(c => c.name);
    const hasAccountId = oldCols.includes('account_id');
    const hasToAccountId = oldCols.includes('to_account_id');
    const hasAdjust = oldCols.includes('adjust_balance');

    const selectCols = `
      id, type, amount, category, date, description, is_recurring, frequency,
      ${hasAccountId ? 'account_id' : 'NULL AS account_id'},
      ${hasToAccountId ? 'to_account_id' : 'NULL AS to_account_id'},
      ${hasAdjust ? 'adjust_balance' : '1 AS adjust_balance'},
      created_at, updated_at
    `;

    db.exec(`
      INSERT INTO cashflow_new (id, type, amount, category, date, description, is_recurring, frequency, account_id, to_account_id, adjust_balance, created_at, updated_at)
      SELECT ${selectCols} FROM cashflow;
      DROP TABLE cashflow;
      ALTER TABLE cashflow_new RENAME TO cashflow;
    `);
  }
}

function ensureCategoriesColumns(db) {
  const catTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'").get();
  if (catTable && catTable.sql && !catTable.sql.includes("'transfer'")) {
    db.exec(`
      CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('asset','liability','income','expense','investment','transfer')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO categories_new (id, name, type, created_at)
      SELECT id, name, type, created_at FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;
    `);
  }

  // Ensure default transfer categories are seeded
  const transferCount = db.prepare("SELECT COUNT(*) AS cnt FROM categories WHERE type = 'transfer'").get();
  if (!transferCount || transferCount.cnt === 0) {
    const defaultTransfer = [
      'Transfer',
      'Trading Account Fund',
      'Stock Broker Deposit',
      'Investment Deposit',
      'ATM Cash Withdrawal',
      'Wallet Top-up',
      'Credit Card Payment',
      'Savings Transfer',
      'Other Transfer'
    ];
    const insertCat = db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)');
    for (const cat of defaultTransfer) {
      insertCat.run(cat, 'transfer');
    }
  }

  // Ensure key asset categories exist
  const ensureCat = (name, type) => {
    const found = db.prepare('SELECT id FROM categories WHERE name = ? AND type = ?').get(name, type);
    if (!found) {
      db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(name, type);
    }
  };
  ensureCat('Trading / Brokerage Account', 'asset');
  ensureCat('ETF', 'asset');
  ensureCat('Fixed Deposit (FD)', 'investment');
  ensureCat('Recurring Deposit (RD)', 'investment');
  ensureCat('Bonds', 'investment');
  db.prepare("DELETE FROM categories WHERE name = 'FD/RD' AND type = 'investment'").run();
  db.prepare("UPDATE investments SET category = 'Fixed Deposit (FD)' WHERE category = 'FD/RD'").run();
}

function ensureInsuranceTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insurance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      policy_type TEXT NOT NULL,
      policy_number TEXT DEFAULT '',
      sum_assured REAL NOT NULL DEFAULT 0,
      cash_value REAL DEFAULT 0,
      premium_amount REAL NOT NULL DEFAULT 0,
      premium_frequency TEXT NOT NULL DEFAULT 'annual',
      next_due_date TEXT DEFAULT NULL,
      start_date TEXT DEFAULT NULL,
      maturity_date TEXT DEFAULT NULL,
      account_id INTEGER DEFAULT NULL,
      nominee TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function seedDefaultCategories(db) {
  const insertCat = (name, type) =>
    db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)').run(name, type);

  // Asset categories
  insertCat('Cash', 'asset');
  insertCat('Bank Accounts', 'asset');
  insertCat('Trading / Brokerage Account', 'asset');
  insertCat('Real Estate', 'asset');
  insertCat('Vehicles', 'asset');
  insertCat('Crypto', 'asset');
  insertCat('Stocks', 'asset');
  insertCat('Mutual Funds', 'asset');
  insertCat('ETF', 'asset');
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
  insertCat('Fixed Deposit (FD)', 'investment');
  insertCat('Recurring Deposit (RD)', 'investment');
  insertCat('Bonds', 'investment');
  insertCat('Real Estate', 'investment');
  insertCat('Gold', 'investment');
  insertCat('SIP', 'investment');
  // Transfer categories
  insertCat('Transfer', 'transfer');
  insertCat('Trading Account Fund', 'transfer');
  insertCat('Stock Broker Deposit', 'transfer');
  insertCat('Investment Deposit', 'transfer');
  insertCat('ATM Cash Withdrawal', 'transfer');
  insertCat('Wallet Top-up', 'transfer');
  insertCat('Credit Card Payment', 'transfer');
  insertCat('Savings Transfer', 'transfer');
  insertCat('Other Transfer', 'transfer');

  console.log('Default categories seeded: ' +
    '10 asset, 5 liability, 7 income, 12 expense, 8 investment, 9 transfer');
}

module.exports = { initDb, getDb, ensureBudgetColumns, ensureSnapshotColumns, ensureInvestmentColumns, ensureSettingsColumns, ensureCashflowColumns, ensureCategoriesColumns, ensureInsuranceTable, DB_PATH };