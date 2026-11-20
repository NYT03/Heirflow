const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');
const GoogleAccountAssetScanner = require('../services/googleAccountAssetScanner');

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

    const scanner = new GoogleAccountAssetScanner({
      accessToken: accessToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
      email: targetEmail,
      mockMode: !accessToken && !process.env.GOOGLE_OAUTH_ACCESS_TOKEN && !forceLive
    });

    const report = await scanner.scanAll();

    // Log the discovery scan action
    try {
      db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
        uuidv4(),
        req.user.id,
        'GOOGLE_ACCOUNT_SCANNED',
        JSON.stringify({ email: targetEmail, totalDiscovered: report.summary.totalAssets })
      );
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr.message);
    }

    return res.json({
      success: true,
      data: report
    });
  } catch (err) {
    console.error('Google scan error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/google/import — Batch import selected discovered assets into HeirFlow
router.post('/import', auth, async (req, res) => {
  try {
    const { assets, nominee_id } = req.body;
    if (!assets || !Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ success: false, error: 'assets array is required for import' });
    }

    const scanner = new GoogleAccountAssetScanner({ email: req.user.email });
    const formattedAssets = scanner.toHeirFlowAssets(assets, req.user.id, nominee_id || null);

    const insertStmt = db.prepare(`
      INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const imported = [];
    const runTransaction = db.transaction((items) => {
      for (const item of items) {
        insertStmt.run(
          item.id,
          item.user_id,
          item.type,
          item.name,
          JSON.stringify(item.details || {}),
          item.instructions || null,
          item.nominee_id || null
        );
        imported.push(item);
      }
    });

    runTransaction(formattedAssets);

    // Write audit log
    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'ASSETS_IMPORTED_FROM_GOOGLE',
      JSON.stringify({ count: imported.length, assetNames: imported.map(a => a.name) })
    );

    return res.status(201).json({
      success: true,
      data: {
        message: `Successfully imported ${imported.length} assets from Google account`,
        importedCount: imported.length,
        assets: imported
      }
    });
  } catch (err) {
    console.error('Import error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
