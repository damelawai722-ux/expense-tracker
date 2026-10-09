const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

// ---- Database setup: users table + link expenses to users ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
try {
  db.exec('ALTER TABLE expenses ADD COLUMN user_id INTEGER');
} catch (e) {
  // column already exists - fine
}

const app = express();
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ---- Auth middleware ----
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// ---- Protect the tracker page (must come BEFORE express.static) ----
app.get(['/', '/index.html'], (req, res) => {
  if (!req.session.userId) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static('public'));

// ---- Auth routes ----
app.post('/api/register', (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const isFirstUser = db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0;
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  const userId = Number(result.lastInsertRowid);

  // The first account inherits expenses saved before login existed
  if (isFirstUser) {
    db.prepare('UPDATE expenses SET user_id = ? WHERE user_id IS NULL').run(userId);
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.userId = userId;
    req.session.username = username;
    res.json({ success: true, username });
  });
});

app.post('/api/login', (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  });
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

// ---- Expense routes (all scoped to the logged-in user) ----
app.post('/api/expenses', requireAuth, (req, res) => {
  const { amount, category, description, date } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Amount, category, and date are required' });
  }
  db.prepare('INSERT INTO expenses (amount, category, description, date, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(amount, category, description || '', date, req.session.userId);
  res.json({ success: true });
});

app.get('/api/expenses', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC').all(req.session.userId);
  res.json(rows);
});

app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ success: true });
});

// Daily totals for the bar chart
app.get('/api/summary/daily', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT date, SUM(amount) as total
    FROM expenses
    WHERE user_id = ?
    GROUP BY date
    ORDER BY date ASC
  `).all(req.session.userId);
  res.json(rows);
});

// Category totals for the pie chart
app.get('/api/summary/category', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE user_id = ?
    GROUP BY category
  `).all(req.session.userId);
  res.json(rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});