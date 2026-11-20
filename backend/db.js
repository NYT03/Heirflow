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

  CREATE TABLE IF NOT EXISTS gate_claims (
    claim_id TEXT PRIMARY KEY,
    deceased_user_id TEXT NOT NULL,
    claimant_id TEXT,
    status TEXT NOT NULL,
    evidence_path TEXT,
    state_json TEXT NOT NULL,
    grace_ends_at DATETIME,
    initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deceased_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS gate_claim_actions (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    encrypted_payload TEXT,
    contract_address TEXT,
    tx_hash TEXT,
    result_notes TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES gate_claims(claim_id),
    FOREIGN KEY (asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS blockchain_ledger (
    block_index INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    actor TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    data_hash TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    block_hash TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS email_outbox (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT,
    preview TEXT,
    delivery_status TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations for existing heirflow.db
try { db.exec(`ALTER TABLE nominees ADD COLUMN key_status TEXT DEFAULT 'ACTIVE'`); } catch {}
try { db.exec(`ALTER TABLE nominees ADD COLUMN key_destroyed_at DATETIME`); } catch {}

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

// Helper namespaces backed by SQLite for Verification Gate, Blockchain Ledger, and Email Outbox
db.gate = {
  saveClaim: (record) => {
    db.prepare(`
      INSERT INTO gate_claims (claim_id, deceased_user_id, claimant_id, status, evidence_path, state_json, grace_ends_at, initiated_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(claim_id) DO UPDATE SET
        status = excluded.status,
        evidence_path = COALESCE(excluded.evidence_path, gate_claims.evidence_path),
        state_json = excluded.state_json,
        grace_ends_at = excluded.grace_ends_at,
        updated_at = excluded.updated_at
    `).run(
      record.claim_id,
      record.deceased_user_id,
      record.claimant_id || null,
      record.status,
      record.evidence_path || null,
      record.state_json,
      record.grace_ends_at || null,
      record.initiated_at,
      record.updated_at
    );
  },
  getClaim: (claimId) => db.prepare('SELECT * FROM gate_claims WHERE claim_id = ?').get(claimId),
  listClaims: () => db.prepare(`
    SELECT gc.*, u.name as deceased_name, u.email as deceased_email
    FROM gate_claims gc
    JOIN users u ON gc.deceased_user_id = u.id
    ORDER BY gc.initiated_at DESC
  `).all(),
  clearClaims: () => {
    db.prepare('DELETE FROM gate_claim_actions').run();
    db.prepare('DELETE FROM gate_claims').run();
  },
  insertAction: (action) => {
    db.prepare(`
      INSERT INTO gate_claim_actions (id, claim_id, asset_id, action_type, status, encrypted_payload, contract_address, tx_hash, result_notes, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      action.id,
      action.claim_id,
      action.asset_id,
      action.action_type,
      action.status || 'completed',
      action.encrypted_payload || null,
      action.contract_address || null,
      action.tx_hash || null,
      action.result_notes || null,
      action.executed_at || new Date().toISOString()
    );
  },
  listActions: (claimId) => db.prepare(`
    SELECT gca.*, a.name as asset_name, a.type as asset_type
    FROM gate_claim_actions gca
    JOIN assets a ON gca.asset_id = a.id
    WHERE gca.claim_id = ?
    ORDER BY gca.executed_at DESC
  `).all(claimId),
  findActiveClaimByDeceased: (deceasedUserId) => db.prepare(`
    SELECT * FROM gate_claims
    WHERE deceased_user_id = ? AND status NOT IN ('REJECTED', 'EXECUTED', 'ABORTED_LIVENESS')
    LIMIT 1
  `).get(deceasedUserId),
  destroyNomineeKeys: (deceasedUserId) => {
    const destroyedAt = new Date().toISOString();
    const res = db.prepare(`
      UPDATE nominees
      SET key_share = NULL, key_status = 'DESTROYED', key_destroyed_at = ?
      WHERE user_id = ?
    `).run(destroyedAt, deceasedUserId);
    return { destroyedCount: res.changes, destroyedAt };
  }
};

db.emailOutbox = {
  save: (entry) => {
    db.prepare(`
      INSERT INTO email_outbox (id, recipient, subject, category, preview, delivery_status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.to, entry.subject, entry.category || 'GENERAL', entry.preview || '', entry.delivery_status || 'logged_local', entry.sent_at);
  },
  list: () => db.prepare('SELECT * FROM email_outbox ORDER BY sent_at DESC LIMIT 50').all()
};

db.blockchain = {
  getBlocks: () => db.prepare('SELECT * FROM blockchain_ledger ORDER BY block_index ASC').all().map(r => ({
    index: r.block_index,
    timestamp: r.timestamp,
    claimId: r.claim_id,
    stage: r.stage,
    actor: r.actor,
    contractAddress: r.contract_address,
    dataHash: r.data_hash,
    previousHash: r.previous_hash,
    blockHash: r.block_hash,
    txHash: r.tx_hash,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {}
  })),
  getBlocksForClaim: (claimId) => db.prepare('SELECT * FROM blockchain_ledger WHERE claim_id = ? ORDER BY block_index ASC').all(claimId).map(r => ({
    index: r.block_index,
    timestamp: r.timestamp,
    claimId: r.claim_id,
    stage: r.stage,
    actor: r.actor,
    contractAddress: r.contract_address,
    dataHash: r.data_hash,
    previousHash: r.previous_hash,
    blockHash: r.block_hash,
    txHash: r.tx_hash,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {}
  })),
  appendBlock: (block) => {
    db.prepare(`
      INSERT INTO blockchain_ledger (block_index, timestamp, claim_id, stage, actor, contract_address, data_hash, previous_hash, block_hash, tx_hash, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      block.index,
      block.timestamp,
      block.claimId,
      block.stage,
      block.actor,
      block.contractAddress,
      block.dataHash,
      block.previousHash,
      block.blockHash,
      block.txHash,
      JSON.stringify(block.metadata || {})
    );
  }
};

module.exports = db;

