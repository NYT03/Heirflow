const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/dashboard
router.get('/', auth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, phone, kyc_status, created_at FROM users WHERE id = ?').get(req.user.id);

    const assets = db.prepare('SELECT * FROM assets WHERE user_id = ?').all(req.user.id);
    const nominees = db.prepare('SELECT * FROM nominees WHERE user_id = ?').all(req.user.id);

    const has_assets = assets.length > 0 ? 1 : 0;
    const has_nominees = nominees.length > 0 ? 1 : 0;
    const has_instructions = assets.some(a => a.instructions && a.instructions.trim().length > 0) ? 1 : 0;

    const estate_completeness = Math.round((has_assets * 30 + has_nominees * 30 + has_instructions * 40));

    // Recent activity from audit logs
    const recent_activity = db.prepare(`
      SELECT action, details, created_at FROM audit_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(req.user.id).map(log => ({
      action: log.action,
      details: log.details ? JSON.parse(log.details) : {},
      created_at: log.created_at
    }));

    // Claims summary
    const active_claims = db.prepare(`
      SELECT COUNT(*) as count FROM claims
      WHERE (claimant_id = ? OR deceased_user_id = ?) AND status NOT IN ('completed', 'rejected')
    `).get(req.user.id, req.user.id);

    return res.json({
      success: true,
      data: {
        user,
        assets_count: assets.length,
        nominees_count: nominees.length,
        estate_completeness,
        active_claims: active_claims.count,
        completeness_breakdown: {
          has_assets: Boolean(has_assets),
          has_nominees: Boolean(has_nominees),
          has_instructions: Boolean(has_instructions),
          asset_score: has_assets * 30,
          nominee_score: has_nominees * 30,
          instruction_score: has_instructions * 40
        },
        recent_activity
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

