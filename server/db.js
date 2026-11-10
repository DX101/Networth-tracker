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
  saveDb();
  const row = queryOne('SELECT last_insert_rowid() AS id');
  return { changes: _rawDb.getRowsModified(), lastInsertRowid: row ? row.id : 0 };
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
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      description TEXT DEFAULT '',
      is_recurring INTEGER DEFAULT 0,
      frequency TEXT DEFAULT NULL,
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
      type TEXT NOT NULL CHECK(type IN ('asset','liability','income','expense','investment')),
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

  // Auto-seed default categories if none exist (e.g., fresh Electron install)
  const catCount = db.prepare('SELECT COUNT(*) AS cnt FROM categories').get();
  if (!catCount || catCount.cnt === 0) {
    seedDefaultCategories(db);
  }
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

function seedDefaultCategories(db) {
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

  console.log('Default categories seeded: ' +
    '10 asset, 5 liability, 7 income, 12 expense, 8 investment');
}

module.exports = { initDb, getDb, ensureBudgetColumns, ensureSnapshotColumns, ensureInvestmentColumns, ensureSettingsColumns, DB_PATH };