/**
 * Migrates local heirflow-data.json to Google Cloud, separated by data behavior:
 *  1. Transactional / Operational Data -> Google Cloud Firestore (6 collections)
 *  2. Behavior-Separated Cold Backups & Audit JSONL -> Google Cloud Storage (GCS)
 *
 * Usage:
 *   cd backend
 *   npm run migrate:gcp
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getFirestoreClient, pushAllToFirestore } = require('../services/cloudDatabase');
const { uploadFile, isGcsConfigured } = require('../services/cloudStorage');

const DATA_FILE = path.join(__dirname, '../heirflow-data.json');

async function migrate() {
  console.log('==========================================');
  console.log(' ☁️  HeirFlow — Cloud Data Migration');
  console.log('==========================================');

  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ No heirflow-data.json found at:', DATA_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log('Loaded local heirflow-data.json:');
  console.log(`  - Identity (users):              ${(data.users || []).length}`);
  console.log(`  - Estate Vault (assets):         ${(data.assets || []).length}`);
  console.log(`  - Quorum & Access (nominees):    ${(data.nominees || []).length}`);
  console.log(`  - Verification (gate_claims):    ${(data.gate_claims || []).length}`);
  console.log(`  - Handover (gate_claim_actions): ${(data.gate_claim_actions || []).length}`);
  console.log(`  - Compliance (audit_logs):       ${(data.audit_logs || []).length}`);

  // 1. Push Operational & Audit Data to Firestore Collections
  const firestore = getFirestoreClient();
  if (firestore) {
    console.log('\n[1/2] Pushing behavioral collections to Google Cloud Firestore...');
    await pushAllToFirestore(firestore, data);
    console.log('✅ Firestore migration complete.');
  } else {
    console.warn('\n⚠️ Skipping Firestore: No GCP credentials found.');
    console.warn('   Fix: Set GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json in backend/.env (or run gcloud auth application-default login).');
  }

  // 2. Push Behavior-Separated Backups & Immutable Audit JSONL to GCS
  if (isGcsConfigured()) {
    console.log('\n[2/2] Archiving domain-separated snapshots to Google Cloud Storage...');
    const dateTag = new Date().toISOString().split('T')[0];

    const domainFiles = [
      { folder: `backups/${dateTag}/identity`, name: 'users.json', content: JSON.stringify(data.users || [], null, 2) },
      { folder: `backups/${dateTag}/vault`, name: 'assets.json', content: JSON.stringify(data.assets || [], null, 2) },
      { folder: `backups/${dateTag}/quorum`, name: 'nominees.json', content: JSON.stringify(data.nominees || [], null, 2) },
      { folder: `backups/${dateTag}/verification`, name: 'gate_claims.json', content: JSON.stringify(data.gate_claims || [], null, 2) },
      { folder: `backups/${dateTag}/verification`, name: 'gate_claim_actions.json', content: JSON.stringify(data.gate_claim_actions || [], null, 2) },
      {
        folder: `backups/${dateTag}/audit`,
        name: 'audit_logs.jsonl',
        content: (data.audit_logs || []).map((l) => JSON.stringify(l)).join('\n'),
      },
    ];

    for (const file of domainFiles) {
      const res = await uploadFile(Buffer.from(file.content, 'utf8'), file.name, 'application/json', file.folder);
      console.log(`  ✅ Uploaded [${res.storage}]: ${res.filename}`);
    }
  } else {
    console.warn('\n⚠️ Skipping GCS archive: GCS_BUCKET_NAME not configured.');
  }

  console.log('\n🎉 Migration finished!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
