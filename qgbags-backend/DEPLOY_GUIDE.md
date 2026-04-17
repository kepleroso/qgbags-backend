# 🚀 QGbags Backend — Guida Completa al Deploy su Railway

## Cos'è stato creato

```
qgbags-backend/
├── src/
│   ├── server.js          ← Server principale Express
│   ├── api-client.js      ← Script da aggiungere all'HTML (sostituisce localStorage)
│   ├── middleware/
│   │   └── auth.js        ← Verifica token JWT
│   ├── db/
│   │   ├── pool.js        ← Connessione PostgreSQL
│   │   └── init.js        ← Crea tutte le tabelle
│   └── routes/
│       ├── auth.js        ← Login / info utente
│       ├── posts.js       ← CRUD post
│       ├── media.js       ← Upload immagini/video
│       ├── apikeys.js     ← Credenziali social (FB, IG, TT, Canva, Google Ads)
│       ├── leads.js       ← Prospect / CRM
│       └── analytics.js   ← Metriche post
├── package.json
├── railway.json
├── .env.example
└── .gitignore
```

---

## STEP 1 — Prepara il progetto in locale

### 1a. Installa Node.js (se non ce l'hai)
Scarica da: https://nodejs.org (versione 18 o superiore)

### 1b. Crea il file .env
```bash
# Nella cartella qgbags-backend, copia il file example:
cp .env.example .env
```
Apri `.env` e modifica:
```
JWT_SECRET=metti-una-stringa-casuale-qui-lunga-almeno-32-caratteri
INITIAL_USERS=admin@qgbags.com:latuapassword,team@qgbags.com:altrapassword
```

---

## STEP 2 — Deploy su Railway (GRATUITO per iniziare)

### 2a. Crea account Railway
Vai su https://railway.app e registrati (puoi usare GitHub)

### 2b. Installa Railway CLI (opzionale ma comodo)
```bash
npm install -g @railway/cli
railway login
```

### 2c. Crea il progetto su Railway
1. Vai su https://railway.app/new
2. Clicca **"Deploy from GitHub repo"** (o "Empty project" se non usi GitHub)
3. Dai un nome al progetto: `qgbags-backend`

### 2d. Aggiungi il Database PostgreSQL
1. Nel progetto Railway, clicca **"+ New"**
2. Seleziona **"Database" → "PostgreSQL"**
3. Railway crea automaticamente il database e la variabile `DATABASE_URL`

### 2e. Configura le variabili d'ambiente
Nel pannello del tuo servizio Node.js su Railway:
1. Clicca sulla tab **"Variables"**
2. Aggiungi queste variabili:

| Variabile | Valore |
|-----------|--------|
| `DATABASE_URL` | (auto, già impostata da Railway) |
| `JWT_SECRET` | `una-stringa-casuale-lunga-32+caratteri` |
| `NODE_ENV` | `production` |
| `INITIAL_USERS` | `admin@qgbags.com:password123` |
| `MAX_FILE_SIZE_MB` | `50` |

### 2f. Deploy del codice

**Opzione A — Con GitHub (consigliata):**
```bash
# Crea un repository GitHub privato e carica il codice
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TUO-UTENTE/qgbags-backend.git
git push -u origin main
# Poi su Railway, collega il repository GitHub
```

**Opzione B — Con Railway CLI:**
```bash
cd qgbags-backend
railway link    # collega al progetto Railway
railway up      # deploya il codice
```

---

## STEP 3 — Inizializza il Database

Dopo il primo deploy, esegui una volta il comando di inizializzazione:

**Opzione A — Via Railway CLI:**
```bash
railway run node src/db/init.js
```

**Opzione B — Via Railway Dashboard:**
1. Vai nel tuo servizio su Railway
2. Clicca **"Settings" → "Deploy"**
3. Aggiungi temporaneamente come start command: `node src/db/init.js`
4. Fallo girare una volta, poi riportalo a `npm start`

Quando il database è inizializzato, vedrai nel log:
```
✅ Tabella users
✅ Tabella api_keys
✅ Tabella media
✅ Tabella posts
...
🎉 Schema database creato con successo!
👤 Utente creato: admin@qgbags.com
```

---

## STEP 4 — Collega il frontend (HTML)

### 4a. Trova il tuo URL Railway
Dopo il deploy, Railway ti dà un URL tipo:
```
https://qgbags-backend-production.up.railway.app
```

### 4b. Modifica il file HTML
Apri `qgbags-complete.html` e cerca questa riga vicino alla fine, prima di `</body>`:
```html
</script>
</body>
```

Aggiungi **prima** del tag `</body>` finale questi due script:
```html
<!-- Configura l'URL del tuo backend Railway -->
<script>
  window.QGBAGS_API_URL = 'https://qgbags-backend-production.up.railway.app';
  // ↑ SOSTITUISCI con il tuo URL reale Railway
</script>

<!-- Layer API — sostituisce localStorage con il database -->
<script src="https://raw.githubusercontent.com/.../api-client.js"></script>
<!-- OPPURE copia il contenuto di api-client.js direttamente qui come tag <script> -->
```

**Metodo più semplice:** copia tutto il contenuto del file `api-client.js` e incollalo
dentro un tag `<script>` alla fine dell'HTML, subito prima di `</body>`.

### 4c. Ospita l'HTML
L'HTML può essere ospitato ovunque:
- **Railway**: nella stessa app (aggiungi una cartella `public/` con l'HTML)
- **Netlify**: gratis, trascina il file su https://netlify.com/drop
- **Vercel**: gratis, https://vercel.com
- **GitHub Pages**: gratis, repository pubblico

---

## STEP 5 — Test finale

### Verifica che il server funzioni:
```
GET https://TUO-URL.railway.app/health
```
Risposta attesa:
```json
{ "status": "ok", "service": "QGbags Backend", "version": "1.0.0" }
```

### Test login:
```bash
curl -X POST https://TUO-URL.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@qgbags.com","password":"password123"}'
```
Risposta attesa:
```json
{ "token": "eyJ...", "user": { "id": 1, "email": "admin@qgbags.com" } }
```

---

## 📊 Schema Database (riepilogo tabelle)

| Tabella | Cosa contiene |
|---------|--------------|
| `users` | Account team (email, password hash, ruolo) |
| `api_keys` | Credenziali social (FB token, IG token, ecc.) |
| `media` | File caricati (immagini e video) |
| `posts` | Tutti i post (bozze, programmati, pubblicati) |
| `post_analytics` | Metriche (reach, like, commenti, ecc.) |
| `leads` | Prospect/CRM con stati pipeline |
| `email_campaigns` | Campagne email |
| `gads_campaigns` | Campagne Google Ads |
| `seo_searches` | Ricerche SEO salvate |
| `ai_conversations` | Storico chat AI Strategist |

---

## 🔑 API Endpoints

### Auth
```
POST   /api/auth/login           → Login (ritorna token JWT)
GET    /api/auth/me              → Info utente corrente
POST   /api/auth/change-password → Cambia password
```

### Post
```
GET    /api/posts                → Lista post
POST   /api/posts                → Crea post
PATCH  /api/posts/:id            → Aggiorna post
DELETE /api/posts/:id            → Elimina post
GET    /api/posts/calendar/:y/:m → Post del mese (calendario)
```

### Media
```
GET    /api/media                → Lista media
POST   /api/media/upload         → Carica file
DELETE /api/media/:id            → Elimina media
```

### API Keys
```
GET    /api/apikeys              → Tutte le credenziali (mascherate)
PUT    /api/apikeys/:platform    → Salva credenziali piattaforma
DELETE /api/apikeys/:platform    → Rimuovi credenziali
```

### Leads
```
GET    /api/leads                → Lista prospect
POST   /api/leads                → Crea prospect
PATCH  /api/leads/:id            → Aggiorna prospect
DELETE /api/leads/:id            → Elimina prospect
POST   /api/leads/import         → Importa lista prospect
```

### Analytics
```
GET    /api/analytics            → Metriche per post
GET    /api/analytics/summary    → Totali per dashboard
POST   /api/analytics/:postId    → Salva metriche post
```

---

## 💰 Costi stimati (Railway)

- **Piano Hobby** (gratuito): $5 di crediti al mese
  - Sufficiente per uso leggero (team 2-5 persone)
  - PostgreSQL incluso fino a 1GB
  
- **Piano Pro**: $20/mese
  - Per uso intensivo, file upload pesanti, più utenti

---

## 🆘 Problemi comuni

**"Cannot connect to database"**
→ Controlla che `DATABASE_URL` sia impostata nelle variabili Railway

**"Token non valido"**
→ Controlla che `JWT_SECRET` sia la stessa variabile tra deploy

**"CORS error"**
→ In `server.js` imposta `origin: 'https://tuodominio.com'` invece di `'*'`

**Upload file non funziona**
→ Su Railway il filesystem è temporaneo. Per produzione seria, usa Cloudflare R2 o AWS S3.
   (Contattami e aggiungiamo l'integrazione cloud storage!)
