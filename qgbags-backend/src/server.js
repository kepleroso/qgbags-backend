// ============================================================
//  QGbags — Railway Backend  (server.js)
//  Node.js 18+  |  npm install express cors node-fetch dotenv
// ============================================================
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const fetch    = globalThis.fetch;

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Leggi le variabili d'ambiente ────────────────────────────
const META_APP_ID     = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const FRONTEND_URL    = process.env.FRONTEND_URL || 'https://qgbags.netlify.app'; // URL dove apri il file HTML
const RAILWAY_URL     = process.env.RAILWAY_URL  || 'https://qgbags-backend-production.up.railway.app';

const REDIRECT_URI    = RAILWAY_URL + '/auth/facebook/callback';
const GRAPH           = 'https://graph.facebook.com/v19.0';

// ── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));        // Il file HTML può girare ovunque
app.use(express.json());

// Memoria token in-process (in produzione usa Redis o DB)
let tokenStore = {};

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'QGbags Meta Proxy', version: '2.0' });
});

// ============================================================
//  STEP 1 — Avvia OAuth  →  GET /auth/meta/start
//  Il frontend apre questa URL in un popup
// ============================================================
app.get('/auth/meta/start', (req, res) => {
  if (!META_APP_ID) {
    return res.status(500).send('META_APP_ID non configurato nelle env vars di Railway');
  }

  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'public_profile'
  ].join(',');

  const state = 'qgbags_' + Math.random().toString(36).slice(2);
  tokenStore['pending_state_' + state] = { created: Date.now() };

  const url = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}` +
    `&response_type=code`;

  res.redirect(url);
});

// ============================================================
//  STEP 2 — Ricevi callback da Meta  →  GET /auth/facebook/callback
//  Meta reindirizza qui dopo il login dell'utente
// ============================================================
app.get('/auth/facebook/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.send(closingPage(`Errore Meta: ${error_description || error}`));
  }
  if (!code) {
    return res.send(closingPage('Nessun codice ricevuto da Meta.'));
  }

  try {
    // 1) Scambia il code per un short-lived user token
    const tokenRes  = await fetch(
      `${GRAPH}/oauth/access_token?` +
      `client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${META_APP_SECRET}` +
      `&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message);
    let userToken = tokenData.access_token;

    // 2) Estendi a long-lived token (scade in ~60 giorni)
    const llRes  = await fetch(
      `${GRAPH}/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}` +
      `&fb_exchange_token=${userToken}`
    );
    const llData = await llRes.json();
    if (llData.access_token) userToken = llData.access_token;

    // 3) Info utente
    const meRes  = await fetch(`${GRAPH}/me?fields=name,id&access_token=${userToken}`);
    const meData = await meRes.json();

    // 4) Lista pagine + account IG collegati
    const pagesRes  = await fetch(
      `${GRAPH}/me/accounts?` +
      `fields=id,name,access_token,instagram_business_account` +
      `&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(pagesData.error.message);

    // 5) Salva nel token store (lato server, il secret non esce mai)
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    tokenStore[sessionId] = {
      userToken,
      userName: meData.name || '',
      userId:   meData.id   || '',
      pages:    pagesData.data || [],
      created:  Date.now()
    };

    // 6) Chiudi il popup e invia i dati al frontend (senza token segreti)
    const safePayload = JSON.stringify({
      sessionId,
      userName: meData.name || '',
      pages: (pagesData.data || []).map(p => ({
        id:    p.id,
        name:  p.name,
        igId:  p.instagram_business_account ? p.instagram_business_account.id : null
      }))
    });

    res.send(closingPage(null, safePayload));

  } catch (err) {
    console.error('Meta callback error:', err);
    res.send(closingPage('Errore durante l\'autenticazione: ' + err.message));
  }
});

// ============================================================
//  STEP 3 — Seleziona pagina  →  POST /auth/meta/select-page
//  Il frontend chiama questo dopo che l'utente sceglie la pagina
// ============================================================
app.post('/auth/meta/select-page', (req, res) => {
  const { sessionId, pageId } = req.body;
  const session = tokenStore[sessionId];
  if (!session) return res.status(401).json({ error: 'Sessione non trovata o scaduta' });

  const page = session.pages.find(p => p.id === pageId);
  if (!page) return res.status(404).json({ error: 'Pagina non trovata in questa sessione' });

  // Salva la pagina attiva
  session.selectedPageId    = page.id;
  session.selectedPageToken = page.access_token;
  session.selectedPageName  = page.name;
  session.selectedIgId      = page.instagram_business_account
    ? page.instagram_business_account.id : null;

  tokenStore[sessionId] = session;

  res.json({
    ok: true,
    pageName: page.name,
    pageId:   page.id,
    igId:     session.selectedIgId
  });
});

// ============================================================
//  PROXY GENERICO  →  POST /api/meta
//  Il frontend chiama questo per TUTTE le operazioni Meta
//  Body: { sessionId, endpoint, method, params }
// ============================================================
app.post('/api/meta', async (req, res) => {
  const { sessionId, endpoint, method = 'GET', params = {}, body: bodyData } = req.body;
  const session = tokenStore[sessionId];
  if (!session) return res.status(401).json({ error: 'Sessione non trovata o scaduta. Effettua il login Meta.' });

  // Scegli il token giusto: page token se disponibile, altrimenti user token
  const token = session.selectedPageToken || session.userToken;

  try {
    let url  = `${GRAPH}/${endpoint}`;
    let opts = { method, headers: { 'Content-Type': 'application/json' } };

    if (method === 'GET' || method === 'DELETE') {
      const qs = new URLSearchParams({ ...params, access_token: token }).toString();
      url += '?' + qs;
    } else {
      opts.body = JSON.stringify({ ...bodyData, access_token: token });
    }

    const apiRes  = await fetch(url, opts);
    const apiData = await apiRes.json();
    res.json(apiData);

  } catch (err) {
    console.error('Meta proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  TOKEN REFRESH  →  POST /auth/meta/refresh
//  Chiama questo ogni ~50 giorni per rinnovare il token
// ============================================================
app.post('/auth/meta/refresh', async (req, res) => {
  const { sessionId } = req.body;
  const session = tokenStore[sessionId];
  if (!session) return res.status(401).json({ error: 'Sessione non trovata' });

  try {
    const llRes  = await fetch(
      `${GRAPH}/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}` +
      `&fb_exchange_token=${session.userToken}`
    );
    const llData = await llRes.json();
    if (llData.access_token) {
      session.userToken = llData.access_token;
      session.refreshed = Date.now();
      tokenStore[sessionId] = session;
      res.json({ ok: true, expiresIn: llData.expires_in });
    } else {
      res.status(400).json({ error: llData.error?.message || 'Refresh fallito' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  ENDPOINT LEGACY (compatibilità con versione precedente)
//  POST /auth/facebook/token
// ============================================================
app.post('/auth/facebook/token', async (req, res) => {
  const { code, appId, appSecret, redirectUri } = req.body;
  const id     = appId     || META_APP_ID;
  const secret = appSecret || META_APP_SECRET;
  const redir  = redirectUri || REDIRECT_URI;

  try {
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
      `client_id=${id}` +
      `&redirect_uri=${encodeURIComponent(redir)}` +
      `&client_secret=${secret}` +
      `&code=${code}`
    );
    const data = await tokenRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  HELPER — Pagina HTML che chiude il popup e invia dati
// ============================================================
function closingPage(errorMsg, jsonPayload) {
  if (errorMsg) {
    return `<!DOCTYPE html><html><head><title>Errore</title></head><body>
    <script>
      window.opener && window.opener.postMessage({type:'META_AUTH_ERROR',error:${JSON.stringify(errorMsg)}},'*');
      setTimeout(()=>window.close(),2000);
    </script>
    <p style="font-family:sans-serif;color:#e74c3c;padding:20px;">${errorMsg}</p>
    </body></html>`;
  }
  return `<!DOCTYPE html><html><head><title>Connesso</title></head><body>
  <script>
    window.opener && window.opener.postMessage({type:'META_AUTH_SUCCESS',data:${jsonPayload}},'*');
    setTimeout(()=>window.close(),1000);
  </script>
  <p style="font-family:sans-serif;color:#2ecc71;padding:20px;">Connessione riuscita! Questa finestra si chiude automaticamente.</p>
  </body></html>`;
}

// ── Pulizia sessioni vecchie (ogni ora) ──────────────────────
setInterval(() => {
  const now = Date.now();
  const expire = 60 * 24 * 60 * 60 * 1000; // 60 giorni
  Object.keys(tokenStore).forEach(k => {
    if (tokenStore[k].created && (now - tokenStore[k].created) > expire) {
      delete tokenStore[k];
    }
  });
}, 60 * 60 * 1000);

app.listen(PORT, () => console.log(`QGbags Meta Backend running on port ${PORT}`));
