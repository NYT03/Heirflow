const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

// POST /api/claims — nominee initiates a claim
router.post('/', auth, (req, res) => {
  try {
    const { deceased_email, key_share, evidence_path } = req.body;
    if (!deceased_email) {
      return res.status(400).json({ success: false, error: 'deceased_email is required' });
    }

    const deceased = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(deceased_email);
    if (!deceased) {
      return res.status(404).json({ success: false, error: 'No user found with that email' });
    }

    if (deceased.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot file a claim against yourself' });
    }

    // Check for existing active claim
    const existing = db.prepare(`
      SELECT id FROM claims WHERE claimant_id = ? AND deceased_user_id = ? AND status NOT IN ('rejected', 'completed')
    `).get(req.user.id, deceased.id);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An active claim already exists for this user' });
    }

    const id = uuidv4();
    db.prepare(`INSERT INTO claims (id, claimant_id, deceased_user_id, status, evidence_path, submitted_at, updated_at) VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
      id, req.user.id, deceased.id, evidence_path || null
    );

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'CLAIM_INITIATED', JSON.stringify({ claim_id: id, deceased_email })
    );

    const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(id);
    return res.status(201).json({ success: true, data: { ...claim, deceased_name: deceased.name } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/claims — claims where user is claimant or deceased
router.get('/', auth, (req, res) => {
  try {
    const claims = db.prepare(`
      SELECT c.*,
        claimant.name as claimant_name, claimant.email as claimant_email,
        deceased.name as deceased_name, deceased.email as deceased_email
      FROM claims c
      JOIN users claimant ON c.claimant_id = claimant.id
      JOIN users deceased ON c.deceased_user_id = deceased.id
      WHERE c.claimant_id = ? OR c.deceased_user_id = ?
      ORDER BY c.submitted_at DESC
    `).all(req.user.id, req.user.id);

    return res.json({ success: true, data: claims });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/claims/:id/review — move to under_review
router.put('/:id/review', auth, (req, res) => {
  try {
    const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    db.prepare(`UPDATE claims SET status = 'under_review', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'CLAIM_UNDER_REVIEW', JSON.stringify({ claim_id: req.params.id })
    );

    const updated = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/claims/:id/approve — set grace_period for 7 days
router.put('/:id/approve', auth, (req, res) => {
  try {
    const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    const graceUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE claims SET status = 'grace_period', grace_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(graceUntil, req.params.id);

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'CLAIM_GRACE_PERIOD', JSON.stringify({ claim_id: req.params.id, grace_until: graceUntil })
    );

    const updated = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/claims/:id/execute — complete claim, create claim_actions for all assets
router.put('/:id/execute', auth, (req, res) => {
  try {
    const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    const assets = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(claim.deceased_user_id);

    const insertAction = db.prepare(`INSERT INTO claim_actions (id, claim_id, asset_id, action_type, status, result_notes, executed_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);

    const executeAll = db.transaction(() => {
      for (const asset of assets) {
        const actionType = asset.instructions
          ? (asset.instructions.toLowerCase().includes('transfer') ? 'transfer'
            : asset.instructions.toLowerCase().includes('cancel') ? 'cancel' : 'recover')
          : 'transfer';
        insertAction.run(
          uuidv4(), claim.id, asset.id, actionType, 'completed',
          `Asset "${asset.name}" processed via ${actionType} action. Instructions: ${asset.instructions || 'No specific instructions.'}`
        );
      }
      db.prepare(`UPDATE claims SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    });

    executeAll();

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'CLAIM_EXECUTED', JSON.stringify({ claim_id: req.params.id, assets_processed: assets.length })
    );

    const updated = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    const actions = db.prepare('SELECT * FROM claim_actions WHERE claim_id = ?').all(req.params.id);
    return res.json({ success: true, data: { claim: updated, actions } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/claims/:id/actions — list actions for a claim
router.get('/:id/actions', auth, (req, res) => {
  try {
    const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });

    const actions = db.prepare(`
      SELECT ca.*, a.name as asset_name, a.type as asset_type
      FROM claim_actions ca
      JOIN assets a ON ca.asset_id = a.id
      WHERE ca.claim_id = ?
      ORDER BY ca.executed_at DESC
    `).all(req.params.id);

    return res.json({ success: true, data: actions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

