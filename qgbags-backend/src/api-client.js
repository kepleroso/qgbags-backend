// ============================================
// QGbags — API Client
// Sostituisce localStorage con chiamate al backend
// ============================================

// ── Configurazione ────────────────────────────────────────────────────────────
// Cambia questo URL con il tuo indirizzo Railway dopo il deploy
const API_BASE = window.QGBAGS_API_URL || 'https://TUO-PROGETTO.up.railway.app';

// ── Stato autenticazione ──────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('qgbags-token'),
  setToken: (t) => localStorage.setItem('qgbags-token', t),
  removeToken: () => localStorage.removeItem('qgbags-token'),
  isLoggedIn: () => !!localStorage.getItem('qgbags-token'),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('qgbags-user') || 'null'); } catch { return null; }
  },
  setUser: (u) => localStorage.setItem('qgbags-user', JSON.stringify(u)),
};

// ── Helper fetch con token ────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {})
    }
  });

  // Token scaduto → forza login
  if (res.status === 401) {
    Auth.removeToken();
    showLoginScreen();
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore server (' + res.status + ')');
  return data;
}

// ── LOGIN / LOGOUT ────────────────────────────────────────────────────────────
async function apiLogin(email, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (data) {
    Auth.setToken(data.token);
    Auth.setUser(data.user);
  }
  return data;
}

function apiLogout() {
  Auth.removeToken();
  Auth.setUser(null);
  showLoginScreen();
}

// ── POSTS ────────────────────────────────────────────────────────────────────
const PostsAPI = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/api/posts' + (q ? '?' + q : ''));
  },
  getCalendar: (year, month) =>
    apiFetch(`/api/posts/calendar/${year}/${month}`),
  create: (postData) =>
    apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(postData) }),
  update: (id, data) =>
    apiFetch(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) =>
    apiFetch(`/api/posts/${id}`, { method: 'DELETE' })
};

// ── MEDIA ─────────────────────────────────────────────────────────────────────
const MediaAPI = {
  getAll: (type) =>
    apiFetch('/api/media' + (type ? '?type=' + type : '')),
  upload: async (files) => {
    const token = Auth.getToken();
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch(API_BASE + '/api/media/upload', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: fd
    });
    if (res.status === 401) { Auth.removeToken(); showLoginScreen(); return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload fallito');
    return data;
  },
  delete: (id) =>
    apiFetch(`/api/media/${id}`, { method: 'DELETE' })
};

// ── API KEYS ──────────────────────────────────────────────────────────────────
const ApiKeysAPI = {
  getAll: () => apiFetch('/api/apikeys'),
  save: (platform, keyData) =>
    apiFetch(`/api/apikeys/${platform}`, { method: 'PUT', body: JSON.stringify(keyData) }),
  delete: (platform) =>
    apiFetch(`/api/apikeys/${platform}`, { method: 'DELETE' })
};

// ── LEADS ─────────────────────────────────────────────────────────────────────
const LeadsAPI = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/api/leads' + (q ? '?' + q : ''));
  },
  create: (lead) =>
    apiFetch('/api/leads', { method: 'POST', body: JSON.stringify(lead) }),
  update: (id, data) =>
    apiFetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) =>
    apiFetch(`/api/leads/${id}`, { method: 'DELETE' }),
  import: (leads) =>
    apiFetch('/api/leads/import', { method: 'POST', body: JSON.stringify({ leads }) })
};

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
const AnalyticsAPI = {
  getAll: () => apiFetch('/api/analytics'),
  getSummary: () => apiFetch('/api/analytics/summary'),
  saveMetrics: (postId, data) =>
    apiFetch(`/api/analytics/${postId}`, { method: 'POST', body: JSON.stringify(data) })
};

// ── LOGIN SCREEN ──────────────────────────────────────────────────────────────
function showLoginScreen() {
  // Se esiste già, mostralo
  let overlay = document.getElementById('login-overlay');
  if (overlay) { overlay.style.display = 'flex'; return; }

  overlay = document.createElement('div');
  overlay.id = 'login-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; font-family: 'DM Sans', sans-serif;
  `;
  overlay.innerHTML = `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:20px;
                padding:48px 40px; max-width:400px; width:90%; text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif; font-size:36px; letter-spacing:4px;
                  color:var(--accent); margin-bottom:4px;">QGBAGS</div>
      <div style="font-family:'Space Mono',monospace; font-size:10px; letter-spacing:3px;
                  color:var(--muted); margin-bottom:36px;">SOCIAL NETWORKS PROGRAM</div>

      <div id="login-error" style="display:none; background:rgba(231,76,60,0.1); border:1px solid
           rgba(231,76,60,0.3); border-radius:8px; padding:10px 14px; font-size:13px;
           color:var(--danger); margin-bottom:16px; text-align:left;"></div>

      <div style="text-align:left; margin-bottom:12px;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:6px; letter-spacing:1px;
                    text-transform:uppercase; font-family:'Space Mono',monospace;">Email</div>
        <input id="login-email" type="email" placeholder="admin@qgbags.com"
               style="width:100%; background:var(--surface2); border:1px solid var(--border);
                      border-radius:8px; color:var(--text); padding:12px 14px;
                      font-family:'DM Sans',sans-serif; font-size:14px; outline:none; box-sizing:border-box;"
               onfocus="this.style.borderColor='var(--accent)'"
               onblur="this.style.borderColor='var(--border)'"
               onkeydown="if(event.key==='Enter') doLogin()" />
      </div>

      <div style="text-align:left; margin-bottom:24px;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:6px; letter-spacing:1px;
                    text-transform:uppercase; font-family:'Space Mono',monospace;">Password</div>
        <input id="login-password" type="password" placeholder="••••••••"
               style="width:100%; background:var(--surface2); border:1px solid var(--border);
                      border-radius:8px; color:var(--text); padding:12px 14px;
                      font-family:'DM Sans',sans-serif; font-size:14px; outline:none; box-sizing:border-box;"
               onfocus="this.style.borderColor='var(--accent)'"
               onblur="this.style.borderColor='var(--border)'"
               onkeydown="if(event.key==='Enter') doLogin()" />
      </div>

      <button id="login-btn" onclick="doLogin()"
              style="width:100%; padding:14px; border-radius:10px; background:var(--accent);
                     border:none; color:#0a0a0f; font-family:'DM Sans',sans-serif; font-size:15px;
                     font-weight:700; cursor:pointer; transition:all 0.2s; letter-spacing:0.5px;"
              onmouseover="this.style.background='var(--accent2)'"
              onmouseout="this.style.background='var(--accent)'">
        ACCEDI →
      </button>

      <div style="margin-top:20px; font-size:11px; color:var(--muted); font-family:'Space Mono',monospace;">
        QGbags · Accesso riservato al team
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Prefill email se disponibile
  setTimeout(() => {
    const em = document.getElementById('login-email');
    if (em) em.focus();
  }, 100);
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  if (!email || !password) {
    errEl.textContent = 'Inserisci email e password.';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Accesso in corso...';
  btn.disabled    = true;
  errEl.style.display = 'none';

  try {
    await apiLogin(email, password);
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';
    // Carica i dati dal server
    await initAppData();
    showToast('👋 Benvenuto ' + (Auth.getUser()?.name || '') + '!');
  } catch (err) {
    errEl.textContent = err.message || 'Credenziali non valide.';
    errEl.style.display = 'block';
    btn.textContent = 'ACCEDI →';
    btn.disabled    = false;
  }
}

// ── INIZIALIZZAZIONE APP ──────────────────────────────────────────────────────
async function initAppData() {
  try {
    // Carica post dal server
    const posts = await PostsAPI.getAll({ limit: 200 });
    if (posts) {
      // Normalizza i dati dal server al formato atteso dall'app
      state.posts = posts.map(p => ({
        id:          p.id,
        caption:     p.caption || '',
        platforms:   p.platforms || [],
        media:       (p.media_ids || []).map(id => ({ id })),
        status:      p.status,
        scheduledAt: p.scheduled_at,
        publishedAt: p.published_at,
        createdAt:   p.created_at
      }));
    }

    // Carica media
    const media = await MediaAPI.getAll();
    if (media) {
      state.media = media.map(m => ({
        id:       m.id,
        name:     m.name,
        type:     m.type,
        src:      m.file_url,
        size:     m.size_bytes,
        date:     m.created_at,
        selected: false
      }));
    }

    // Carica API keys (valori mascherati, solo per mostrare stato connessione)
    const keys = await ApiKeysAPI.getAll();
    if (keys) {
      state.apiKeys = keys;
      // Aggiorna input nelle impostazioni con valori mascherati
      setTimeout(() => {
        if (keys.fb)    { const el = document.getElementById('fb-app-id');      if(el) el.placeholder = 'Configurato ✅'; }
        if (keys.ig)    { const el = document.getElementById('ig-account-id');  if(el) el.placeholder = 'Configurato ✅'; }
        if (keys.canva) { const el = document.getElementById('canva-client-id');if(el) el.placeholder = 'Configurato ✅'; }
      }, 200);
    }

    renderDashboard();
    renderCalendar();
    renderMediaGrid();
    renderQueue();
    updatePlatformStatus();

  } catch (err) {
    console.error('Errore caricamento dati:', err);
    showToast('⚠️ Errore caricamento dati: ' + err.message, 'warning');
  }
}

// ── OVERRIDE saveState ────────────────────────────────────────────────────────
// Questa funzione viene chiamata dall'app originale — ora non fa nulla
// perché ogni operazione salva direttamente via API
function saveState() {
  // Dati già persistiti nel database — nessuna azione necessaria
}

// ── OVERRIDE publishPost ──────────────────────────────────────────────────────
const _originalPublishPost = window.publishPost;
async function publishPost() {
  const caption = document.getElementById('caption-text').value;
  if (!caption.trim()) { showToast('⚠️ Scrivi una caption prima di pubblicare!', 'warning'); return; }
  if (state.selectedPlatforms.length === 0) { showToast('⚠️ Seleziona almeno una piattaforma!', 'warning'); return; }

  const scheduleTime = state.publishMode === 'schedule'
    ? document.getElementById('schedule-time').value : null;
  const isScheduled  = state.publishMode === 'schedule' && !!scheduleTime;

  const postData = {
    caption,
    platforms:    [...state.selectedPlatforms],
    media_ids:    state.selectedMedia.map(m => m.id),
    status:       isScheduled ? 'scheduled' : 'published',
    scheduled_at: isScheduled ? new Date(scheduleTime).toISOString() : null
  };

  try {
    const saved = await PostsAPI.create(postData);
    if (!saved) return;

    // Aggiungi allo state locale
    state.posts.push({
      id:          saved.id,
      caption:     saved.caption,
      platforms:   saved.platforms,
      media:       state.selectedMedia.map(m => ({ id: m.id, type: m.type, src: m.src?.substring(0, 100) })),
      status:      saved.status,
      scheduledAt: saved.scheduled_at,
      publishedAt: saved.published_at,
      createdAt:   saved.created_at
    });

    // Chiama le API social se "pubblica ora"
    if (!isScheduled) callPlatformAPIs(postData);

    showToast(isScheduled
      ? '📅 Post programmato per ' + new Date(scheduleTime).toLocaleString('it')
      : '🚀 Post inviato a ' + state.selectedPlatforms.join(', ') + '!'
    );

    // Reset form
    document.getElementById('caption-text').value = '';
    updateCharCount();
    state.selectedPlatforms = [];
    ['fb','ig','tt'].forEach(p => document.getElementById('btn-'+p).className = 'platform-btn');
    state.selectedMedia = [];
    state.media.forEach(m => m.selected = false);
    updateComposeMedia();
    renderDashboard();

  } catch (err) {
    showToast('❌ Errore pubblicazione: ' + err.message, 'warning');
  }
}

// ── OVERRIDE saveDraft ────────────────────────────────────────────────────────
async function saveDraft() {
  const caption = document.getElementById('caption-text').value;
  const postData = {
    caption: caption || '(bozza senza testo)',
    platforms:    [...state.selectedPlatforms],
    media_ids:    state.selectedMedia.map(m => m.id),
    status:       'draft'
  };
  try {
    const saved = await PostsAPI.create(postData);
    if (!saved) return;
    state.posts.push({
      id:        saved.id,
      caption:   saved.caption,
      platforms: saved.platforms,
      media:     [],
      status:    'draft',
      createdAt: saved.created_at
    });
    showToast('💾 Bozza salvata!');
    renderDashboard();
  } catch (err) {
    showToast('❌ Errore salvataggio bozza: ' + err.message, 'warning');
  }
}

// ── OVERRIDE deletePost ───────────────────────────────────────────────────────
async function deletePost(id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  const label = post.status === 'scheduled' ? 'post programmato' : 'post';
  if (!confirm('Vuoi eliminare questo ' + label + '?\n\n"' + (post.caption||'').slice(0,80) + '"')) return;

  try {
    await PostsAPI.delete(id);
    state.posts = state.posts.filter(p => p.id !== id);
    renderQueue(); renderCalendar(); renderDashboard();
    showToast('🗑️ Post eliminato.');
  } catch (err) {
    showToast('❌ Errore eliminazione: ' + err.message, 'warning');
  }
}

async function deletePostFromCalendar(id, dateStr) {
  await deletePost(id);
  showDayPosts(dateStr);
}

// ── OVERRIDE deleteMedia ──────────────────────────────────────────────────────
async function deleteMedia(id) {
  try {
    await MediaAPI.delete(id);
    state.media         = state.media.filter(m => m.id != id);
    state.selectedMedia = state.selectedMedia.filter(m => m.id != id);
    renderMediaGrid();
    updateComposeMedia();
    showToast('🗑️ Media eliminato.');
  } catch (err) {
    showToast('❌ Errore eliminazione media: ' + err.message, 'warning');
  }
}

// ── OVERRIDE handleFiles (upload → server) ────────────────────────────────────
async function handleFiles(files) {
  if (!files || files.length === 0) return;
  showToast('⏫ Upload in corso...');

  try {
    const uploaded = await MediaAPI.upload(Array.from(files));
    if (!uploaded) return;

    for (const m of uploaded) {
      state.media.push({
        id:       m.id,
        name:     m.name,
        type:     m.type,
        src:      m.file_url,
        size:     m.size_bytes,
        date:     m.created_at,
        selected: false
      });
      showToast('✅ ' + m.name + ' caricato!');
    }
    renderMediaGrid();
  } catch (err) {
    showToast('❌ Upload fallito: ' + err.message, 'warning');
  }
}

// ── OVERRIDE saveApiKey ───────────────────────────────────────────────────────
async function saveApiKey(platform) {
  let keyData = {};
  if (platform === 'fb') {
    keyData = {
      appId:  document.getElementById('fb-app-id').value,
      secret: document.getElementById('fb-app-secret').value,
      token:  document.getElementById('fb-token').value,
      pageId: document.getElementById('fb-page-id').value
    };
  } else if (platform === 'ig') {
    keyData = {
      accountId: document.getElementById('ig-account-id').value,
      token:     document.getElementById('ig-token').value
    };
  } else if (platform === 'tt') {
    keyData = {
      clientKey: document.getElementById('tt-client-key').value,
      secret:    document.getElementById('tt-client-secret').value,
      token:     document.getElementById('tt-token').value
    };
  } else if (platform === 'canva') {
    keyData = {
      key:      document.getElementById('canva-key').value,
      clientId: document.getElementById('canva-client-id').value
    };
  }

  try {
    await ApiKeysAPI.save(platform, keyData);
    state.apiKeys[platform] = keyData;
    showToast('✅ Configurazione ' + platform.toUpperCase() + ' salvata!');
    updatePlatformStatus();
  } catch (err) {
    showToast('❌ Errore salvataggio: ' + err.message, 'warning');
  }
}

// ── OVERRIDE confirmAddProspect ───────────────────────────────────────────────
async function confirmAddProspect() {
  const lead = {
    nome:    document.getElementById('mp-nome')?.value || '',
    cognome: document.getElementById('mp-cognome')?.value || '',
    email:   document.getElementById('mp-email')?.value || '',
    azienda: document.getElementById('mp-azienda')?.value || ''
  };
  if (!lead.email) { showToast('⚠️ Email obbligatoria', 'warning'); return; }

  try {
    const saved = await LeadsAPI.create(lead);
    if (saved) {
      showToast('✅ Prospect aggiunto!');
      document.getElementById('manual-prospect-modal').style.display = 'none';
      // Ricarica lista leads se visibile
      if (typeof renderLeads === 'function') renderLeads();
    }
  } catch (err) {
    showToast('❌ Errore: ' + err.message, 'warning');
  }
}

// ── AVVIO ─────────────────────────────────────────────────────────────────────
// Aggiunge pulsante logout alla topbar
function addLogoutBtn() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;
  const user = Auth.getUser();
  const div  = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:10px;';
  div.innerHTML = `
    <span style="font-size:12px;color:var(--muted);font-family:'Space Mono',monospace;">
      ${user?.email || ''}
    </span>
    <button onclick="apiLogout()"
      style="padding:6px 14px;border-radius:7px;border:1px solid var(--border);
             background:transparent;color:var(--muted);font-size:12px;cursor:pointer;
             font-family:'DM Sans',sans-serif;"
      onmouseover="this.style.color='var(--danger)';this.style.borderColor='rgba(231,76,60,0.4)'"
      onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border)'">
      Esci
    </button>
  `;
  actions.appendChild(div);
}

// Punto di ingresso
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!Auth.isLoggedIn()) {
      showLoginScreen();
    } else {
      addLogoutBtn();
      initAppData();
    }
  }, 50);
});
