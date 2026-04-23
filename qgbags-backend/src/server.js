// ============================================================
//  QGbags — Railway Backend v3  (server.js)
//  Token persistenti su Postgres — sopravvive ai redeploy
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

const META_APP_ID     = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const RAILWAY_URL     = process.env.RAILWAY_URL || 'https://qgbags-backend-production.up.railway.app';
const REDIRECT_URI    = RAILWAY_URL + '/auth/facebook/callback';
const GRAPH           = 'https://graph.facebook.com/v19.0';
const fetch           = globalThis.fetch;

// ── Postgres ─────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Crea tabella sessioni se non esiste
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meta_sessions (
      session_id   TEXT PRIMARY KEY,
      user_token   TEXT,
      user_name    TEXT,
      user_id      TEXT,
      pages        JSONB,
      selected_page_id    TEXT,
      selected_page_token TEXT,
      selected_page_name  TEXT,
      selected_ig_id      TEXT,
      created_at   BIGINT,
      updated_at   BIGINT
    )
  `);
}
initDb().catch(console.error);

// Helpers DB
async function saveSession(sessionId, data) {
  await pool.query(`
    INSERT INTO meta_sessions (session_id, user_token, user_name, user_id, pages, selected_page_id, selected_page_token, selected_page_name, selected_ig_id, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    ON CONFLICT (session_id) DO UPDATE SET
      user_token=EXCLUDED.user_token, user_name=EXCLUDED.user_name,
      pages=EXCLUDED.pages, selected_page_id=EXCLUDED.selected_page_id,
      selected_page_token=EXCLUDED.selected_page_token,
      selected_page_name=EXCLUDED.selected_page_name,
      selected_ig_id=EXCLUDED.selected_ig_id,
      updated_at=EXCLUDED.updated_at
  `, [
    sessionId, data.userToken, data.userName, data.userId,
    JSON.stringify(data.pages || []),
    data.selectedPageId || null, data.selectedPageToken || null,
    data.selectedPageName || null, data.selectedIgId || null,
    Date.now()
  ]);
}

async function getSession(sessionId) {
  const r = await pool.query('SELECT * FROM meta_sessions WHERE session_id=$1', [sessionId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    userToken:          row.user_token,
    userName:           row.user_name,
    userId:             row.user_id,
    pages:              row.pages || [],
    selectedPageId:     row.selected_page_id,
    selectedPageToken:  row.selected_page_token,
    selectedPageName:   row.selected_page_name,
    selectedIgId:       row.selected_ig_id,
    created:            row.created_at
  };
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'QGbags Meta Proxy', version: '3.0' });
});

// ── STEP 1: Avvia OAuth ───────────────────────────────────────
app.get('/auth/meta/start', (req, res) => {
  if (!META_APP_ID) return res.status(500).send('META_APP_ID non configurato nelle env vars di Railway');
  const scopes = ['pages_show_list', 'pages_read_engagement', 'public_profile'].join(',');
  const state  = 'qgbags_' + Math.random().toString(36).slice(2);
  const url = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}&response_type=code`;
  res.redirect(url);
});

// ── STEP 2: Callback OAuth ────────────────────────────────────
app.get('/auth/facebook/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) return res.send(closingPage(`Errore Meta: ${error_description || error}`));
  if (!code)  return res.send(closingPage('Nessun codice ricevuto da Meta.'));

  try {
    // Scambia code per short-lived token
    const tokenRes  = await fetch(`${GRAPH}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${META_APP_SECRET}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    let userToken = tokenData.access_token;

    // Estendi a long-lived token
    const llRes  = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${userToken}`);
    const llData = await llRes.json();
    if (llData.access_token) userToken = llData.access_token;

    // Info utente
    const meRes  = await fetch(`${GRAPH}/me?fields=name,id&access_token=${userToken}`);
    const meData = await meRes.json();

    // Lista pagine con token
    const pagesRes  = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(pagesData.error.message);

    const pages = (pagesData.data || []).map(p => ({
      id:           p.id,
      name:         p.name,
      access_token: p.access_token,
      instagram_business_account: p.instagram_business_account
    }));

    // Salva su Postgres
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    await saveSession(sessionId, {
      userToken, userName: meData.name || '', userId: meData.id || '', pages
    });

    // Payload sicuro al frontend (senza token)
    const safePayload = JSON.stringify({
      sessionId,
      userName: meData.name || '',
      pages: pages.map(p => ({
        id:   p.id,
        name: p.name,
        igId: p.instagram_business_account ? p.instagram_business_account.id : null
      }))
    });

    res.send(closingPage(null, safePayload));
  } catch (err) {
    console.error('Meta callback error:', err);
    res.send(closingPage('Errore durante l\'autenticazione: ' + err.message));
  }
});

// ── STEP 3: Seleziona pagina ──────────────────────────────────
app.post('/auth/meta/select-page', async (req, res) => {
  const { sessionId, pageId } = req.body;
  const session = await getSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Sessione non trovata o scaduta' });

  const page = session.pages.find(p => p.id === pageId);
  if (!page) return res.status(404).json({ error: 'Pagina non trovata' });

  session.selectedPageId    = page.id;
  session.selectedPageToken = page.access_token;
  session.selectedPageName  = page.name;
  session.selectedIgId      = page.instagram_business_account ? page.instagram_business_account.id : null;

  await saveSession(sessionId, session);

  res.json({ ok: true, pageName: page.name, pageId: page.id, igId: session.selectedIgId });
});

// ── Proxy generico ────────────────────────────────────────────
app.post('/api/meta', async (req, res) => {
  const { sessionId, endpoint, method = 'GET', params = {}, body: bodyData } = req.body;
  const session = await getSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Sessione non trovata o scaduta. Effettua il login Meta.' });

  const token = session.selectedPageToken || session.userToken;

  try {
    let url  = `${GRAPH}/${endpoint}`;
    let opts = { method, headers: { 'Content-Type': 'application/json' } };

    if (method === 'GET' || method === 'DELETE') {
      url += '?' + new URLSearchParams({ ...params, access_token: token }).toString();
    } else {
      opts.body = JSON.stringify({ ...bodyData, access_token: token });
    }

    const apiRes  = await fetch(url, opts);
    const apiData = await apiRes.json();
    res.json(apiData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy endpoint ───────────────────────────────────────────
app.post('/auth/facebook/token', async (req, res) => {
  const { code, appId, appSecret, redirectUri } = req.body;
  try {
    const r = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId||META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri||REDIRECT_URI)}&client_secret=${appSecret||META_APP_SECRET}&code=${code}`);
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper popup ──────────────────────────────────────────────
function closingPage(errorMsg, jsonPayload) {
  if (errorMsg) {
    return `<!DOCTYPE html><html><body><script>window.opener&&window.opener.postMessage({type:'META_AUTH_ERROR',error:${JSON.stringify(errorMsg)}},'*');setTimeout(()=>window.close(),2000);<\/script><p style="font-family:sans-serif;color:#e74c3c;padding:20px;">${errorMsg}</p></body></html>`;
  }
  return `<!DOCTYPE html><html><body><script>window.opener&&window.opener.postMessage({type:'META_AUTH_SUCCESS',data:${jsonPayload}},'*');setTimeout(()=>window.close(),1000);<\/script><p style="font-family:sans-serif;color:#2ecc71;padding:20px;">Connessione riuscita! Questa finestra si chiude automaticamente.</p></body></html>`;
}

app.listen(PORT, () => console.log(`QGbags Meta Backend v3 running on port ${PORT}`));
