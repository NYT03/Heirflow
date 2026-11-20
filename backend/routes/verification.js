const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const BlockchainService = require('../services/blockchainService');
const { deriveContractKey, encryptAssetPayload, decryptAssetPayload } = require('../services/assetVaultCrypto');
const { sendClaimInitiatedEmails, sendClaimSettledEmails } = require('../services/emailService');
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

class SqliteClaimStore {
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

const sqliteStore = new SqliteClaimStore();
const registryVerifier = process.env.CRS_API_KEY
  ? new OfficialPortalVerifier({ apiKey: process.env.CRS_API_KEY })
  : new MockRegistryVerifier();

/**
 * Executes encrypted asset handover via Smart Contract + Blockchain, then destroys nominee key shares.
 */
async function executeAssetHandover(claimState, actor) {
  const assets = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(claimState.deceasedUserId);
  const contractAddress = BlockchainService.deriveContractAddress(claimState.claimId, claimState.deceasedUserId);
  const contractKey = deriveContractKey(claimState.claimId, contractAddress, claimState.deceasedUserId);

  // 1. Encrypt every asset with AES-256-GCM bound to the Smart Contract
  const encryptedPackages = [];
  for (const asset of assets) {
    const actionType = asset.instructions
      ? asset.instructions.toLowerCase().includes('transfer')
        ? 'transfer'
        : asset.instructions.toLowerCase().includes('cancel')
          ? 'cancel'
          : 'recover'
      : 'transfer';

    const encryptedPkg = encryptAssetPayload(asset, contractKey);
    encryptedPackages.push({ asset, actionType, encryptedPkg });
  }

  // 2. Enforce & record Smart Contract execution on Blockchain
  const chainReceipt = BlockchainService.executeSmartContractRelease({
    claimState,
    encryptedAssetsCount: encryptedPackages.length,
  });

  // 3. Persist encrypted handover actions
  for (const item of encryptedPackages) {
    db.gate.insertAction({
      id: uuidv4(),
      claim_id: claimState.claimId,
      asset_id: item.asset.id,
      action_type: item.actionType,
      status: 'completed',
      encrypted_payload: JSON.stringify(item.encryptedPkg),
      contract_address: chainReceipt.contractAddress,
      tx_hash: chainReceipt.txHash,
      result_notes: `Encrypted via AES-256-GCM & released by Smart Contract ${chainReceipt.contractAddress.slice(0, 10)}...`,
    });
  }

  // 4. Permanently destroy all nominee key shares for this settled estate
  const destroyResult = db.gate.destroyNomineeKeys(claimState.deceasedUserId);
  claimState.keysDestroyed = true;
  claimState.contractAddress = chainReceipt.contractAddress;
  claimState.executionTxHash = chainReceipt.txHash;

  BlockchainService.recordStageBlock({
    claimId: claimState.claimId,
    stage: 'KEY_SHARES_DESTROYED',
    actor: 'SYSTEM',
    contractAddress: chainReceipt.contractAddress,
    data: {
      deceasedUserId: claimState.deceasedUserId,
      destroyedCount: destroyResult.destroyedCount,
      destroyedAt: destroyResult.destroyedAt,
    },
  });

  db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
    uuidv4(),
    claimState.claimantId || claimState.deceasedUserId,
    'CLAIM_EXECUTED',
    JSON.stringify({
      claim_id: claimState.claimId,
      assets_processed: assets.length,
      contract_address: chainReceipt.contractAddress,
      tx_hash: chainReceipt.txHash,
      keys_destroyed: destroyResult.destroyedCount,
      actor,
    })
  );

  // 5. Notify nominees via email
  const deceasedUser = db.prepare('SELECT name FROM users WHERE id = ?').get(claimState.deceasedUserId);
  await sendClaimSettledEmails({
    claimId: claimState.claimId,
    deceasedName: deceasedUser?.name || 'Estate Owner',
    nomineeEmails: claimState.quorumConfig?.nomineeIds || [],
    contractAddress: chainReceipt.contractAddress,
    txHash: chainReceipt.txHash,
  });

  return db.gate.listActions(claimState.claimId);
}

const orchestrator = new ClaimVerificationOrchestrator({
  registryVerifier,
  store: sqliteStore,
  onExecuteClaim: executeAssetHandover,
});

// GET /api/verification/claims — list all gate claims relevant to the logged-in user
router.get('/claims', auth, (req, res) => {
  try {
    const rows = db.gate.listClaims();
    const userEmail = req.user.email.toLowerCase();

    const claims = rows
      .map((row) => {
        const state = deserializeClaimState(row.state_json);
        const actions = db.gate.listActions(state.claimId);
        const ledger = BlockchainService.getClaimLedger(state.claimId);
        return {
          ...state,
          deceased_name: row.deceased_name,
          deceased_email: row.deceased_email,
          actions,
          blockchain: ledger,
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

// GET /api/verification/emails/outbox — view sent email notifications
router.get('/emails/outbox', auth, (req, res) => {
  try {
    return res.json({ success: true, data: db.emailOutbox.list() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/initiate — initiates claim OR joins existing PENDING_QUORUM claim for 2/3 quorum
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

    const callerEmail = req.user.email.toLowerCase();
    const callerNominee = nominees.find((n) => n.email.toLowerCase() === callerEmail);
    if (!callerNominee) {
      return res.status(403).json({
        success: false,
        error: `You (${req.user.email}) are not a registered nominee for ${deceased.name}'s estate.`,
      });
    }

    if (callerNominee.key_status === 'DESTROYED' || !callerNominee.key_share) {
      return res.status(410).json({
        success: false,
        error: 'Your key share has been permanently destroyed because a prior claim was already settled.',
      });
    }

    if (callerNominee.key_share !== key_share.trim()) {
      return res.status(403).json({
        success: false,
        error: 'Invalid key share: does not match the share assigned to your nominee profile.',
      });
    }

    // PROBLEM 2 FIX: If an active claim already exists for this deceased user, join it for quorum instead of opening a new claim!
    const existingRow = db.gate.findActiveClaimByDeceased(deceased.id);
    if (existingRow) {
      const existingState = deserializeClaimState(existingRow.state_json);
      if (existingState.status !== 'PENDING_QUORUM') {
        return res.status(409).json({
          success: false,
          error: `An active claim (#${existingState.claimId.slice(0, 8)}) already exists in stage '${existingState.status}'.`,
        });
      }

      const joinResult = await orchestrator.submitKeyShare(
        existingState.claimId,
        { nomineeId: callerEmail, rawShare: key_share.trim() },
        req.headers['x-correlation-id']
      );

      if (!joinResult.success) {
        return res.status(400).json({ success: false, error: joinResult.error, data: joinResult.claimState });
      }

      const updated = joinResult.claimState;
      const contractAddress = BlockchainService.deriveContractAddress(updated.claimId, deceased.id);

      BlockchainService.recordStageBlock({
        claimId: updated.claimId,
        stage: 'QUORUM_SHARE_ADDED',
        actor: callerEmail,
        contractAddress,
        data: {
          deceasedUserId: deceased.id,
          sharesCollected: updated.submittedShares.length,
          requiredQuorum: updated.quorumConfig.requiredQuorum,
          newStatus: updated.status,
        },
      });

      if (updated.status !== 'PENDING_QUORUM') {
        BlockchainService.recordStageBlock({
          claimId: updated.claimId,
          stage: updated.status,
          actor: 'VERIFICATION_GATE',
          contractAddress,
          data: {
            deceasedUserId: deceased.id,
            registryStatus: updated.registryResult?.status,
            holdReason: updated.holdReason,
            graceEndsAt: updated.graceEndsAt,
          },
        });
      }

      return res.status(200).json({
        success: true,
        joinedExistingClaim: true,
        message: `Joined existing claim #${updated.claimId.slice(0, 8)} towards 2/3 quorum (${updated.submittedShares.length}/${updated.quorumConfig.requiredQuorum}).`,
        data: {
          ...updated,
          deceased_name: deceased.name,
          deceased_email: deceased.email,
        },
      });
    }

    // PROBLEM 6 FIX: Strict 2/3 Quorum of total nominees: ceil(2 * M / 3)
    const nomineeEmails = nominees.map((n) => n.email.toLowerCase());
    const requiredQuorum = Math.max(1, Math.ceil((2 * nomineeEmails.length) / 3));
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

    const created = result.claimState;
    const contractAddress = BlockchainService.deriveContractAddress(created.claimId, deceased.id);
    created.contractAddress = contractAddress;
    sqliteStore.save(created);

    // Record initial stage + verification stage on Blockchain
    BlockchainService.recordStageBlock({
      claimId: created.claimId,
      stage: 'CLAIM_INITIATED',
      actor: callerEmail,
      contractAddress,
      data: {
        deceasedUserId: deceased.id,
        registrationNumber,
        requiredQuorum,
        totalNominees: nomineeEmails.length,
      },
    });

    if (created.status !== 'PENDING_QUORUM') {
      BlockchainService.recordStageBlock({
        claimId: created.claimId,
        stage: created.status,
        actor: 'VERIFICATION_GATE',
        contractAddress,
        data: {
          deceasedUserId: deceased.id,
          registryStatus: created.registryResult?.status,
          holdReason: created.holdReason,
          graceEndsAt: created.graceEndsAt,
        },
      });
    }

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'CLAIM_INITIATED',
      JSON.stringify({ claim_id: created.claimId, deceased_email, status: created.status, requiredQuorum })
    );

    // PROBLEM 1 FIX: Send email alerts to estate owner & other nominees
    await sendClaimInitiatedEmails({
      claimId: created.claimId,
      deceasedName: deceased.name,
      deceasedEmail: deceased.email,
      claimantName: req.user.name,
      claimantEmail: req.user.email,
      otherNominees: nominees,
      requiredQuorum,
      totalNominees: nomineeEmails.length,
    });

    return res.status(201).json({
      success: true,
      data: {
        ...created,
        deceased_name: deceased.name,
        deceased_email: deceased.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/share — submit additional nominee share towards 2/3 quorum
router.post('/claims/:claimId/share', auth, async (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const claimState = orchestrator.getClaim(claimId);
    if (!claimState) {
      return res.status(404).json({ success: false, error: `Claim '${claimId}' not found.` });
    }

    const nomineeEmail = (req.body.nomineeId || req.user.email).toLowerCase();
    const rawShare = String(req.body.rawShare || '').trim();

    const nominee = db
      .prepare('SELECT * FROM nominees WHERE user_id = ? AND LOWER(email) = ?')
      .get(claimState.deceasedUserId, nomineeEmail);

    if (!nominee || nominee.key_status === 'DESTROYED' || !nominee.key_share || nominee.key_share !== rawShare) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or destroyed key share: does not match the active share assigned to this nominee.',
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

    const updated = result.claimState;
    const contractAddress = BlockchainService.deriveContractAddress(claimId, updated.deceasedUserId);

    BlockchainService.recordStageBlock({
      claimId,
      stage: 'QUORUM_SHARE_ADDED',
      actor: nomineeEmail,
      contractAddress,
      data: {
        deceasedUserId: updated.deceasedUserId,
        sharesCollected: updated.submittedShares.length,
        requiredQuorum: updated.quorumConfig.requiredQuorum,
        status: updated.status,
      },
    });

    if (updated.status !== 'PENDING_QUORUM') {
      BlockchainService.recordStageBlock({
        claimId,
        stage: updated.status,
        actor: 'VERIFICATION_GATE',
        contractAddress,
        data: {
          deceasedUserId: updated.deceasedUserId,
          registryStatus: updated.registryResult?.status,
          holdReason: updated.holdReason,
          graceEndsAt: updated.graceEndsAt,
        },
      });
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/abort — living owner halts claim
router.post('/claims/:claimId/abort', auth, (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const claimState = orchestrator.getClaim(claimId);
    if (!claimState) return res.status(404).json({ success: false, error: 'Claim not found' });

    if (claimState.deceasedUserId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Only the estate owner can trigger a Liveness Abort.' });
    }

    const reason = req.body.reason || 'Estate owner confirmed alive and aborted claim.';
    const result = orchestrator.abortLiveness(claimId, reason, req.user.email, req.headers['x-correlation-id']);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });

    BlockchainService.recordStageBlock({
      claimId,
      stage: 'ABORTED_LIVENESS',
      actor: req.user.email,
      contractAddress: BlockchainService.deriveContractAddress(claimId, claimState.deceasedUserId),
      data: { deceasedUserId: claimState.deceasedUserId, reason },
    });

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'CLAIM_LIVENESS_ABORTED', JSON.stringify({ claim_id: claimId, reason })
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
    if (!result.success) return res.status(400).json({ success: false, error: result.error });

    BlockchainService.recordStageBlock({
      claimId,
      stage: 'DISPUTED',
      actor: req.user.email,
      contractAddress: BlockchainService.deriveContractAddress(claimId, result.claimState.deceasedUserId),
      data: { deceasedUserId: result.claimState.deceasedUserId, reason },
    });

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'CLAIM_DISPUTED', JSON.stringify({ claim_id: claimId, reason })
    );

    return res.json({ success: true, data: result.claimState });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/execute — executes Smart Contract, encrypts assets & destroys keys
router.post('/claims/:claimId/execute', auth, async (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const result = await orchestrator.executeClaim(claimId, req.user.email, req.headers['x-correlation-id']);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error, data: result.claimState });
    }

    // Re-save to capture keysDestroyed & txHash fields
    sqliteStore.save(result.claimState);

    return res.json({
      success: true,
      data: result.claimState,
      actions: result.executionResult || [],
      message: 'Smart Contract executed! Encrypted assets released and all nominee key shares destroyed.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/claims/:claimId/decrypt-assets — authorized nominee decrypts inherited assets via Smart Contract
router.post('/claims/:claimId/decrypt-assets', auth, (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    const claimState = orchestrator.getClaim(claimId);
    if (!claimState) return res.status(404).json({ success: false, error: 'Claim not found' });

    if (claimState.status !== 'EXECUTED') {
      return res.status(403).json({
        success: false,
        error: `Assets remain locked until Smart Contract execution completes (current status: ${claimState.status}).`,
      });
    }

    const userEmail = req.user.email.toLowerCase();
    const isAuthorized =
      claimState.deceasedUserId === req.user.id ||
      claimState.claimantId === req.user.id ||
      (claimState.quorumConfig?.nomineeIds || []).includes(userEmail);

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Not authorized to decrypt this estate.' });
    }

    const chainCheck = BlockchainService.verifyChain();
    if (!chainCheck.valid) {
      return res.status(500).json({ success: false, error: 'Blockchain integrity check failed.' });
    }

    const contractAddress = BlockchainService.deriveContractAddress(claimId, claimState.deceasedUserId);
    const contractKey = deriveContractKey(claimId, contractAddress, claimState.deceasedUserId);
    const actions = db.gate.listActions(claimId);

    const decryptedAssets = actions.map((action) => {
      let decrypted = null;
      if (action.encrypted_payload) {
        decrypted = decryptAssetPayload(JSON.parse(action.encrypted_payload), contractKey);
      }
      return {
        actionId: action.id,
        assetName: action.asset_name,
        assetType: action.asset_type,
        actionType: action.action_type,
        contractAddress: action.contract_address,
        txHash: action.tx_hash,
        decrypted,
      };
    });

    return res.json({
      success: true,
      data: {
        contractAddress,
        chainVerified: chainCheck.valid,
        assets: decryptedAssets,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/verification/claims/:claimId/blockchain — full immutable blockchain audit trail for a claim
router.get('/claims/:claimId/blockchain', auth, (req, res) => {
  try {
    const claimId = String(req.params.claimId);
    return res.json({ success: true, data: BlockchainService.getClaimLedger(claimId) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/verification/claims/:claimId/actions
router.get('/claims/:claimId/actions', auth, (req, res) => {
  try {
    return res.json({ success: true, data: db.gate.listActions(String(req.params.claimId)) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.use('/', auth, createVerificationRouter(orchestrator));

module.exports = router;
