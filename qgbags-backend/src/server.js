require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 200, message: { error: 'Troppe richieste.' } });
app.use('/api/', limiter);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api-client.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__dirname, 'api-client.js'));
});app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../qgbags-final.html'));
});

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/posts',     require('./routes/posts'));
app.use('/api/media',     require('./routes/media'));
app.use('/api/apikeys',   require('./routes/apikeys'));
app.use('/api/leads',     require('./routes/leads'));
app.use('/api/analytics', require('./routes/analytics'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'QGbags Backend', version: '1.0.0', time: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: 'Route non trovata' }));
app.use((err, req, res, next) => res.status(500).json({ error: 'Errore interno' }));

app.listen(PORT, () => console.log('QGbags Backend avviato sulla porta ' + PORT));
module.exports = app;
