const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

// ---- Database connection (external Postgres, survives restarts) ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount DOUBLE PRECISION NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id)');
}

const app = express();
app.set('trust proxy', 1); // needed behind Render's proxy
app.use(express.json({ limit: '6mb' }));

// Sessions are stored in the database too, so users stay logged in
app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// Protect the tracker page (must come BEFORE express.static)
app.get(['/', '/index.html'], (req, res) => {
  if (!req.session.userId) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static('public'));

// ---- Auth routes ----
app.post('/api/register', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, hash]
    );
    const userId = result.rows[0].id;

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.userId = userId;
      req.session.username = username;
      res.json({ success: true, username });
    });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ success: true, username: user.username });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// ---- Expense routes (scoped to the logged-in user) ----
app.post('/api/expenses', requireAuth, async (req, res) => {
  const { amount, category, description, date } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Amount, category, and date are required' });
  }
  try {
    await pool.query(
      'INSERT INTO expenses (user_id, amount, category, description, date) VALUES ($1, $2, $3, $4, $5)',
      [req.session.userId, amount, category, description || '', date]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, amount, category, description, date FROM expenses WHERE user_id = $1 ORDER BY date DESC, id DESC',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, req.session.userId]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/summary/daily', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT date, SUM(amount) AS total FROM expenses WHERE user_id = $1 GROUP BY date ORDER BY date ASC',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/summary/category', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT category, SUM(amount) AS total FROM expenses WHERE user_id = $1 GROUP BY category',
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Start ----
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    // =====================================================================
//  WHAT TO DO IN server.js  (three small edits)
// =====================================================================
//
//  EDIT 1 - Make this the VERY FIRST LINE of server.js:
//
//      require('dotenv').config();
//
//  EDIT 2 - Find the line  app.use(express.json());
//           and change it to:
//
//      app.use(express.json({ limit: '6mb' }));
//
//  EDIT 3 - Copy everything BELOW this comment block and paste it
//           just ABOVE the line that starts with  app.listen(
//
//  Notes:
//   - Needs Node 18+ (it uses the built-in fetch). Check with: node -v
//   - The key lives in .env as GEMINI_API_KEY (never put it in app.js)
// =====================================================================


// ---------------- PASTE FROM HERE ----------------

const ALLOWED_CATEGORIES = ['Food', 'Travel', 'Bills', 'Entertainment', 'Shopping', 'Health', 'Other'];

// Only logged-in users may use the scanner (protects your free AI quota).
// A logged-out visitor's session holds nothing except the cookie settings.
function requireLoginForScan(req, res, next) {
  const loggedIn = req.session && Object.keys(req.session).some(k => k !== 'cookie');
  if (loggedIn) return next();
  res.status(401).json({ error: 'Not logged in' });
}

app.post('/api/scan-receipt', requireLoginForScan, async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image received' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Scanner is not configured' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const prompt = `You read photos of receipts, bills and payment screenshots.
Return ONLY a JSON object with these keys:
- "amount": number, the final amount the customer paid or must pay (net/total due, after discounts). Use 0 if nothing is payable. No currency symbol.
- "date": string "YYYY-MM-DD", the date of purchase or payment (not the due date). Dates on Indian receipts are day-first. Use null if not visible.
- "category": exactly one of ${JSON.stringify(ALLOWED_CATEGORIES)}.
- "description": short shop or biller name, max 40 characters.
If the image is not a receipt, return {"amount": null, "date": null, "category": "Other", "description": ""}.`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
            ]
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 }
        })
      }
    );

    if (!r.ok) {
      console.error('Gemini error', r.status, await r.text());
      return res.status(502).json({ error: 'AI service error' });
    }

    const out = await r.json();
    const text = out?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.status(502).json({ error: 'Could not understand AI reply' });
    }

    // Never trust the AI blindly: validate everything before sending it on
    const amount = Number(parsed.amount);
    res.json({
      amount: Number.isFinite(amount) && amount > 0 && amount < 10000000
        ? Math.round(amount * 100) / 100 : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') && !isNaN(Date.parse(parsed.date))
        ? parsed.date : null,
      category: ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
      description: String(parsed.description || '').slice(0, 40)
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// ---------------- PASTE UNTIL HERE ----------------
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Database setup failed:', err);
    process.exit(1);
  });