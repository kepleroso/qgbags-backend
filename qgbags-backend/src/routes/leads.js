// src/routes/leads.js — Gestione prospect/leads
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET /api/leads
router.get('/', auth, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query  = 'SELECT * FROM leads WHERE user_id=$1';
    const vals = [req.user.id];
    let idx    = 2;

    if (status) { query += ` AND status=$${idx++}`; vals.push(status); }
    if (search) {
      query += ` AND (nome ILIKE $${idx} OR cognome ILIKE $${idx} OR email ILIKE $${idx} OR azienda ILIKE $${idx})`;
      vals.push(`%${search}%`); idx++;
    }
    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, vals);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/leads
router.post('/', auth, async (req, res) => {
  const { nome, cognome, email, azienda, score, status, source, notes, tags } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obbligatoria' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO leads (user_id, nome, cognome, email, azienda, score, status, source, notes, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, nome||'', cognome||'', email, azienda||'',
       score||0, status||'new', source||'manual', notes||'', tags||[]]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore creazione lead' });
  }
});

// PATCH /api/leads/:id
router.patch('/:id', auth, async (req, res) => {
  const allowed = ['nome','cognome','email','azienda','score','status','source','notes','tags'];
  const fields  = [];
  const vals    = [];
  let idx = 1;

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key}=$${idx++}`);
      vals.push(req.body[key]);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nessun campo' });
  fields.push(`updated_at=NOW()`);
  vals.push(req.params.id, req.user.id);

  try {
    const { rows } = await pool.query(
      `UPDATE leads SET ${fields.join(',')} WHERE id=$${idx++} AND user_id=$${idx} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lead non trovato' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore aggiornamento' });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM leads WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Errore eliminazione' });
  }
});

// POST /api/leads/import — importa array di lead (da FB Leads, CSV, ecc.)
router.post('/import', auth, async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || leads.length === 0)
    return res.status(400).json({ error: 'Array leads vuoto' });

  try {
    const inserted = [];
    for (const l of leads) {
      if (!l.email) continue;
      const { rows } = await pool.query(
        `INSERT INTO leads (user_id, nome, cognome, email, azienda, source, status)
         VALUES ($1,$2,$3,$4,$5,$6,'new')
         ON CONFLICT DO NOTHING RETURNING *`,
        [req.user.id, l.nome||l.first_name||'', l.cognome||l.last_name||'',
         l.email, l.azienda||l.company||'', l.source||'import']
      );
      if (rows[0]) inserted.push(rows[0]);
    }
    res.json({ imported: inserted.length, leads: inserted });
  } catch (err) {
    res.status(500).json({ error: 'Errore importazione' });
  }
});

module.exports = router;
