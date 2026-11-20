const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const {
  ClaimVerificationOrchestrator,
  createVerificationRouter,
  MockRegistryVerifier,
  OfficialPortalVerifier,
} = require('../verification-gate/dist/index.js');

/**
 * Rehydrates Date objects from JSON stored in heirflow-data.json
 */
function deserializeClaimState(jsonStr) {
  const obj = JSON.parse(jsonStr);
  if (obj.initiatedAt) obj.initiatedAt = new Date(obj.initiatedAt);
  if (obj.updatedAt) obj.updatedAt = new Date(obj.updatedAt);
  if (obj.graceEndsAt) obj.graceEndsAt = new Date(obj.graceEndsAt);
  if (obj.executedAt) obj.executedAt = new Date(obj.executedAt);
  if (Array.isArray(obj.submittedShares)) {
    obj.submittedShares = obj.submittedShares.map((s) => ({
      ...s,
      submittedAt: s.submittedAt ? new Date(s.submittedAt) : new Date(),
    }));
  }
  if (obj.registryResult && obj.registryResult.verifiedAt) {
    obj.registryResult.verifiedAt = new Date(obj.registryResult.verifiedAt);
  }
  return obj;
}

/**
 * Persistent ClaimStore backed by db.gate (heirflow-data.json)
 */
class PersistentClaimStore {
  save(claim) {
    db.gate.saveClaim({
      claim_id: claim.claimId,
      deceased_user_id: claim.deceasedUserId,
      claimant_id: claim.claimantId || null,
      status: claim.status,
      evidence_path: claim.evidencePath || null,
      state_json: JSON.stringify(claim),
      grace_ends_at: claim.graceEndsAt ? claim.graceEndsAt.toISOString() : null,
      initiated_at: claim.initiatedAt ? claim.initiatedAt.toISOString() : new Date().toISOString(),
      updated_at: claim.updatedAt ? claim.updatedAt.toISOString() : new Date().toISOString(),
    });
  }

  get(claimId) {
    const row = db.gate.getClaim(claimId);
    return row ? deserializeClaimState(row.state_json) : undefined;
  }

  listForUser(userId) {
    return db.gate
      .listClaims()
      .map((r) => deserializeClaimState(r.state_json))
      .filter(
        (c) =>
          c.deceasedUserId === userId ||
          c.claimantId === userId ||
          (c.quorumConfig && Array.isArray(c.quorumConfig.nomineeIds) && c.quorumConfig.nomineeIds.includes(userId))
      );
  }

  listAll() {
    return db.gate.listClaims().map((r) => deserializeClaimState(r.state_json));
  }

  clear() {
    db.gate.clearClaims();
  }
}

const persistentStore = new PersistentClaimStore();

const registryVerifier = process.env.CRS_API_KEY
  ? new OfficialPortalVerifier({ apiKey: process.env.CRS_API_KEY })
  : new MockRegistryVerifier();

/**
 * Executes asset handover actions in the database once the grace period finishes
 */
function executeAssetHandover(claimState, actor) {
  const assets = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(claimState.deceasedUserId);

  for (const asset of assets) {
    const actionType = asset.instructions
      ? asset.instructions.toLowerCase().includes('transfer')
        ? 'transfer'
        : asset.instructions.toLowerCase().includes('cancel')
          ? 'cancel'
          : 'recover'
      : 'transfer';

    db.gate.insertAction({
      id: uuidv4(),
      claim_id: claimState.claimId,
      asset_id: asset.id,
      action_type: actionType,
      status: 'completed',
      result_notes: `Asset "${asset.name}" processed via ${actionType} action. Instructions: ${asset.instructions || 'No specific instructions.'}`,
    });
  }

  db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
    uuidv4(),
    claimState.claimantId || claimState.deceasedUserId,
    'CLAIM_EXECUTED',
    JSON.stringify({ claim_id: claimState.claimId, assets_processed: assets.length, actor })
  );

  return db.gate.listActions(claimState.claimId);
}

const orchestrator = new ClaimVerificationOrchestrator({
  registryVerifier,
  store: persistentStore,
  onExecuteClaim: executeAssetHandover,
});

// GET /api/verification/claims — list all gate claims relevant to the logged-in user
router.get('/claims', auth, (req, res) => {
  try {
    const rows = db.gate.listClaims();

    const claims = rows
      .map((row) => {
        const state = deserializeClaimState(row.state_json);
        const actions = db.gate.listActions(state.claimId);
        return {
          ...state,
          deceased_name: row.deceased_name,
          deceased_email: row.deceased_email,
          actions,
        };
      })
      .filter(
        (c) =>
          c.deceasedUserId === req.user.id ||
          c.claimantId === req.user.id ||
          (c.quorumConfig?.nomineeIds || []).includes(req.user.email.toLowerCase())
      );

    return res.json({ success: true, data: claims });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/initiate — authenticated claim initiation via Verification Gate
router.post('/claims/initiate', auth, async (req, res) => {
  try {
    const {
      deceased_email,
      key_share,
      registrationNumber,
      deceasedName,
      dateOfDeath,
      stateOrMunicipality,
      qrPayload,
      evidence_path,
      rawPdfBase64,
      gracePeriodSeconds,
    } = req.body;

    if (req.body.deceasedUserId && req.body.quorumConfig && req.body.certificate) {
      const pdfBuffer = rawPdfBase64 ? Buffer.from(rawPdfBase64, 'base64') : undefined;
      const result = await orchestrator.initiateClaim(
        { ...req.body, claimantId: req.user.id, evidencePath: evidence_path },
        pdfBuffer,
        req.headers['x-correlation-id']
      );
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(201).json({ success: true, data: result.claimState });
    }

    if (!deceased_email || !key_share) {
      return res.status(400).json({ success: false, error: 'deceased_email and key_share are required' });
    }

    const deceased = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(deceased_email.trim());
    if (!deceased) {
      return res.status(404).json({ success: false, error: 'No user found with that email' });
    }

    if (deceased.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot file a claim against yourself' });
    }

    const existing = db.gate.findActiveClaim(req.user.id, deceased.id);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An active claim already exists for this user' });
    }

    const nominees = db.prepare('SELECT * FROM nominees WHERE user_id = ?').all(deceased.id);
    if (nominees.length === 0) {
      return res.status(400).json({ success: false, error: 'Estate owner has no registered nominees configured' });
    }

    const callerNominee = nominees.find((n) => n.email.toLowerCase() === req.user.email.toLowerCase());
    if (!callerNominee) {
      return res.status(403).json({
        success: false,
        error: `You (${req.user.email}) are not a registered nominee for ${deceased.name}'s estate.`,
      });
    }

    if (callerNominee.key_share && callerNominee.key_share !== key_share.trim()) {
      return res.status(403).json({
        success: false,
        error: 'Invalid key share: does not match the share assigned to your nominee profile.',
      });
    }

    const nomineeEmails = nominees.map((n) => n.email.toLowerCase());
    const requiredQuorum = Math.min(2, nomineeEmails.length);
    const pdfBuffer = rawPdfBase64 ? Buffer.from(rawPdfBase64, 'base64') : undefined;

    const result = await orchestrator.initiateClaim(
      {
        deceasedUserId: deceased.id,
        claimantId: req.user.id,
        evidencePath: evidence_path || undefined,
        quorumConfig: {
          requiredQuorum,
          totalNominees: nomineeEmails.length,
          nomineeIds: nomineeEmails,
        },
        certificate: {
          registrationNumber,
          deceasedName: deceasedName || deceased.name,
          dateOfDeath,
          stateOrMunicipality: stateOrMunicipality || 'Central CRS',
          qrPayload: qrPayload || undefined,
        },
        initialShare: {
          nomineeId: req.user.email.toLowerCase(),
          rawShare: key_share.trim(),
        },
        gracePeriodSeconds: gracePeriodSeconds ? Number(gracePeriodSeconds) : 604800,
      },
      pdfBuffer,
      req.headers['x-correlation-id']
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'CLAIM_INITIATED',
      JSON.stringify({ claim_id: result.claimState.claimId, deceased_email, status: result.claimState.status })
    );

    return res.status(201).json({
      success: true,
      data: {
        ...result.claimState,
        deceased_name: deceased.name,
        deceased_email: deceased.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/share — submit additional nominee share with DB key verification
router.post('/claims/:claimId/share', auth, async (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const claimState = orchestrator.getClaim(claimId);
    if (!claimState) {
      return res.status(404).json({ success: false, error: `Claim '${claimId}' not found.` });
    }

    const nomineeEmail = (req.body.nomineeId || req.user.email).toLowerCase();
    const rawShare = String(req.body.rawShare || '').trim();

    const nominees = db.prepare('SELECT * FROM nominees WHERE user_id = ?').all(claimState.deceasedUserId);
    const nominee = nominees.find((n) => n.email.toLowerCase() === nomineeEmail);

    if (nominee && nominee.key_share && nominee.key_share !== rawShare) {
      return res.status(403).json({
        success: false,
        error: 'Invalid key share: does not match the share assigned to this nominee.',
      });
    }

    const result = await orchestrator.submitKeyShare(
      claimId,
      { nomineeId: nomineeEmail, rawShare },
      req.headers['x-correlation-id']
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error, data: result.claimState });
    }

    return res.json({ success: true, data: result.claimState });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/abort — living owner halts claim
router.post('/claims/:claimId/abort', auth, (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const claimState = orchestrator.getClaim(claimId);
    if (!claimState) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }

    if (claimState.deceasedUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only the estate owner can trigger a Liveness Abort.',
      });
    }

    const reason = req.body.reason || 'Estate owner confirmed alive and aborted claim.';
    const result = orchestrator.abortLiveness(claimId, reason, req.user.email, req.headers['x-correlation-id']);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'CLAIM_LIVENESS_ABORTED',
      JSON.stringify({ claim_id: claimId, reason })
    );

    return res.json({ success: true, data: result.claimState });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/dispute — freeze timer for review
router.post('/claims/:claimId/dispute', auth, (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const reason = req.body.reason || 'Objection raised pending review.';
    const result = orchestrator.raiseDispute(claimId, reason, req.user.email, req.headers['x-correlation-id']);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'CLAIM_DISPUTED',
      JSON.stringify({ claim_id: claimId, reason })
    );

    return res.json({ success: true, data: result.claimState });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/execute — execute asset handover only after grace period ends
router.post('/claims/:claimId/execute', auth, async (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const result = await orchestrator.executeClaim(claimId, req.user.email, req.headers['x-correlation-id']);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error, data: result.claimState });
    }

    return res.json({
      success: true,
      data: result.claimState,
      actions: result.executionResult || [],
      message: 'Grace period complete. Asset handover executed.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/verification/claims/:claimId/actions — list executed actions for a claim
router.get('/claims/:claimId/actions', auth, (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const actions = db.gate.listActions(claimId);
    return res.json({ success: true, data: actions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Mount remaining verification-gate endpoints (/claims/:claimId/status, /certificate/inspect, /claims/:claimId/audit-logs)
router.use('/', auth, createVerificationRouter(orchestrator));

module.exports = router;
