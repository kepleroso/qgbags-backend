// ============================================================
//  QGbags — Railway Backend v4  (server.js)
//  Token persistenti su Postgres — sopravvive ai redeploy
//  + Google Ads API Proxy
//  + Meta Ads manual token support
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
  res.json({ status: 'ok', service: 'QGbags Meta + Google Ads Proxy', version: '4.1' });
});

// ── STEP 1: Avvia OAuth ───────────────────────────────────────
app.get('/auth/meta/start', (req, res) => {
  if (!META_APP_ID) return res.status(500).send('META_APP_ID non configurato nelle env vars di Railway');
  const scopes = ['pages_show_list', 'pages_read_engagement', 'public_profile', 'ads_management', 'ads_read', 'business_management'].join(',');
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
    const tokenRes  = await fetch(`${GRAPH}/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${META_APP_SECRET}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    let userToken = tokenData.access_token;

    const llRes  = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${userToken}`);
    const llData = await llRes.json();
    if (llData.access_token) userToken = llData.access_token;

    const meRes  = await fetch(`${GRAPH}/me?fields=name,id&access_token=${userToken}`);
    const meData = await meRes.json();

    const pagesRes  = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(pagesData.error.message);

    const pages = (pagesData.data || []).map(p => ({
      id:           p.id,
      name:         p.name,
      access_token: p.access_token,
      instagram_business_account: p.instagram_business_account
    }));

    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    await saveSession(sessionId, {
      userToken, userName: meData.name || '', userId: meData.id || '', pages
    });

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

// ── Proxy generico Meta ───────────────────────────────────────
// Supporta sia sessionId (OAuth) che token manuale (Graph API Explorer)
app.post('/api/meta', async (req, res) => {
  const { sessionId, token: manualToken, endpoint, method = 'GET', params = {}, body: bodyData } = req.body;

  let token;

  if (sessionId) {
    // Percorso OAuth: recupera token da Postgres
    const session = await getSession(sessionId);
    if (!session) return res.status(401).json({ error: 'Sessione non trovata o scaduta. Effettua il login Meta.' });
    token = session.selectedPageToken || session.userToken;
  } else if (manualToken) {
    // Percorso token manuale (es. da Graph API Explorer)
    token = manualToken;
  } else {
    return res.status(401).json({ error: 'Autenticazione mancante: fornisci sessionId oppure token.' });
  }

  if (!endpoint) return res.status(400).json({ error: 'endpoint mancante' });

  try {
    let url  = `${GRAPH}/${endpoint}`;
    let opts = { method, headers: { 'Content-Type': 'application/json' } };

    if (method === 'GET' || method === 'DELETE') {
      url += '?' + new URLSearchParams({ ...params, access_token: token }).toString();
    } else {
      url += '?' + new URLSearchParams({ access_token: token }).toString();
      opts.body = JSON.stringify({ ...bodyData });
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

// ============================================================
//  GOOGLE ADS API PROXY
// ============================================================

app.post('/api/gads/token', async (req, res) => {
  const { clientId, clientSecret, refreshToken } = req.body;
  const cId     = clientId     || process.env.GADS_CLIENT_ID;
  const cSecret = clientSecret || process.env.GADS_CLIENT_SECRET;
  const rToken  = refreshToken || process.env.GADS_REFRESH_TOKEN;

  if (!cId || !cSecret || !rToken) {
    return res.status(400).json({ error: 'Credenziali Google OAuth mancanti (clientId, clientSecret, refreshToken)' });
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     cId,
        client_secret: cSecret,
        refresh_token: rToken,
        grant_type:    'refresh_token'
      }).toString()
    });
    const data = await r.json();
    if (data.error) return res.status(401).json({ error: data.error_description || data.error });
    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gads/proxy', async (req, res) => {
  const {
    accessToken, devToken, customerId, loginCustomerId,
    path, method = 'POST', body: bodyData
  } = req.body;

  const token  = accessToken || process.env.GADS_ACCESS_TOKEN;
  const dToken = devToken    || process.env.GADS_DEV_TOKEN;
  const custId = customerId  || process.env.GADS_CUSTOMER_ID;

  if (!token)  return res.status(401).json({ error: 'accessToken mancante' });
  if (!dToken) return res.status(400).json({ error: 'devToken mancante' });
  if (!custId) return res.status(400).json({ error: 'customerId mancante' });
  if (!path)   return res.status(400).json({ error: 'path mancante (es: customers/ID/campaigns:mutate)' });

  const url = `https://googleads.googleapis.com/v18/${path}`;
  const headers = {
    'Authorization':   `Bearer ${token}`,
    'developer-token': dToken,
    'Content-Type':    'application/json'
  };
  if (loginCustomerId || custId) headers['login-customer-id'] = loginCustomerId || custId;

  try {
    const apiRes = await fetch(url, { method, headers, body: bodyData ? JSON.stringify(bodyData) : undefined });
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gads/accounts', async (req, res) => {
  const { accessToken, devToken } = req.body;
  const token  = accessToken || process.env.GADS_ACCESS_TOKEN;
  const dToken = devToken    || process.env.GADS_DEV_TOKEN;

  if (!token || !dToken) return res.status(400).json({ error: 'accessToken e devToken richiesti' });

  try {
    const r = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
      headers: { 'Authorization': `Bearer ${token}`, 'developer-token': dToken }
    });
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

app.listen(PORT, () => console.log(`QGbags Meta + Google Ads Backend v4.1 running on port ${PORT}`));
