require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  initAndHydrate,
  syncUpsert,
  syncDelete,
  isCloudConnected,
} = require('./services/cloudDatabase');

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

        // User by email
        if (lower.includes('from users where email = ?')) {
          const email = params[0];
          const user = tables.users.find(u => u.email === email);
          return user ? { ...user } : undefined;
        }

        // User by id
        if (lower.includes('from users where id = ?')) {
          const id = params[0];
          const user = tables.users.find(u => u.id === id);
          return user ? { ...user } : undefined;
        }

        // Asset by id and user_id
        if (lower.includes('from assets where id = ? and user_id = ?')) {
          const [id, user_id] = params;
          const asset = tables.assets.find(a => a.id === id && a.user_id === user_id);
          return asset ? { ...asset } : undefined;
        }

        // Asset by id
        if (lower.includes('from assets where id = ?')) {
          const [id] = params;
          const asset = tables.assets.find(a => a.id === id);
          return asset ? { ...asset } : undefined;
        }

        // Nominee by id and user_id
        if (lower.includes('from nominees where id = ? and user_id = ?')) {
          const [id, user_id] = params;
          const nominee = tables.nominees.find(n => n.id === id && n.user_id === user_id);
          return nominee ? { ...nominee } : undefined;
        }

        // Nominee by id
        if (lower.includes('from nominees where id = ?')) {
          const [id] = params;
          const nominee = tables.nominees.find(n => n.id === id);
          return nominee ? { ...nominee } : undefined;
        }

        // Active claim check
        if (lower.includes('from claims where claimant_id = ? and deceased_user_id = ?')) {
          const [claimant_id, deceased_id] = params;
          const claim = tables.claims.find(c =>
            c.claimant_id === claimant_id &&
            c.deceased_user_id === deceased_id &&
            c.status !== 'rejected' &&
            c.status !== 'completed'
          );
          return claim ? { ...claim } : undefined;
        }

        // Claim by id
        if (lower.includes('from claims where id = ?')) {
          const [id] = params;
          const claim = tables.claims.find(c => c.id === id);
          return claim ? { ...claim } : undefined;
        }

        // Active claims count (verification gate)
        if (lower.includes('count(*) as count from gate_claims')) {
          const [id1, id2] = params;
          const active = tables.gate_claims.filter(c =>
            (c.claimant_id === id1 || c.deceased_user_id === id2) &&
            c.status !== 'EXECUTED' &&
            c.status !== 'REJECTED' &&
            c.status !== 'ABORTED_LIVENESS'
          );
          return { count: active.length };
        }

        // Active claims count (legacy)
        if (lower.includes('count(*) as count from claims')) {
          const [id1, id2] = params;
          const active = tables.claims.filter(c =>
            (c.claimant_id === id1 || c.deceased_user_id === id2) &&
            c.status !== 'completed' &&
            c.status !== 'rejected'
          );
          return { count: active.length };
        }

        return undefined;
      },

      all: (...params) => {
        // Assets with JOIN nominees
        if (lower.includes('from assets a') && lower.includes('join nominees n')) {
          const [userId] = params;
          const userAssets = tables.assets.filter(a => a.user_id === userId);
          return userAssets.map(a => {
            const nominee = a.nominee_id ? tables.nominees.find(n => n.id === a.nominee_id) : null;
            return {
              ...a,
              nominee_name: nominee ? nominee.name : null,
              nominee_email: nominee ? nominee.email : null
            };
          }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        // Plain assets by user_id
        if (lower.includes('from assets where user_id = ?')) {
          const [userId] = params;
          return tables.assets.filter(a => a.user_id === userId);
        }

        // Nominees by user_id
        if (lower.includes('from nominees where user_id = ?')) {
          const [userId] = params;
          return tables.nominees.filter(n => n.user_id === userId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        // Claims with JOIN users claimant & deceased
        if (lower.includes('from claims c') && lower.includes('join users claimant')) {
          const [id1, id2] = params;
          const userClaims = tables.claims.filter(c => c.claimant_id === id1 || c.deceased_user_id === id2);
          return userClaims.map(c => {
            const claimant = tables.users.find(u => u.id === c.claimant_id);
            const deceased = tables.users.find(u => u.id === c.deceased_user_id);
            return {
              ...c,
              claimant_name: claimant ? claimant.name : 'Unknown',
              claimant_email: claimant ? claimant.email : 'Unknown',
              deceased_name: deceased ? deceased.name : 'Unknown',
              deceased_email: deceased ? deceased.email : 'Unknown'
            };
          }).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
        }

        // Claim actions with JOIN assets
        if (lower.includes('from claim_actions ca') && lower.includes('join assets a')) {
          const [claimId] = params;
          const actions = tables.claim_actions.filter(ca => ca.claim_id === claimId);
          return actions.map(ca => {
            const asset = tables.assets.find(a => a.id === ca.asset_id);
            return {
              ...ca,
              asset_name: asset ? asset.name : 'Unknown Asset',
              asset_type: asset ? asset.type : 'Unknown'
            };
          }).sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
        }

        // Plain claim actions by claim_id
        if (lower.includes('from claim_actions where claim_id = ?')) {
          const [claimId] = params;
          return tables.claim_actions.filter(ca => ca.claim_id === claimId);
        }

        // Audit logs
        if (lower.includes('from audit_logs where user_id = ?')) {
          const [userId] = params;
          return tables.audit_logs.filter(l => l.user_id === userId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);
        }

        return [];
      }
    };
  },

  // Direct persistence helpers for the Verification Gate module
  gate: {
    saveClaim: (record) => {
      const idx = tables.gate_claims.findIndex(c => c.claim_id === record.claim_id);
      if (idx >= 0) {
        tables.gate_claims[idx] = { ...tables.gate_claims[idx], ...record };
      } else {
        tables.gate_claims.push(record);
      }
      saveData();
      syncUpsert(COLLECTIONS.GATE_CLAIMS, record.claim_id, tables.gate_claims.find(c => c.claim_id === record.claim_id));
    },
    getClaim: (claimId) => {
      return tables.gate_claims.find(c => c.claim_id === claimId);
    },
    listClaims: () => {
      return tables.gate_claims
        .map(c => {
          const deceased = tables.users.find(u => u.id === c.deceased_user_id);
          return {
            ...c,
            deceased_name: deceased ? deceased.name : 'Unknown',
            deceased_email: deceased ? deceased.email : 'Unknown'
          };
        })
        .sort((a, b) => new Date(b.initiated_at) - new Date(a.initiated_at));
    },
    clearClaims: () => {
      tables.gate_claim_actions = [];
      tables.gate_claims = [];
      saveData();
    },
    insertAction: (action) => {
      const entry = {
        ...action,
        executed_at: action.executed_at || new Date().toISOString()
      };
      tables.gate_claim_actions.push(entry);
      saveData();
      syncUpsert(COLLECTIONS.GATE_CLAIM_ACTIONS, entry.id, entry);
    },
    listActions: (claimId) => {
      return tables.gate_claim_actions
        .filter(a => a.claim_id === claimId)
        .map(a => {
          const asset = tables.assets.find(as => as.id === a.asset_id);
          return {
            ...a,
            asset_name: asset ? asset.name : 'Unknown Asset',
            asset_type: asset ? asset.type : 'Unknown'
          };
        })
        .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
    },
    findActiveClaim: (claimantId, deceasedUserId) => {
      return tables.gate_claims.find(
        c =>
          c.claimant_id === claimantId &&
          c.deceased_user_id === deceasedUserId &&
          !['REJECTED', 'EXECUTED', 'ABORTED_LIVENESS'].includes(c.status)
      );
    }
  },

  initCloud: () => initAndHydrate(tables),
  isCloudConnected
};

// Seed demo data if users empty
function seedDemoData() {
  if (tables.users.length > 0) return;

  const johnId = uuidv4();
  const janeId = uuidv4();

  const johnHash = bcrypt.hashSync('demo123', 10);
  const janeHash = bcrypt.hashSync('demo123', 10);

  tables.users.push({
    id: johnId,
    name: 'John Doe',
    email: 'john@demo.com',
    password_hash: johnHash,
    phone: '+1-555-0101',
    kyc_status: 'verified',
    created_at: new Date().toISOString()
  });

  tables.users.push({
    id: janeId,
    name: 'Jane Smith',
    email: 'jane@demo.com',
    password_hash: janeHash,
    phone: '+1-555-0202',
    kyc_status: 'pending',
    created_at: new Date().toISOString()
  });

  const assetId1 = uuidv4();
  const assetId2 = uuidv4();
  tables.assets.push({
    id: assetId1,
    user_id: johnId,
    type: 'bank',
    name: 'Chase Checking Account',
    details: JSON.stringify({ bank: 'Chase Bank', account_number: '****1234', routing: '021000021' }),
    instructions: 'Transfer to nominee upon verified claim. Contact Chase estate services at 1-800-935-9935.',
    nominee_id: janeId,
    created_at: new Date().toISOString()
  });

  tables.assets.push({
    id: assetId2,
    user_id: johnId,
    type: 'crypto',
    name: 'Bitcoin Wallet',
    details: JSON.stringify({ wallet_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf', exchange: 'Coinbase' }),
    instructions: 'Recovery phrase stored in LastPass vault. Nominee should contact Coinbase support with death certificate.',
    nominee_id: janeId,
    created_at: new Date().toISOString()
  });

  const nomineeId = uuidv4();
  tables.nominees.push({
    id: nomineeId,
    user_id: johnId,
    name: 'Jane Smith',
    email: 'jane@demo.com',
    phone: '+1-555-0202',
    relationship: 'spouse',
    key_share: `HEIRFLOW-SHARE-${uuidv4().split('-').join('').substring(0, 24).toUpperCase()}`,
    permissions: JSON.stringify({ can_view_assets: true, can_initiate_claims: true, can_access_files: true }),
    created_at: new Date().toISOString()
  });

  tables.audit_logs.push({
    id: uuidv4(),
    user_id: johnId,
    action: 'SEED_DATA_CREATED',
    details: JSON.stringify({ message: 'Demo data seeded' }),
    created_at: new Date().toISOString()
  });

  saveData();
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
