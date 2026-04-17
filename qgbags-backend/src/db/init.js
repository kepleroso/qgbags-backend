// ============================================
// QGbags — Inizializzazione Database PostgreSQL
// ============================================
// Esegui con: node src/db/init.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

async function initDB() {
  console.log('🗄️  Inizializzazione database QGbags...\n');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── USERS ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        email       VARCHAR(255) UNIQUE NOT NULL,
        password    VARCHAR(255) NOT NULL,
        name        VARCHAR(255),
        role        VARCHAR(50) DEFAULT 'member',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        last_login  TIMESTAMPTZ
      )
    `);
    console.log('✅ Tabella users');

    // ── API KEYS (credenziali social platform) ────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        platform    VARCHAR(50) NOT NULL,
        key_data    JSONB NOT NULL DEFAULT '{}',
        connected   BOOLEAN DEFAULT FALSE,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, platform)
      )
    `);
    console.log('✅ Tabella api_keys');

    // ── MEDIA ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS media (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(500) NOT NULL,
        type        VARCHAR(20) NOT NULL CHECK(type IN ('image','video')),
        file_path   VARCHAR(1000),
        file_url    TEXT,
        mime_type   VARCHAR(100),
        size_bytes  BIGINT,
        width       INTEGER,
        height      INTEGER,
        duration_s  FLOAT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella media');

    // ── POSTS ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        caption       TEXT,
        platforms     TEXT[] NOT NULL DEFAULT '{}',
        media_ids     INTEGER[] DEFAULT '{}',
        status        VARCHAR(30) DEFAULT 'draft'
                        CHECK(status IN ('draft','scheduled','published','failed')),
        scheduled_at  TIMESTAMPTZ,
        published_at  TIMESTAMPTZ,
        platform_post_ids JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella posts');

    // ── ANALYTICS ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_analytics (
        id          SERIAL PRIMARY KEY,
        post_id     INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        platform    VARCHAR(50) NOT NULL,
        reach       INTEGER DEFAULT 0,
        likes       INTEGER DEFAULT 0,
        comments    INTEGER DEFAULT 0,
        shares      INTEGER DEFAULT 0,
        saves       INTEGER DEFAULT 0,
        clicks      INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        fetched_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella post_analytics');

    // ── LEADS / PROSPECTS ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        nome        VARCHAR(255),
        cognome     VARCHAR(255),
        email       VARCHAR(255),
        azienda     VARCHAR(255),
        score       INTEGER DEFAULT 0,
        status      VARCHAR(50) DEFAULT 'new'
                      CHECK(status IN ('new','contacted','qualified','converted','lost')),
        source      VARCHAR(100),
        notes       TEXT,
        tags        TEXT[] DEFAULT '{}',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella leads');

    // ── EMAIL CAMPAIGNS ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name          VARCHAR(500) NOT NULL,
        subject       VARCHAR(500),
        body_html     TEXT,
        body_text     TEXT,
        status        VARCHAR(30) DEFAULT 'draft'
                        CHECK(status IN ('draft','scheduled','sent','cancelled')),
        scheduled_at  TIMESTAMPTZ,
        sent_at       TIMESTAMPTZ,
        recipient_count INTEGER DEFAULT 0,
        open_count    INTEGER DEFAULT 0,
        click_count   INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella email_campaigns');

    // ── GOOGLE ADS CAMPAIGNS ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS gads_campaigns (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        campaign_name   VARCHAR(500),
        campaign_type   VARCHAR(100),
        budget_daily    FLOAT,
        bid_strategy    VARCHAR(100),
        status          VARCHAR(50) DEFAULT 'PAUSED',
        gads_resource   VARCHAR(500),
        keywords        TEXT[],
        neg_keywords    TEXT[],
        headlines       TEXT[],
        descriptions    TEXT[],
        final_url       TEXT,
        geo_targets     TEXT[],
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        launched_at     TIMESTAMPTZ
      )
    `);
    console.log('✅ Tabella gads_campaigns');

    // ── SEO SEARCHES ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS seo_searches (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        query       VARCHAR(500),
        results     JSONB DEFAULT '[]',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella seo_searches');

    // ── AI CONVERSATIONS ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        messages    JSONB DEFAULT '[]',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Tabella ai_conversations');

    // ── INDICI ────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at) WHERE status='scheduled'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_post ON post_analytics(post_id)`);
    console.log('✅ Indici creati');

    await client.query('COMMIT');
    console.log('\n🎉 Schema database creato con successo!\n');

    // ── UTENTI INIZIALI ────────────────────────────────────────────────────
    const initialUsers = (process.env.INITIAL_USERS || 'admin@qgbags.com:password123').split(',');
    for (const entry of initialUsers) {
      const [email, password] = entry.trim().split(':');
      if (!email || !password) continue;
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO users (email, password, name, role)
         VALUES ($1, $2, $3, 'admin')
         ON CONFLICT (email) DO NOTHING`,
        [email, hash, email.split('@')[0]]
      );
      console.log(`👤 Utente creato: ${email}`);
    }

    console.log('\n✅ Database pronto! Avvia il server con: npm start\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Errore:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDB();
