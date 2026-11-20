const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const { uploadFile, getSignedUrl } = require('../services/cloudStorage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// POST /api/storage/upload — upload file to Google Cloud Storage (or local fallback)
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const folder = req.body.folder || 'evidence';
    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );

    return res.status(201).json({
      success: true,
      data: {
        original_name: req.file.originalname,
        filename: result.filename,
        file_url: result.url,
        storage: result.storage,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (err) {
    console.error('Upload endpoint error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/signed-url — get time-limited signed URL for GCS document
router.get('/signed-url', auth, async (req, res) => {
  try {
    const { filename, expiry } = req.query;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'filename query parameter is required' });
    }

    const url = await getSignedUrl(filename, Number(expiry) || 60);
    return res.json({ success: true, data: { url } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/file/:filename — local storage fallback retriever
router.get('/file/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return res.status(404).json({ success: false, error: 'File not found' });
});

module.exports = router;

