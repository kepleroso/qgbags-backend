// src/routes/apikeys.js — Credenziali piattaforme social
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

const PLATFORMS = ['fb', 'ig', 'tt', 'canva', 'gads'];

// GET /api/apikeys — tutte le credenziali dell'utente
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT platform, key_data, connected, updated_at FROM api_keys WHERE user_id=$1',
      [req.user.id]
    );
    // Ritorna un oggetto { fb: {...}, ig: {...}, ... }
    const result = {};
    for (const row of rows) {
      // Nascondi i valori sensibili (mostra solo se è configurato)
      const safe = {};
      for (const [k, v] of Object.entries(row.key_data)) {
        safe[k] = typeof v === 'string' && v.length > 4
          ? v.slice(0, 4) + '••••'
          : v;
      }
      result[row.platform] = { ...safe, connected: row.connected, updated_at: row.updated_at };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

// PUT /api/apikeys/:platform — salva credenziali
router.put('/:platform', auth, async (req, res) => {
  const { platform } = req.params;
  if (!PLATFORMS.includes(platform))
    return res.status(400).json({ error: 'Piattaforma non valida' });

  const keyData = req.body; // { token, pageId, appId, ... }
  if (!keyData || Object.keys(keyData).length === 0)
    return res.status(400).json({ error: 'Dati mancanti' });

  try {
    // Prima recupera le chiavi esistenti per fare merge (non sovrascrivere con •••)
    const existing = await pool.query(
      'SELECT key_data FROM api_keys WHERE user_id=$1 AND platform=$2',
      [req.user.id, platform]
    );
    const prev = existing.rows[0]?.key_data || {};

    // Merge: se il valore nuovo contiene ••• (mascherato), tieni il vecchio
    const merged = { ...prev };
    for (const [k, v] of Object.entries(keyData)) {
      if (typeof v === 'string' && v.includes('••••')) continue; // valore mascherato, tieni vecchio
      merged[k] = v;
    }

    const hasToken = merged.token || merged.key || merged.accessToken;

    await pool.query(
      `INSERT INTO api_keys (user_id, platform, key_data, connected, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, platform)
       DO UPDATE SET key_data=$3, connected=$4, updated_at=NOW()`,
      [req.user.id, platform, JSON.stringify(merged), !!hasToken]
    );
    res.json({ ok: true, platform, connected: !!hasToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore salvataggio credenziali' });
  }
});

// GET /api/apikeys/:platform/raw — credenziali complete (solo lato server, uso interno)
// Usata dal server per fare chiamate API per conto dell'utente
router.get('/:platform/raw', auth, async (req, res) => {
  const { platform } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT key_data FROM api_keys WHERE user_id=$1 AND platform=$2',
      [req.user.id, platform]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Nessuna credenziale trovata' });
    res.json(rows[0].key_data);
  } catch (err) {
    res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE /api/apikeys/:platform
router.delete('/:platform', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM api_keys WHERE user_id=$1 AND platform=$2',
      [req.user.id, req.params.platform]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Errore eliminazione' });
  }
});

module.exports = router;
