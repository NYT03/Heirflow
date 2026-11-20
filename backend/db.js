require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'heirflow.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone TEXT,
    kyc_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    details TEXT DEFAULT '{}',
    instructions TEXT,
    nominee_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS nominees (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    relationship TEXT,
    key_share TEXT,
    permissions TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    claimant_id TEXT NOT NULL,
    deceased_user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    evidence_path TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    grace_until DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claimant_id) REFERENCES users(id),
    FOREIGN KEY (deceased_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS claim_actions (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result_notes TEXT,
    executed_at DATETIME,
    FOREIGN KEY (claim_id) REFERENCES claims(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    details TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES claims(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
`);

// Seed demo data if users table is empty
function seedDemoData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  const { v4: uuidv4 } = require('uuid');

  const johnId = uuidv4();
  const janeId = uuidv4();

  const johnHash = bcrypt.hashSync('demo123', 10);
  const janeHash = bcrypt.hashSync('demo123', 10);

  db.prepare(`INSERT INTO users (id, name, email, password_hash, phone, kyc_status) VALUES (?, ?, ?, ?, ?, ?)`).run(
    johnId, 'John Doe', 'john@demo.com', johnHash, '+1-555-0101', 'verified'
  );
  db.prepare(`INSERT INTO users (id, name, email, password_hash, phone, kyc_status) VALUES (?, ?, ?, ?, ?, ?)`).run(
    janeId, 'Jane Smith', 'jane@demo.com', janeHash, '+1-555-0202', 'pending'
  );

  // Add sample assets for John
  const assetId1 = uuidv4();
  const assetId2 = uuidv4();
  db.prepare(`INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    assetId1, johnId, 'bank', 'Chase Checking Account',
    JSON.stringify({ bank: 'Chase Bank', account_number: '****1234', routing: '021000021' }),
    'Transfer to nominee upon verified claim. Contact Chase estate services at 1-800-935-9935.',
    janeId
  );
  db.prepare(`INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    assetId2, johnId, 'crypto', 'Bitcoin Wallet',
    JSON.stringify({ wallet_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf', exchange: 'Coinbase' }),
    'Recovery phrase stored in LastPass vault. Nominee should contact Coinbase support with death certificate.',
    janeId
  );

  // Add Jane as a nominee for John
  const nomineeId = uuidv4();
  db.prepare(`INSERT INTO nominees (id, user_id, name, email, phone, relationship, key_share, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nomineeId, johnId, 'Jane Smith', 'jane@demo.com', '+1-555-0202', 'spouse',
    `HEIRFLOW-SHARE-${uuidv4().split('-').join('').substring(0, 24).toUpperCase()}`,
    JSON.stringify({ can_view_assets: true, can_initiate_claims: true, can_access_files: true })
  );

  // Audit log
  db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
    uuidv4(), johnId, 'SEED_DATA_CREATED', JSON.stringify({ message: 'Demo data seeded' })
  );

  console.log('✅ Demo data seeded: john@demo.com and jane@demo.com (password: demo123)');
}

seedDemoData();

module.exports = db;

