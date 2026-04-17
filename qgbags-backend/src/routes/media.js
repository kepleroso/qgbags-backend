// src/routes/media.js — Upload e gestione media
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// Cartella uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Configurazione multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(UPLOAD_DIR, String(req.user.id));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).slice(2) + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/mov','video/avi'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Helper — URL pubblico del file
function fileUrl(req, userId, filename) {
  return `${req.protocol}://${req.get('host')}/uploads/${userId}/${filename}`;
}

// GET /api/media — lista media utente
router.get('/', auth, async (req, res) => {
  try {
    const { type } = req.query;
    let query  = 'SELECT * FROM media WHERE user_id=$1';
    const vals = [req.user.id];
    if (type) { query += ' AND type=$2'; vals.push(type); }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, vals);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/media/upload — carica uno o più file
router.post('/upload', auth, upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'Nessun file ricevuto' });

  try {
    const inserted = [];
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video');
      const url     = fileUrl(req, req.user.id, file.filename);
      const { rows } = await pool.query(
        `INSERT INTO media (user_id, name, type, file_path, file_url, mime_type, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.id, file.originalname, isVideo ? 'video' : 'image',
         file.path, url, file.mimetype, file.size]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore salvataggio media' });
  }
});

// DELETE /api/media/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM media WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Media non trovato' });

    // Elimina file fisico
    if (rows[0].file_path && fs.existsSync(rows[0].file_path)) {
      fs.unlinkSync(rows[0].file_path);
    }

    await pool.query('DELETE FROM media WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Errore eliminazione' });
  }
});

module.exports = router;
