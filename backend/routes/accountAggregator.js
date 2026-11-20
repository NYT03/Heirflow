const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const aaService = require('../services/rbiAccountAggregator');

// GET /api/aa/status — check whether Live Setu AA Sandbox or Local ReBIT Simulator is active
router.get('/status', auth, (req, res) => {
  return res.json({
    success: true,
    data: {
      provider: 'RBI Account Aggregator (ReBIT Spec)',
      mode: aaService.isLiveSandboxConfigured() ? 'setu_aa_sandbox' : 'rbi_aa_local_simulator',
      fiTypesSupported: ['DEPOSIT'],
    },
  });
});

// POST /api/aa/consent — Step 1: Create RBI AA Consent Request
router.post('/consent', auth, async (req, res) => {
  try {
    const { mobileNumber, aaHandle } = req.body;
    if (!mobileNumber && !aaHandle) {
      return res.status(400).json({ success: false, error: 'mobileNumber or aaHandle (e.g. 9876543210@onemoney) is required' });
    }

    const consent = await aaService.createConsent({
      mobileNumber: mobileNumber || '9876543210',
      aaHandle,
      userId: req.user.id,
    });

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'RBI_AA_CONSENT_CREATED',
      JSON.stringify({ consentId: consent.consentId, vua: consent.vua, mode: consent.mode })
    );

    return res.status(201).json({ success: true, data: consent });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/aa/consent/:consentId/approve — Step 2 (Simulator): Approve AA Consent via OTP
router.post('/consent/:consentId/approve', auth, (req, res) => {
  try {
    const { otp } = req.body;
    const updated = aaService.approveLocalConsent(req.params.consentId, otp || '123456');

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'RBI_AA_CONSENT_APPROVED',
      JSON.stringify({ consentId: updated.consentId, status: updated.status })
    );

    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/aa/consent/:consentId/accounts — Step 3: Fetch linked bank accounts (DEPOSIT FIPs)
router.get('/consent/:consentId/accounts', auth, async (req, res) => {
  try {
    const result = await aaService.fetchBankAccounts(req.params.consentId);
    const existingAssets = db.prepare('SELECT name FROM assets WHERE user_id = ?').all(req.user.id);
    const existingNames = new Set(existingAssets.map((a) => a.name.toLowerCase()));

    const accounts = result.accounts.map((acc) => ({
      ...acc,
      alreadyImported: existingNames.has(acc.name.toLowerCase()),
    }));

    return res.json({
      success: true,
      data: {
        ...result,
        accounts,
      },
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/aa/import — Step 4: Import discovered bank accounts & assign nominee for transfer
router.post('/import', auth, (req, res) => {
  try {
    const { accounts, nominee_id } = req.body;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ success: false, error: 'accounts array is required' });
    }

    const inserted = [];
    const insertStmt = db.prepare(
      `INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of accounts) {
      const id = uuidv4();
      insertStmt.run(
        id,
        req.user.id,
        'bank',
        item.name,
        typeof item.details === 'string' ? item.details : JSON.stringify(item.details || {}),
        item.instructions || 'Transfer bank account balance to designated nominee upon verified claim.',
        item.nominee_id || nominee_id || null
      );
      inserted.push(id);
    }

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'RBI_AA_BANK_ACCOUNTS_IMPORTED',
      JSON.stringify({ count: inserted.length, nominee_id: nominee_id || null, accounts: accounts.map((a) => a.name) })
    );

    return res.status(201).json({
      success: true,
      data: { importedCount: inserted.length, ids: inserted },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
