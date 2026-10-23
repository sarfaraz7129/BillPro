'use strict';
/**
 * BillPro - SQLite schema + connection.
 * Every user-owned table is scoped by business_id so a single account can
 * run several businesses with fully isolated data, while the "group" queries
 * can still aggregate across businesses for the consolidated dashboard.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.BILLPRO_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.BILLPRO_DB || path.join(DATA_DIR, 'billpro.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner',      -- owner | admin | accountant | staff
  permissions   TEXT NOT NULL DEFAULT '[]',          -- JSON array of permission keys
  active_business_id INTEGER,
  lang          TEXT NOT NULL DEFAULT 'en',
  created_at    TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS businesses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  legal_name        TEXT,
  gstin             TEXT,
  pan               TEXT,
  address           TEXT,
  city              TEXT,
  state             TEXT,
  state_code        TEXT,
  pincode           TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  logo_url          TEXT,
  bank_name         TEXT,
  bank_account_no   TEXT,
  bank_ifsc         TEXT,
  bank_branch       TEXT,
  upi_id            TEXT,
  invoice_prefix    TEXT DEFAULT 'INV',
  invoice_counter   INTEGER NOT NULL DEFAULT 1000,
  quoter_prefix     TEXT DEFAULT 'QT',
  quoter_counter    INTEGER NOT NULL DEFAULT 100,
  default_gst_rate  REAL NOT NULL DEFAULT 18,
  composition_scheme INTEGER NOT NULL DEFAULT 0,
  invoice_theme     TEXT NOT NULL DEFAULT 'classic',
  invoice_footer    TEXT,
  terms             TEXT DEFAULT '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. will be charged on overdue bills.\n3. Subject to Karnataka jurisdiction.',
  credit_days       INTEGER NOT NULL DEFAULT 30,
  color             TEXT NOT NULL DEFAULT '#4f46e5',
  created_at        TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS parties (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'customer',   -- customer | supplier
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  gstin        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  state_code   TEXT,
  pincode      TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,         -- +ve = they owe us, -ve = we owe them
  balance_type TEXT NOT NULL DEFAULT 'DR',          -- DR = they owe us, CR = we owe them
  credit_limit REAL NOT NULL DEFAULT 0,
  credit_days  INTEGER NOT NULL DEFAULT 30,
  tag          TEXT,
  notes        TEXT,
  inactive     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes')),
  UNIQUE(business_id, name, type)
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sku           TEXT,
  barcode       TEXT,
  name          TEXT NOT NULL,
  category      TEXT,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  hsn           TEXT,
  gst_rate      REAL NOT NULL DEFAULT 18,
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price    REAL NOT NULL DEFAULT 0,
  stock         REAL NOT NULL DEFAULT 0,
  opening_stock REAL NOT NULL DEFAULT 0,
  low_stock_at  REAL NOT NULL DEFAULT 0,
  tax_inclusive INTEGER NOT NULL DEFAULT 0,
  inactive      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS product_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes')),
  UNIQUE(business_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,     -- sale | purchase | quotation | expense
  number        TEXT NOT NULL,
  party_id      INTEGER REFERENCES parties(id) ON DELETE SET NULL,
  party_name    TEXT,
  party_gstin   TEXT,
  party_state_code TEXT,
  date          TEXT NOT NULL,
  due_date      TEXT,
  place_of_supply TEXT,
  supply_type   TEXT NOT NULL DEFAULT 'intra',  -- intra | inter
  currency      TEXT NOT NULL DEFAULT 'INR',
  items         TEXT NOT NULL DEFAULT '[]',     -- JSON
  subtotal      REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'flat',
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  taxable_value REAL NOT NULL DEFAULT 0,
  cgst          REAL NOT NULL DEFAULT 0,
  sgst          REAL NOT NULL DEFAULT 0,
  igst          REAL NOT NULL DEFAULT 0,
  cess          REAL NOT NULL DEFAULT 0,
  round_off     REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  amount_in_words TEXT,
  paid_amount   REAL NOT NULL DEFAULT 0,
  due_amount    REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | partial | paid
  payment_mode  TEXT,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | draft | cancelled
  notes         TEXT,
  transport_doc_no TEXT,
  vehicle_no    TEXT,
  ewaybill_no   TEXT,
  ewaybill_date TEXT,
  ewaybill_valid_upto TEXT,
  irn           TEXT,
  ack_no        TEXT,
  ack_date      TEXT,
  signed_by     TEXT,
  created_by    INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes')),
  UNIQUE(business_id, type, number)
);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  party_id     INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,          -- you_gave | you_got | interest | adjustment
  amount       REAL NOT NULL,
  date         TEXT NOT NULL,
  mode         TEXT DEFAULT 'cash',    -- cash | upi | bank | card | cheque | credit
  reference    TEXT,
  document_id  INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty          REAL NOT NULL,          -- +ve in, -ve out
  date         TEXT NOT NULL,
  reason       TEXT NOT NULL,          -- sale | purchase | adjustment | opening
  document_id  INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  rate         REAL NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS staff (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  role         TEXT NOT NULL DEFAULT 'staff',   -- admin | accountant | staff
  permissions  TEXT NOT NULL DEFAULT '[]',
  invited      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes')),
  UNIQUE(business_id, email)
);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER,
  user_id     INTEGER,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  shop_name   TEXT,
  city        TEXT,
  plan        TEXT DEFAULT 'yearly',
  message     TEXT,
  status      TEXT DEFAULT 'new',
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+330 minutes'))
);

CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_parties_biz   ON parties(business_id, type);
CREATE INDEX IF NOT EXISTS idx_docs_biz      ON documents(business_id, type);
CREATE INDEX IF NOT EXISTS idx_docs_party    ON documents(party_id);
CREATE INDEX IF NOT EXISTS idx_docs_date     ON documents(date);
CREATE INDEX IF NOT EXISTS idx_txn_party     ON transactions(party_id);
CREATE INDEX IF NOT EXISTS idx_txn_biz       ON transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_products_biz  ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_biz     ON stock_moves(business_id);
CREATE INDEX IF NOT EXISTS idx_biz_owner     ON businesses(owner_id);
`);

// Migration: Ensure user table has subscription & admin columns
try {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('is_superadmin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols.includes('status')) {
    db.exec('ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT "active"');
  }
  if (!userCols.includes('plan')) {
    db.exec('ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT "yearly"');
  }
  if (!userCols.includes('expires_at')) {
    db.exec('ALTER TABLE users ADD COLUMN expires_at TEXT');
  }

  const bcrypt = require('bcryptjs');
  const ALL_PERMS = JSON.stringify(['dashboard', 'billing', 'khata', 'inventory', 'reports', 'settings', 'staff']);

  // Ensure Super Admin account demo@billpro.in ALWAYS exists with password demo1234
  const existingSuperAdmin = db.prepare("SELECT id FROM users WHERE lower(email) = 'demo@billpro.in'").get();
  let superAdminId;
  if (!existingSuperAdmin) {
    const sInfo = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at)
      VALUES (?, 'demo@billpro.in', '9845000000', ?, 'owner', ?, 1, 'active', 'lifetime', NULL)
    `).run('Super Admin', bcrypt.hashSync('demo1234', 10), ALL_PERMS);
    superAdminId = sInfo.lastInsertRowid;
  } else {
    superAdminId = existingSuperAdmin.id;
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, is_superadmin = 1, status = 'active', plan = 'lifetime', role = 'owner'
      WHERE id = ?
    `).run(bcrypt.hashSync('demo1234', 10), superAdminId);
  }

  // Also ensure admin@billpro.in exists as an alias for Super Admin (password: demo1234 or admin1234)
  const existingAdmin = db.prepare("SELECT id FROM users WHERE lower(email) = 'admin@billpro.in'").get();
  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at)
      VALUES (?, 'admin@billpro.in', '9845000000', ?, 'owner', ?, 1, 'active', 'lifetime', NULL)
    `).run('Super Admin', bcrypt.hashSync('demo1234', 10), ALL_PERMS);
  } else {
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, is_superadmin = 1, status = 'active', plan = 'lifetime', role = 'owner'
      WHERE id = ?
    `).run(bcrypt.hashSync('demo1234', 10), existingAdmin.id);
  }

  // Ensure dedicated demo merchant user exists (is_superadmin = 0) for public 1-click feature exploration
  const existingDemoUser = db.prepare("SELECT id FROM users WHERE lower(email) = 'demo.user@billpro.in'").get();
  if (!existingDemoUser) {
    db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at)
      VALUES (?, 'demo.user@billpro.in', '9845011223', ?, 'owner', ?, 0, 'active', 'yearly', '2028-12-31')
    `).run('Demo Merchant', bcrypt.hashSync('demo1234', 10), ALL_PERMS);
  } else {
    db.prepare("UPDATE users SET password_hash = ?, is_superadmin = 0, status = 'active', plan = 'yearly' WHERE lower(email) = 'demo.user@billpro.in'")
      .run(bcrypt.hashSync('demo1234', 10));
  }

  // Ensure starter businesses exist and are linked
  const ensureBiz = (ownerEmail, bizName) => {
    const u = db.prepare("SELECT id, active_business_id FROM users WHERE lower(email) = ?").get(ownerEmail);
    if (!u) return;
    let b = db.prepare("SELECT id FROM businesses WHERE owner_id = ?").get(u.id);
    if (!b) {
      const bInfo = db.prepare(`
        INSERT INTO businesses (owner_id, name, legal_name, invoice_prefix, quoter_prefix, default_gst_rate, credit_days, color)
        VALUES (?, ?, ?, 'INV', 'QT', 18, 30, '#4f46e5')
      `).run(u.id, bizName, bizName);
      b = { id: bInfo.lastInsertRowid };
    }
    if (!u.active_business_id) {
      db.prepare("UPDATE users SET active_business_id = ? WHERE id = ?").run(b.id, u.id);
    }
  };
  ensureBiz('demo@billpro.in', 'Coastal Traders');
  ensureBiz('admin@billpro.in', 'BillPro Enterprise');
  ensureBiz('demo.user@billpro.in', 'Bharat Retail Mart');

  // Seed rich demo data for Bharat Retail Mart (demo.user@billpro.in) if empty
  try {
    const demoU = db.prepare("SELECT id, active_business_id FROM users WHERE lower(email) = 'demo.user@billpro.in'").get();
    if (demoU && demoU.active_business_id) {
      const prodCount = db.prepare("SELECT COUNT(*) AS c FROM products WHERE business_id = ?").get(demoU.active_business_id).c;
      if (prodCount === 0) {
        const { seedBharatRetail } = require('./lib/seed-bharat');
        seedBharatRetail(db, demoU.active_business_id, demoU.id);
      }
    }
  } catch (err) {
    console.warn('[Seed Bharat Retail Warning]:', err.message);
  }

  // Seed & synchronize persistent system settings
  const { initSystemSettings } = require('./lib/settings');
  initSystemSettings(db);

  // Synchronize persistent client accounts (including Mohammad Sayyad Zoheb)
  const { syncPersistentClients } = require('./lib/persistent-clients');
  syncPersistentClients(db);
} catch (e) {
  console.warn('[DB Migration Warning]:', e.message);
}

module.exports = { db, DB_PATH, DATA_DIR };
