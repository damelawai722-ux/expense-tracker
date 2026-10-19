// =====================================================================
//  ACCOUNT SECURITY
//   - verify an email address (6-digit code)
//   - "Forgot password": code sent to the VERIFIED email, then set a new password
//   - change password while logged in
// =====================================================================
const crypto = require('crypto');
const { sendMail, mailReady, codeEmail } = require('./mailer');

const CODE_MINUTES = 10;       // how long a code works
const MAX_ATTEMPTS = 5;        // wrong guesses allowed per code
const COOLDOWN_SECONDS = 60;   // minimum gap between two codes for the same account
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- helpers ----------
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Codes are never stored, only a keyed hash of them
function hashCode(purpose, userId, email, code) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret')
    .update([purpose, userId, email, code].join(':')).digest('hex');
}
function sameHash(a, b) {
  const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Small in-memory rate limiter: allow(key, max, windowMs)
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now(), b = buckets.get(key);
  if (!b || b.reset <= now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  if (b.n >= max) return false;
  b.n++;
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k); }, 3600 * 1000).unref();

async function initAuthDb(pool) {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE');
  // one verified email can belong to only one account
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_verified_uniq ON users (LOWER(email)) WHERE email_verified');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, purpose)
    )`);
}

function mountAuth(app, pool, requireAuth, bcrypt) {
  // Make a fresh code (null = asked too soon after the last one)
  async function issueCode(userId, purpose, email) {
    const recent = await pool.query(
      `SELECT 1 FROM auth_codes WHERE user_id = $1 AND purpose = $2
       AND created_at > NOW() - INTERVAL '${COOLDOWN_SECONDS} seconds'`, [userId, purpose]);
    if (recent.rowCount) return null;
    const code = newCode();
    await pool.query(
      `INSERT INTO auth_codes (user_id, purpose, email, code_hash, attempts, expires_at, created_at)
       VALUES ($1, $2, $3, $4, 0, NOW() + INTERVAL '${CODE_MINUTES} minutes', NOW())
       ON CONFLICT (user_id, purpose) DO UPDATE SET email = EXCLUDED.email, code_hash = EXCLUDED.code_hash,
         attempts = 0, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
      [userId, purpose, email, hashCode(purpose, userId, email, code)]);
    return code;
  }

  // Check a typed code. Every try uses up one attempt (counted in the database, so it can't be raced).
  async function checkCode(userId, purpose, typed) {
    const r = await pool.query(
      `UPDATE auth_codes SET attempts = attempts + 1
       WHERE user_id = $1 AND purpose = $2 AND expires_at > NOW() AND attempts < ${MAX_ATTEMPTS}
       RETURNING email, code_hash`, [userId, purpose]);
    if (!r.rowCount) return { ok: false };
    const row = r.rows[0];
    if (!/^\d{6}$/.test(String(typed))) return { ok: false };
    if (!sameHash(row.code_hash, hashCode(purpose, userId, row.email, String(typed)))) return { ok: false };
    await pool.query('DELETE FROM auth_codes WHERE user_id = $1 AND purpose = $2', [userId, purpose]);   // one use only
    return { ok: true, email: row.email };
  }

  // Only accounts with a VERIFIED email can reset by email. Identifier = username or that email.
  async function findResetUser(identifier) {
    const id = String(identifier || '').trim().toLowerCase();
    if (!id || id.length > 254) return null;
    const r = await pool.query(
      `SELECT id, username, email FROM users
       WHERE email_verified AND email IS NOT NULL AND (username = $1 OR LOWER(email) = $1)
       ORDER BY (username = $1) DESC LIMIT 1`, [id]);
    return r.rows[0] || null;
  }

  async function endAllSessions(userId, exceptSid) {
    try {
      if (exceptSid) await pool.query(`DELETE FROM session WHERE sess->>'userId' = $1 AND sid <> $2`, [String(userId), exceptSid]);
      else await pool.query(`DELETE FROM session WHERE sess->>'userId' = $1`, [String(userId)]);
    } catch (e) { console.error('[auth] could not end sessions:', e.message); }
  }

  const validPassword = p => typeof p === 'string' && p.length >= 6 && p.length <= 200;

  // ================= logged in: add / change the email =================
  app.post('/api/account/email/request', requireAuth, async (req, res) => {
    if (!mailReady()) return res.status(503).json({ error: 'Email is not set up on the server yet' });
    const me = req.session.userId;
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!allow('emailreq:' + me, 8, 3600 * 1000)) return res.status(429).json({ error: 'Too many tries. Please try again later.' });
    try {
      const used = await pool.query('SELECT 1 FROM users WHERE email_verified AND LOWER(email) = $1 AND id <> $2', [email, me]);
      if (used.rowCount) return res.status(409).json({ error: 'That email is already linked to another account' });
      const code = await issueCode(me, 'verify_email', email);
      if (!code) return res.status(429).json({ error: 'Please wait a minute before asking for another code' });
      try {
        const m = codeEmail(code, 'Use this code to confirm your email address.', CODE_MINUTES);
        await sendMail({ to: email, subject: 'Your Expense Tracker code: ' + code, text: m.text, html: m.html });
      } catch (e) {
        console.error('[auth] email failed:', e.message);
        await pool.query('DELETE FROM auth_codes WHERE user_id = $1 AND purpose = $2', [me, 'verify_email']);
        return res.status(502).json({ error: 'Could not send the email. Check the address and try again.' });
      }
      res.json({ sent: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/account/email/verify', requireAuth, async (req, res) => {
    const me = req.session.userId;
    try {
      const r = await checkCode(me, 'verify_email', req.body && req.body.code);
      if (!r.ok) return res.status(400).json({ error: 'That code is wrong or has expired' });
      try {
        await pool.query('UPDATE users SET email = $2, email_verified = TRUE WHERE id = $1', [me, r.email]);
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'That email is already linked to another account' });
        throw e;
      }
      res.json({ email: r.email, verified: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ================= logged in: change password =================
  app.post('/api/account/password', requireAuth, async (req, res) => {
    const me = req.session.userId;
    const cur = req.body && req.body.current, next = req.body && req.body.next;
    if (!allow('pw:' + me, 10, 3600 * 1000)) return res.status(429).json({ error: 'Too many tries. Please try again later.' });
    if (!validPassword(next)) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    try {
      const u = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [me])).rows[0];
      if (!u || typeof cur !== 'string' || !(await bcrypt.compare(cur, u.password_hash))) {
        return res.status(400).json({ error: 'Your current password is wrong' });
      }
      await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [me, await bcrypt.hash(next, 10)]);
      await endAllSessions(me, req.sessionID);     // log out every OTHER device
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ================= not logged in: forgot password =================
  // Step 1: ask for a code. The answer is always the same, so nobody can use this to find out who has an account.
  app.post('/api/auth/forgot', async (req, res) => {
    if (!mailReady()) return res.status(503).json({ error: 'Password reset by email is not set up on the server yet.' });
    const identifier = String((req.body && req.body.identifier) || '').trim().toLowerCase();
    const generic = { ok: true,
      message: 'If that account has a verified email, a 6-digit code is on its way. It expires in ' + CODE_MINUTES +
        ' minutes. Only accounts with a verified email can reset this way.' };
    if (!identifier || identifier.length > 254) return res.json(generic);
    if (!allow('forgot-ip:' + req.ip, 10, 3600 * 1000) || !allow('forgot-id:' + identifier, 5, 3600 * 1000)) {
      return res.status(429).json({ error: 'Too many tries. Please try again in a while.' });
    }
    res.json(generic);                              // answer first, so the timing gives nothing away
    try {
      const user = await findResetUser(identifier);
      if (!user) return;
      const code = await issueCode(user.id, 'reset_password', user.email);
      if (!code) return;                            // asked again too soon: keep the first code
      const m = codeEmail(code, 'Use this code to reset your password.', CODE_MINUTES);
      await sendMail({ to: user.email, subject: 'Reset your password: ' + code, text: m.text, html: m.html });
    } catch (e) { console.error('[auth] forgot failed:', e.message); }
  });

  // Step 2: the code + a new password
  app.post('/api/auth/reset', async (req, res) => {
    const b = req.body || {};
    if (!allow('reset-ip:' + req.ip, 20, 3600 * 1000)) return res.status(429).json({ error: 'Too many tries. Please try again in a while.' });
    if (!validPassword(b.newPassword)) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const bad = { error: 'That code is wrong or has expired. Ask for a new one.' };
    try {
      const user = await findResetUser(b.identifier);
      if (!user) return res.status(400).json(bad);
      const r = await checkCode(user.id, 'reset_password', b.code);
      if (!r.ok) return res.status(400).json(bad);
      await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, await bcrypt.hash(b.newPassword, 10)]);
      await endAllSessions(user.id);                // whoever had the old password is logged out everywhere
      res.json({ success: true });
      sendMail({                                    // heads-up email, in case it wasn't you
        to: user.email, subject: 'Your Expense Tracker password was changed',
        text: 'Your password was just changed. If this was not you, reset it again right away.',
        html: '<p>Your Expense Tracker password was just changed.</p><p>If this was not you, reset it again right away.</p>'
      }).catch(e => console.error('[auth] notice email failed:', e.message));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });
}

module.exports = { mountAuth, initAuthDb, hashCode, sameHash, newCode };