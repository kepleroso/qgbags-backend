// ============================================
// QGbags Backend — Server principale
// ============================================
require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const rateLimit   = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*', // In produzione sostituisci con il tuo dominio: 'https://qgbags.com'
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 200,
  message: { error: 'Troppe richieste, riprova tra poco.' }
});
app.use('/api/', limiter);

// ── File statici — uploads ─────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Routes API ────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/posts',     require('./routes/posts'));
app.use('/api/media',     require('./routes/media'));
app.use('/api/apikeys',   require('./routes/apikeys'));
app.use('/api/leads',     require('./routes/leads'));
app.use('/api/analytics', require('./routes/analytics'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'QGbags Backend',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} non trovata` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Errore server:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║       QGbags Backend — AVVIATO        ║
║  Porta: ${PORT}                           ║
║  DB:    ${process.env.DATABASE_URL ? '✅ Configurato' : '❌ DATABASE_URL mancante'}         ║
╚═══════════════════════════════════════╝

📍 API disponibili su http://localhost:${PORT}/api/
🔑 Health check: http://localhost:${PORT}/health
  `);
});

module.exports = app;
