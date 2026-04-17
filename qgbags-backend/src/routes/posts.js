// src/routes/posts.js — CRUD post
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET /api/posts — tutti i post dell'utente
router.get('/', auth, async (req, res) => {
  try {
    const { status, platform, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM posts WHERE user_id = $1`;
    const params = [req.user.id];
    let idx = 2;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (platform) { query += ` AND $${idx++} = ANY(platforms)`; params.push(platform); }

    query += ` ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// GET /api/posts/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM posts WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post non trovato' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/posts — crea post
router.post('/', auth, async (req, res) => {
  const { caption, platforms, media_ids, status, scheduled_at } = req.body;
  if (!platforms || platforms.length === 0)
    return res.status(400).json({ error: 'Seleziona almeno una piattaforma' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO posts (user_id, caption, platforms, media_ids, status, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.user.id,
        caption || '',
        platforms,
        media_ids || [],
        status || (scheduled_at ? 'scheduled' : 'draft'),
        scheduled_at || null
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore creazione post' });
  }
});

// PATCH /api/posts/:id — aggiorna post
router.patch('/:id', auth, async (req, res) => {
  const { caption, platforms, media_ids, status, scheduled_at, platform_post_ids } = req.body;
  try {
    const fields = [];
    const vals   = [];
    let idx = 1;

    if (caption       !== undefined) { fields.push(`caption=$${idx++}`);           vals.push(caption); }
    if (platforms     !== undefined) { fields.push(`platforms=$${idx++}`);          vals.push(platforms); }
    if (media_ids     !== undefined) { fields.push(`media_ids=$${idx++}`);          vals.push(media_ids); }
    if (status        !== undefined) { fields.push(`status=$${idx++}`);             vals.push(status); }
    if (scheduled_at  !== undefined) { fields.push(`scheduled_at=$${idx++}`);       vals.push(scheduled_at); }
    if (platform_post_ids !== undefined) { fields.push(`platform_post_ids=$${idx++}`); vals.push(JSON.stringify(platform_post_ids)); }
    fields.push(`updated_at=NOW()`);

    if (fields.length === 1) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

    vals.push(req.params.id, req.user.id);
    const { rows } = await pool.query(
      `UPDATE posts SET ${fields.join(',')} WHERE id=$${idx++} AND user_id=$${idx} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post non trovato' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM posts WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Post non trovato' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Errore eliminazione' });
  }
});

// GET /api/posts/calendar/:year/:month — post per il calendario
router.get('/calendar/:year/:month', auth, async (req, res) => {
  const { year, month } = req.params;
  const start = `${year}-${month.padStart(2,'0')}-01`;
  const end   = new Date(year, month, 0).toISOString().slice(0,10); // ultimo giorno

  try {
    const { rows } = await pool.query(
      `SELECT id, caption, platforms, status, scheduled_at, published_at, created_at
       FROM posts
       WHERE user_id=$1
         AND (
           (scheduled_at  BETWEEN $2 AND $3) OR
           (published_at  BETWEEN $2 AND $3) OR
           (created_at    BETWEEN $2 AND $3)
         )
       ORDER BY COALESCE(scheduled_at, published_at, created_at)`,
      [req.user.id, start, end + 'T23:59:59Z']
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Errore calendario' });
  }
});

module.exports = router;
