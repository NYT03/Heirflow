const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/assets
router.get('/', auth, (req, res) => {
  try {
    const assets = db.prepare(`
      SELECT a.*, n.name as nominee_name, n.email as nominee_email
      FROM assets a
      LEFT JOIN nominees n ON a.nominee_id = n.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);

    const parsed = assets.map(a => ({
      ...a,
      details: a.details ? JSON.parse(a.details) : {}
    }));

    return res.json({ success: true, data: parsed });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets
router.post('/', auth, (req, res) => {
  try {
    const { type, name, details, instructions, nominee_id } = req.body;
    if (!type || !name) {
      return res.status(400).json({ success: false, error: 'type and name are required' });
    }

    const validTypes = ['bank', 'crypto', 'subscription', 'file', 'property', 'social'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${validTypes.join(', ')}` });
    }

    const id = uuidv4();
    db.prepare(`INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user.id, type, name,
      details ? JSON.stringify(details) : '{}',
      instructions || null,
      nominee_id || null
    );

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'ASSET_CREATED', JSON.stringify({ asset_id: id, type, name })
    );

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    return res.status(201).json({ success: true, data: { ...asset, details: JSON.parse(asset.details) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets/import-passwords — Bulk import client-encrypted Chrome Saved Passwords
router.post('/import-passwords', auth, (req, res) => {
  try {
    const { entries, nominee_id } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'entries array is required' });
    }

    const validTypes = ['bank', 'crypto', 'subscription', 'file', 'property', 'social'];
    const existing = db.prepare('SELECT name, details FROM assets WHERE user_id = ?').all(req.user.id);
    const existingKeys = new Set(
      existing.map((a) => {
        let username = '';
        try {
          username = JSON.parse(a.details || '{}').username || '';
        } catch {}
        return `${a.name.toLowerCase()}::${String(username).toLowerCase()}`;
      })
    );

    const insertStmt = db.prepare(
      `INSERT INTO assets (id, user_id, type, name, details, instructions, nominee_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const imported = [];
    let skippedCount = 0;

    const runImport = db.transaction(() => {
      for (const entry of entries) {
        if (!entry || !entry.name) {
          skippedCount++;
          continue;
        }
        const assetType = validTypes.includes(entry.type) ? entry.type : 'subscription';
        const username = entry.details?.username || '';
        const dedupeKey = `${String(entry.name).toLowerCase()}::${String(username).toLowerCase()}`;

        if (existingKeys.has(dedupeKey)) {
          skippedCount++;
          continue;
        }
        existingKeys.add(dedupeKey);

        const id = uuidv4();
        const detailsJson = JSON.stringify(entry.details || {});
        const instructions = entry.instructions || 'transfer';
        const targetNominee = entry.nominee_id || nominee_id || null;

        insertStmt.run(id, req.user.id, assetType, entry.name, detailsJson, instructions, targetNominee);
        imported.push({
          id,
          type: assetType,
          name: entry.name,
          details: entry.details || {},
          instructions,
          nominee_id: targetNominee,
        });
      }
    });

    runImport();

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      req.user.id,
      'CHROME_PASSWORDS_IMPORTED',
      JSON.stringify({ importedCount: imported.length, skippedCount, nominee_id: nominee_id || null })
    );

    return res.status(201).json({
      success: true,
      data: {
        importedCount: imported.length,
        skippedCount,
        assets: imported,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/assets/:id
router.put('/:id', auth, (req, res) => {
  try {
    const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });

    const { type, name, details, instructions, nominee_id } = req.body;
    db.prepare(`
      UPDATE assets SET
        type = COALESCE(?, type),
        name = COALESCE(?, name),
        details = COALESCE(?, details),
        instructions = COALESCE(?, instructions),
        nominee_id = COALESCE(?, nominee_id)
      WHERE id = ? AND user_id = ?
    `).run(type, name, details ? JSON.stringify(details) : null, instructions, nominee_id, req.params.id, req.user.id);

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'ASSET_UPDATED', JSON.stringify({ asset_id: req.params.id })
    );

    const updated = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    return res.json({ success: true, data: { ...updated, details: JSON.parse(updated.details) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/assets/:id
router.delete('/:id', auth, (req, res) => {
  try {
    const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });

    db.prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'ASSET_DELETED', JSON.stringify({ asset_id: req.params.id, name: asset.name })
    );

    return res.json({ success: true, data: { message: 'Asset deleted' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

