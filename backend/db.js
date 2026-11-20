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

const DATA_FILE = path.join(__dirname, 'heirflow-data.json');

// In-memory data store with JSON file persistence
let tables = {
  users: [],
  assets: [],
  nominees: [],
  claims: [],
  claim_actions: [],
  gate_claims: [],
  gate_claim_actions: [],
  audit_logs: [],
  messages: [],
  blockchain_ledger: [],
  email_outbox: []
};

// Load saved data if file exists
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      const loaded = JSON.parse(content);
      tables = { ...tables, ...loaded };
    } catch (e) {
      console.warn('⚠️ Could not parse heirflow-data.json, starting fresh');
    }
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tables, null, 2), 'utf8');
  } catch (e) {
    console.warn('⚠️ Could not persist to heirflow-data.json:', e.message);
  }
}

loadData();

// Universal pure-JS SQLite interface emulator
const db = {
  pragma: () => {},
  exec: () => {},
  
  transaction: (fn) => {
    return (...args) => {
      const result = fn(...args);
      saveData();
      return result;
    };
  },

  prepare: (sql) => {
    const rawSql = sql.replace(/\s+/g, ' ').trim();
    const lower = rawSql.toLowerCase();

    return {
      run: (...params) => {
        // --- USERS INSERT ---
        if (lower.startsWith('insert into users')) {
          const [id, name, email, password_hash, phone, kyc_status] = params;
          const user = {
            id,
            name,
            email,
            password_hash,
            phone: phone || null,
            kyc_status: kyc_status || 'pending',
            created_at: new Date().toISOString()
          };
          tables.users.push(user);
          saveData();
          syncUpsert(COLLECTIONS.USERS, user.id, user);
          return { changes: 1, lastInsertRowid: id };
        }

        // --- ASSETS INSERT ---
        if (lower.startsWith('insert into assets')) {
          const [id, user_id, type, name, details, instructions, nominee_id] = params;
          const asset = {
            id,
            user_id,
            type,
            name,
            details: typeof details === 'string' ? details : JSON.stringify(details || {}),
            instructions: instructions || null,
            nominee_id: nominee_id || null,
            created_at: new Date().toISOString()
          };
          tables.assets.push(asset);
          saveData();
          syncUpsert(COLLECTIONS.ASSETS, asset.id, asset);
          return { changes: 1, lastInsertRowid: id };
        }

        // --- NOMINEES INSERT ---
        if (lower.startsWith('insert into nominees')) {
          const [id, user_id, name, email, phone, relationship, key_share, permissions] = params;
          const nominee = {
            id,
            user_id,
            name,
            email,
            phone: phone || null,
            relationship: relationship || null,
            key_share,
            permissions: typeof permissions === 'string' ? permissions : JSON.stringify(permissions || {}),
            created_at: new Date().toISOString()
          };
          tables.nominees.push(nominee);
          saveData();
          syncUpsert(COLLECTIONS.NOMINEES, nominee.id, nominee);
          return { changes: 1, lastInsertRowid: id };
        }

        // --- CLAIMS INSERT ---
        if (lower.startsWith('insert into claims')) {
          const [id, claimant_id, deceased_user_id] = params;
          const claim = {
            id,
            claimant_id,
            deceased_user_id,
            status: 'pending',
            evidence_path: null,
            submitted_at: new Date().toISOString(),
            grace_until: null,
            updated_at: new Date().toISOString()
          };
          tables.claims.push(claim);
          saveData();
          return { changes: 1, lastInsertRowid: id };
        }

        // --- CLAIM ACTIONS INSERT ---
        if (lower.startsWith('insert into claim_actions')) {
          const [id, claim_id, asset_id, action_type, status, result_notes] = params;
          const action = {
            id,
            claim_id,
            asset_id,
            action_type,
            status: status || 'pending',
            result_notes,
            executed_at: new Date().toISOString()
          };
          tables.claim_actions.push(action);
          saveData();
          return { changes: 1, lastInsertRowid: id };
        }

        // --- AUDIT LOGS INSERT ---
        if (lower.startsWith('insert into audit_logs')) {
          const [id, user_id, action, details] = params;
          const logEntry = {
            id: id || uuidv4(),
            user_id,
            action,
            details: typeof details === 'string' ? details : JSON.stringify(details || {}),
            created_at: new Date().toISOString()
          };
          tables.audit_logs.push(logEntry);
          saveData();
          syncUpsert(COLLECTIONS.AUDIT_LOGS, logEntry.id, logEntry);
          return { changes: 1 };
        }

        // --- UPDATE ASSETS ---
        if (lower.startsWith('update assets set')) {
          const [type, name, details, instructions, nominee_id, id, user_id] = params;
          const asset = tables.assets.find(a => a.id === id && a.user_id === user_id);
          if (asset) {
            if (type !== undefined && type !== null) asset.type = type;
            if (name !== undefined && name !== null) asset.name = name;
            if (details !== undefined && details !== null) asset.details = details;
            if (instructions !== undefined) asset.instructions = instructions;
            if (nominee_id !== undefined) asset.nominee_id = nominee_id;
            saveData();
            syncUpsert(COLLECTIONS.ASSETS, asset.id, asset);
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // --- DELETE ASSETS ---
        if (lower.startsWith('delete from assets')) {
          const [id, user_id] = params;
          const initialLen = tables.assets.length;
          tables.assets = tables.assets.filter(a => !(a.id === id && a.user_id === user_id));
          saveData();
          if (tables.assets.length < initialLen) {
            syncDelete(COLLECTIONS.ASSETS, id);
          }
          return { changes: initialLen - tables.assets.length };
        }

        // --- UPDATE NOMINEES ---
        if (lower.startsWith('update nominees set')) {
          const [name, email, phone, relationship, permissions, id, user_id] = params;
          const nominee = tables.nominees.find(n => n.id === id && n.user_id === user_id);
          if (nominee) {
            if (name !== undefined && name !== null) nominee.name = name;
            if (email !== undefined && email !== null) nominee.email = email;
            if (phone !== undefined) nominee.phone = phone;
            if (relationship !== undefined) nominee.relationship = relationship;
            if (permissions !== undefined && permissions !== null) nominee.permissions = permissions;
            saveData();
            syncUpsert(COLLECTIONS.NOMINEES, nominee.id, nominee);
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // --- DELETE NOMINEES ---
        if (lower.startsWith('delete from nominees')) {
          const [id, user_id] = params;
          const initialLen = tables.nominees.length;
          tables.nominees = tables.nominees.filter(n => !(n.id === id && n.user_id === user_id));
          saveData();
          if (tables.nominees.length < initialLen) {
            syncDelete(COLLECTIONS.NOMINEES, id);
          }
          return { changes: initialLen - tables.nominees.length };
        }

        // --- UPDATE CLAIMS REVIEW ---
        if (lower.includes("update claims set status = 'under_review'")) {
          const [id] = params;
          const claim = tables.claims.find(c => c.id === id);
          if (claim) {
            claim.status = 'under_review';
            claim.updated_at = new Date().toISOString();
            saveData();
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // --- UPDATE CLAIMS APPROVE (GRACE PERIOD) ---
        if (lower.includes("update claims set status = 'grace_period'")) {
          const [graceUntil, id] = params;
          const claim = tables.claims.find(c => c.id === id);
          if (claim) {
            claim.status = 'grace_period';
            claim.grace_until = graceUntil;
            claim.updated_at = new Date().toISOString();
            saveData();
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // --- UPDATE CLAIMS COMPLETE ---
        if (lower.includes("update claims set status = 'completed'")) {
          const [id] = params;
          const claim = tables.claims.find(c => c.id === id);
          if (claim) {
            claim.status = 'completed';
            claim.updated_at = new Date().toISOString();
            saveData();
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        return { changes: 0 };
      },

      get: (...params) => {
        // COUNT users
        if (lower.includes('count(*) as count from users')) {
          return { count: tables.users.length };
        }

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
    },
    findActiveClaimByDeceased: (deceasedUserId) => {
      return tables.gate_claims.find(
        c =>
          c.deceased_user_id === deceasedUserId &&
          !['REJECTED', 'EXECUTED', 'ABORTED_LIVENESS'].includes(c.status)
      );
    },
    destroyNomineeKeys: (deceasedUserId) => {
      const destroyedAt = new Date().toISOString();
      let destroyedCount = 0;
      for (const n of tables.nominees) {
        if (n.user_id === deceasedUserId) {
          n.key_share = null;
          n.key_status = 'DESTROYED';
          n.key_destroyed_at = destroyedAt;
          destroyedCount++;
          syncUpsert(COLLECTIONS.NOMINEES, n.id, n);
        }
      }
      saveData();
      return { destroyedCount, destroyedAt };
    }
  },

  emailOutbox: {
    save: (entry) => {
      const record = {
        id: entry.id,
        recipient: entry.to,
        subject: entry.subject,
        category: entry.category || 'GENERAL',
        preview: entry.preview || '',
        delivery_status: entry.delivery_status || 'logged_local',
        sent_at: entry.sent_at || new Date().toISOString()
      };
      tables.email_outbox.push(record);
      saveData();
    },
    list: () => [...tables.email_outbox].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 50)
  },

  blockchain: {
    getBlocks: () => [...tables.blockchain_ledger].sort((a, b) => a.index - b.index),
    getBlocksForClaim: (claimId) =>
      tables.blockchain_ledger.filter(b => b.claimId === claimId).sort((a, b) => a.index - b.index),
    appendBlock: (block) => {
      tables.blockchain_ledger.push({
        index: block.index,
        timestamp: block.timestamp,
        claimId: block.claimId,
        stage: block.stage,
        actor: block.actor,
        contractAddress: block.contractAddress,
        dataHash: block.dataHash,
        previousHash: block.previousHash,
        blockHash: block.blockHash,
        txHash: block.txHash,
        metadata: block.metadata || {}
      });
      saveData();
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

module.exports = db;
