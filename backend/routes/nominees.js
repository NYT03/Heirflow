const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/nominees
router.get('/', auth, (req, res) => {
  try {
    const nominees = db.prepare('SELECT * FROM nominees WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const parsed = nominees.map(n => ({
      ...n,
      permissions: n.permissions ? JSON.parse(n.permissions) : {}
    }));
    return res.json({ success: true, data: parsed });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/nominees
router.post('/', auth, (req, res) => {
  try {
    const { name, email, phone, relationship, permissions } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'name and email are required' });
    }

    const id = uuidv4();
    // Generate a mock Shamir-style key share
    const shareRaw = uuidv4().split('-').join('').toUpperCase();
    const key_share = `HEIRFLOW-SHARE-${shareRaw.substring(0, 8)}-${shareRaw.substring(8, 16)}-${shareRaw.substring(16, 24)}`;

    db.prepare(`INSERT INTO nominees (id, user_id, name, email, phone, relationship, key_share, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user.id, name, email,
      phone || null, relationship || null,
      key_share,
      permissions ? JSON.stringify(permissions) : JSON.stringify({ can_view_assets: true, can_initiate_claims: true, can_access_files: false })
    );

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'NOMINEE_ADDED', JSON.stringify({ nominee_id: id, name, email })
    );

    const nominee = db.prepare('SELECT * FROM nominees WHERE id = ?').get(id);
    return res.status(201).json({ success: true, data: { ...nominee, permissions: JSON.parse(nominee.permissions) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/nominees/:id
router.put('/:id', auth, (req, res) => {
  try {
    const nominee = db.prepare('SELECT * FROM nominees WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!nominee) return res.status(404).json({ success: false, error: 'Nominee not found' });

    const { name, email, phone, relationship, permissions } = req.body;
    db.prepare(`
      UPDATE nominees SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        relationship = COALESCE(?, relationship),
        permissions = COALESCE(?, permissions)
      WHERE id = ? AND user_id = ?
    `).run(name, email, phone, relationship, permissions ? JSON.stringify(permissions) : null, req.params.id, req.user.id);

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'NOMINEE_UPDATED', JSON.stringify({ nominee_id: req.params.id })
    );

    const updated = db.prepare('SELECT * FROM nominees WHERE id = ?').get(req.params.id);
    return res.json({ success: true, data: { ...updated, permissions: JSON.parse(updated.permissions) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/nominees/:id
router.delete('/:id', auth, (req, res) => {
  try {
    const nominee = db.prepare('SELECT * FROM nominees WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!nominee) return res.status(404).json({ success: false, error: 'Nominee not found' });

    db.prepare('DELETE FROM nominees WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), req.user.id, 'NOMINEE_DELETED', JSON.stringify({ nominee_id: req.params.id, name: nominee.name })
    );

    return res.json({ success: true, data: { message: 'Nominee deleted' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

