const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET || 'heirflow_secret_key_2024',
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const id = uuidv4();
    const password_hash = bcrypt.hashSync(password, 10);

    db.prepare(`INSERT INTO users (id, name, email, password_hash, phone, kyc_status) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id, name, email, password_hash, phone || null, 'pending'
    );

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), id, 'USER_REGISTERED', JSON.stringify({ email })
    );

    const user = db.prepare('SELECT id, name, email, phone, kyc_status, created_at FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    return res.status(201).json({ success: true, data: { token, user } });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    db.prepare(`INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), user.id, 'USER_LOGIN', JSON.stringify({ email })
    );

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    return res.json({ success: true, data: { token, user: safeUser } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, phone, kyc_status, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

