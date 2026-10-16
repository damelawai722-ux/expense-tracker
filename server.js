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

  // OLD tables (one budget for all months). Kept only so existing data can be carried over.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_budgets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      monthly_limit NUMERIC(12,2) NOT NULL CHECK (monthly_limit > 0),
      UNIQUE (user_id, category)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      monthly_budget NUMERIC(12,2) CHECK (monthly_budget > 0)
    )
  `);

  // NEW tables: budgets per month.
  // A row for month "2026-10" applies to that month ONLY. A month with no row has no budget (0).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_budgets (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      PRIMARY KEY (user_id, month)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_budgets_monthly (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      monthly_limit NUMERIC(12,2) NOT NULL CHECK (monthly_limit >= 0),
      PRIMARY KEY (user_id, month, category)
    )
  `);

  // Old all-months budgets are copied to a "0000-00" row that no month uses (kept only as a backup).
  await pool.query(`
    INSERT INTO monthly_budgets (user_id, month, amount)
    SELECT user_id, '0000-00', monthly_budget FROM user_settings WHERE monthly_budget IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  await pool.query(`
    INSERT INTO category_budgets_monthly (user_id, month, category, monthly_limit)
    SELECT user_id, '0000-00', category, monthly_limit FROM category_budgets
    ON CONFLICT DO NOTHING
  `);
}

const ALLOWED_CATEGORIES = ['Food', 'Travel', 'Bills', 'Entertainment', 'Shopping', 'Health', 'Other'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---- Validation helpers (the server never trusts what the browser sends) ----
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d &&
         y >= 2000 && y <= 2100;
}

// Returns { value } with cleaned data, or { error } with a message for the user
function parseExpense(body) {
  const b = body || {};
  if (typeof b.amount !== 'number' && typeof b.amount !== 'string') {
    return { error: 'Amount is required' };
  }
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10000000) {
    return { error: 'Amount must be a positive number below 1,00,00,000' };
  }
  const category = String(b.category || '');
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { error: 'Unknown category' };
  }
  const date = String(b.date || '');
  if (!isValidDate(date)) {
    return { error: 'Date must be a real date (YYYY-MM-DD)' };
  }
  const description = String(b.description || '').trim().slice(0, 100);
  return { value: { amount: Math.round(amount * 100) / 100, category, date, description } };
}

// 0 is allowed (it means "no limit"); returns null when the value is not usable
function parseLimit(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 10000000) return null;
  return Math.round(n * 100) / 100;
}

function parseMonth(v) {
  const m = String(v || '');
  return MONTH_RE.test(m) ? m : null;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // needed behind Render's proxy
app.use(express.json({ limit: '6mb' }));

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set. Add it in Render > Environment.');
}

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
  const parsed = parseExpense(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { amount, category, description, date } = parsed.value;
  try {
    await pool.query(
      'INSERT INTO expenses (user_id, amount, category, description, date) VALUES ($1, $2, $3, $4, $5)',
      [req.session.userId, amount, category, description, date]
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

// Edit an expense (only the owner can change it)
app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = parseExpense(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { amount, category, description, date } = parsed.value;

  try {
    const result = await pool.query(
      'UPDATE expenses SET amount = $1, category = $2, description = $3, date = $4 WHERE id = $5 AND user_id = $6',
      [amount, category, description, date, id, req.session.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
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

// ---- Export to CSV (all expenses, or one month with ?month=YYYY-MM) ----
function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stops spreadsheet "formula injection"
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

app.get('/api/export.csv', requireAuth, async (req, res) => {
  const month = String(req.query.month || '');
  let sql = 'SELECT date, category, description, amount FROM expenses WHERE user_id = $1';
  const params = [req.session.userId];
  let label = 'all';

  if (month) {
    if (!MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'Invalid month' });
    }
    sql += ' AND date LIKE $2';
    params.push(month + '-%');
    label = month;
  }
  sql += ' ORDER BY date ASC, id ASC';

  try {
    const { rows } = await pool.query(sql, params);
    const lines = ['Date,Category,Note,Amount (INR)'];
    rows.forEach(r => {
      lines.push([r.date, r.category, r.description, Number(r.amount).toFixed(2)].map(csvCell).join(','));
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses-' + label + '.csv"');
    res.send('\uFEFF' + lines.join('\r\n')); // BOM so Excel reads the file as UTF-8
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Overall monthly budget, PER MONTH ----
// GET  /api/budget?month=YYYY-MM  -> { limit }  (that month's budget, or null if none was set)
// PUT  /api/budget                -> body { month, limit }  (limit 0 = no budget for that month)
app.get('/api/budget', requireAuth, async (req, res) => {
  const month = parseMonth(req.query.month);
  if (!month) return res.status(400).json({ error: 'Invalid month' });
  try {
    const { rows } = await pool.query(
      `SELECT amount FROM monthly_budgets
       WHERE user_id = $1 AND month = $2`,
      [req.session.userId, month]
    );
    const amount = rows[0] ? Number(rows[0].amount) : 0;
    res.json({ limit: amount > 0 ? amount : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/budget', requireAuth, async (req, res) => {
  const month = parseMonth(req.body && req.body.month);
  if (!month) return res.status(400).json({ error: 'Invalid month' });
  const limit = parseLimit(req.body && req.body.limit);
  if (limit === null) return res.status(400).json({ error: 'Budget must be a valid amount' });
  try {
    await pool.query(
      `INSERT INTO monthly_budgets (user_id, month, amount) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, month) DO UPDATE SET amount = EXCLUDED.amount`,
      [req.session.userId, month, limit]
    );
    res.json({ limit: limit > 0 ? limit : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Category budgets, PER MONTH ----
// Same rule: a limit belongs to one month only; categories not set for that month have no limit.
async function getCategoryBudgetMap(db, userId, month) {
  const { rows } = await db.query(
    `SELECT category, monthly_limit
     FROM category_budgets_monthly
     WHERE user_id = $1 AND month = $2`,
    [userId, month]
  );
  const out = {};
  rows.forEach(r => {
    const n = Number(r.monthly_limit);
    if (n > 0) out[r.category] = n;   // 0 means "no limit"
  });
  return out;
}

// Read the limits set for one month:  { "Food": 3000, "Bills": 2000 }
app.get('/api/category-budgets', requireAuth, async (req, res) => {
  const month = parseMonth(req.query.month);
  if (!month) return res.status(400).json({ error: 'Invalid month' });
  try {
    res.json(await getCategoryBudgetMap(pool, req.session.userId, month));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save several limits at once, all-or-nothing.
// Body: { month: "2026-10", budgets: { Food: 3000, Travel: 0 } }   (0 = no limit)
app.put('/api/category-budgets', requireAuth, async (req, res) => {
  const month = parseMonth(req.body && req.body.month);
  if (!month) return res.status(400).json({ error: 'Invalid month' });

  const incoming = req.body && req.body.budgets;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const entries = Object.entries(incoming);
  if (entries.length === 0 || entries.length > ALLOWED_CATEGORIES.length) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const clean = [];
  for (const [cat, v] of entries) {
    if (!ALLOWED_CATEGORIES.includes(cat)) return res.status(400).json({ error: 'Unknown category' });
    const limit = parseLimit(v);
    if (limit === null) return res.status(400).json({ error: 'Invalid amount for ' + cat });
    clean.push([cat, limit]);
  }

  const userId = req.session.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await getCategoryBudgetMap(client, userId, month);
    for (const [cat, limit] of clean) {
      // nothing to write when the value is unchanged
      if (limit === (current[cat] || 0)) continue;
      await client.query(
        `INSERT INTO category_budgets_monthly (user_id, month, category, monthly_limit) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, month, category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit`,
        [userId, month, cat, limit]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Budget save error:', e);
    client.release();
    return res.status(500).json({ error: 'Could not save budgets' });
  }
  client.release();

  try {
    res.json({ budgets: await getCategoryBudgetMap(pool, userId, month) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- AI receipt scanning (Gemini), with retries when the service is busy ----
const scanSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(models, body) {
  let lastFailure = null;
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify(body)
        }
      );
      if (r.ok) return r;

      const text = await r.text();
      lastFailure = { status: r.status, model };
      console.error('Gemini error', r.status, model, 'attempt', attempt, text.slice(0, 400));

      // Only temporary problems are worth retrying
      if (![429, 500, 503].includes(r.status)) break;
      if (attempt < 3) await scanSleep(attempt * 1500);
    }
  }
  const err = new Error('Gemini failed');
  err.lastFailure = lastFailure;
  throw err;
}

app.post('/api/scan-receipt', requireAuth, async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(image)) {
      return res.status(400).json({ error: 'No valid image received' });
    }
    if (image.length > 5500000) {
      return res.status(413).json({ error: 'Image is too large' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Scanner is not configured' });
    }

    const safeMime = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
    const models = [
      process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      process.env.GEMINI_FALLBACK_MODEL
    ].filter(Boolean);

    const prompt = `You read photos of receipts, bills and payment screenshots.
Return ONLY a JSON object with these keys:
- "amount": number, the final amount the customer paid or must pay (net/total due, after discounts). Use 0 if nothing is payable. No currency symbol.
- "date": string "YYYY-MM-DD", the date of purchase or payment (not the due date). Dates on Indian receipts are day-first. Use null if not visible.
- "category": exactly one of ${JSON.stringify(ALLOWED_CATEGORIES)}.
- "description": short shop or biller name, max 40 characters.
If the image is not a receipt, return {"amount": null, "date": null, "category": "Other", "description": ""}.`;

    let r;
    try {
      r = await callGemini(models, {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: safeMime, data: image } }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      });
    } catch (e) {
      return res.status(502).json({ error: 'AI service is busy, please try again' });
    }

    const out = await r.json();
    const text = out?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('Could not parse Gemini reply:', text.slice(0, 300));
      return res.status(502).json({ error: 'Could not understand AI reply' });
    }

    // Never trust the AI blindly: validate everything before sending it on
    const amount = Number(parsed.amount);
    res.json({
      amount: Number.isFinite(amount) && amount > 0 && amount < 10000000
        ? Math.round(amount * 100) / 100 : null,
      date: isValidDate(String(parsed.date || '')) ? parsed.date : null,
      category: ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
      description: String(parsed.description || '').slice(0, 40)
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// ---- Friendly JSON errors (too-large body, bad JSON, anything unexpected) ----
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// ---- Start ----
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Database setup failed:', err);
    process.exit(1);
  });