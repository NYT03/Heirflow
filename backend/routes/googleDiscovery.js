const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const GoogleAccountAssetScanner = require('../services/googleAccountAssetScanner');

// GET /api/google/oauth-config — exposes public Google OAuth Client ID if configured
router.get('/oauth-config', (req, res) => {
  return res.json({
    success: true,
    data: {
      clientId: process.env.GOOGLE_CLIENT_ID || null,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    },
  });
});

// GET /api/google/capabilities
router.get('/capabilities', (req, res) => {
  return res.json({
    success: true,
    data: {
      provider: 'Google Identity & Workspace',
      categories: [
        { key: 'photos', label: 'Photos & Digital Media', description: 'Google Photos libraries, shared family albums, cloud archives' },
        { key: 'moneyAndUpi', label: 'Money & UPI Accounts', description: 'Google Pay (GPay), PhonePe, Paytm, BHIM VPAs, bank statements' },
        { key: 'crypto', label: 'Crypto Wallets & Exchanges', description: 'Binance, Coinbase, CoinDCX, WazirX, MetaMask email backups' },
        { key: 'property', label: 'Property & Real Estate', description: 'Municipal property tax receipts, land registry deeds, home loan escrows' },
        { key: 'connectedApps', label: 'Signed in with Google Apps', description: 'Third-party fintech, DigiLocker, investments, and cloud subscriptions' }
      ]
    }
  });
});

// POST /api/google/scan — Scan Google/Gmail account for assets
router.post('/scan', auth, async (req, res) => {
  try {
    const { accessToken, email, forceLive } = req.body;
    const targetEmail = email || req.user.email || 'user@gmail.com';
    const token = accessToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

    if (forceLive && !token) {
      return res.status(400).json({
        success: false,
        error: 'A Gmail OAuth access token (gmail.readonly) is required for live scanning.',
      });
    }

    const scanner = new GoogleAccountAssetScanner({
      accessToken: token,
      email: targetEmail,
      mockMode: !token,
    });

    const report = await scanner.scanAll();

    // Mark assets already present in user's vault
    const existingAssets = db.prepare('SELECT name FROM assets WHERE user_id = ?').all(req.user.id);
    const existingNames = new Set(existingAssets.map((a) => a.name.toLowerCase()));

    const discoveredAssets = report.discoveredAssets.map((asset) => ({
      ...asset,
      alreadyImported: existingNames.has(asset.name.toLowerCase()),
    }));

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'GOOGLE_ACCOUNT_SCANNED',
      JSON.stringify({ email: targetEmail, totalDiscovered: discoveredAssets.length })
    );

    return res.json({
      success: true,
      data: {
        ...report,
        discoveredAssets,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/google/import — Import selected discovered bank accounts into the user's Vault with nominee assignment
router.post('/import', auth, (req, res) => {
  try {
    const { assets, nominee_id } = req.body;
    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ success: false, error: 'assets array is required' });
    }

    const inserted = [];
    const insertStmt = db.prepare(
      `INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of assets) {
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
      'ASSETS_IMPORTED_FROM_GOOGLE',
      JSON.stringify({ count: inserted.length, assetNames: assets.map((a) => a.name) })
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
