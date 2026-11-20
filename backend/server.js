require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize DB (runs table creation + seed)
require('./db');

// Routes
const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/assets');
const nomineeRoutes = require('./routes/nominees');
const claimRoutes = require('./routes/claims');
const dashboardRoutes = require('./routes/dashboard');
const geminiRoutes = require('./routes/gemini');

app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/nominees', nomineeRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/gemini', geminiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'HeirFlow API',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 HeirFlow API running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔒 JWT auth enabled`);
  console.log(`💾 SQLite database: heirflow.db\n`);
});

module.exports = app;

