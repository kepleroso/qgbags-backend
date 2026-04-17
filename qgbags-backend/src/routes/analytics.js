// src/routes/analytics.js — Analytics post
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET /api/analytics — metriche aggregate per tutti i post
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.caption, p.platforms, p.status, p.created_at,
         COALESCE(SUM(a.reach),0)       AS total_reach,
         COALESCE(SUM(a.likes),0)       AS total_likes,
         COALESCE(SUM(a.comments),0)    AS total_comments,
         COALESCE(SUM(a.shares),0)      AS total_shares,
         COALESCE(SUM(a.saves),0)       AS total_saves,
         COALESCE(SUM(a.impressions),0) AS total_impressions,
         CASE WHEN COALESCE(SUM(a.reach),0)>0
           THEN ROUND((SUM(a.likes)+SUM(a.comments)+SUM(a.shares))::numeric / SUM(a.reach) * 100, 2)
           ELSE 0
         END AS eng_rate
       FROM posts p
       LEFT JOIN post_analytics a ON a.post_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/analytics/:postId — salva/aggiorna metriche di un post
router.post('/:postId', auth, async (req, res) => {
  const { platform, reach, likes, comments, shares, saves, clicks, impressions } = req.body;
  if (!platform) return res.status(400).json({ error: 'Platform obbligatoria' });

  try {
    // Verifica che il post appartenga all'utente
    const check = await pool.query(
      'SELECT id FROM posts WHERE id=$1 AND user_id=$2',
      [req.params.postId, req.user.id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Post non trovato' });

    const { rows } = await pool.query(
      `INSERT INTO post_analytics (post_id, platform, reach, likes, comments, shares, saves, clicks, impressions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.params.postId, platform,
       reach||0, likes||0, comments||0, shares||0, saves||0, clicks||0, impressions||0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore salvataggio analytics' });
  }
});

// GET /api/analytics/summary — totali per dashboard
router.get('/summary', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(DISTINCT p.id) FILTER (WHERE p.status='published') AS published_posts,
         COUNT(DISTINCT p.id) FILTER (WHERE p.status='scheduled') AS scheduled_posts,
         COUNT(DISTINCT p.id) FILTER (WHERE p.status='draft')     AS draft_posts,
         COALESCE(SUM(a.reach),0)    AS total_reach,
         COALESCE(SUM(a.likes),0)    AS total_likes,
         COALESCE(SUM(a.comments),0) AS total_comments,
         COALESCE(SUM(a.shares),0)   AS total_shares
       FROM posts p
       LEFT JOIN post_analytics a ON a.post_id = p.id
       WHERE p.user_id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
