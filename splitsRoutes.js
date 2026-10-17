// =====================================================================
//  SPLITS (shared groups)  -  server side
//  All money is stored and calculated in PAISE (integers), never in
//  floating-point rupees, so a group's totals always add up exactly.
// =====================================================================
const crypto = require('crypto');
const { Client } = require('pg');

// Web Push is optional: if the package or the keys are missing, the server still runs, just without push.
let webpush = null;
try { webpush = require('web-push'); } catch (e) { console.warn('[splits] web-push not installed: push notifications are off'); }
const pushOn = !!(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushOn) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
} else {
  console.warn('[splits] push notifications are off (need the web-push package and VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
}

const MAX_MEMBERS = 20;
const MAX_GROUPS_PER_USER = 30;
const MAX_RUPEES = 10000000;                       // same limit as normal expenses
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easier to read out on WhatsApp

// ---------- Pure money functions (no database, easy to test) ----------

// Split `totalPaise` equally. Leftover paise go one each to the first people,
// so 10000 paise / 3 = 3334 + 3333 + 3333 and the sum is always exact.
function splitEqual(totalPaise, userIds) {
  const ids = [...userIds].sort((a, b) => a - b);
  const base = Math.floor(totalPaise / ids.length);
  let rem = totalPaise - base * ids.length;
  return ids.map(id => ({ userId: id, share: base + (rem-- > 0 ? 1 : 0) }));
}

// net > 0  : the group owes this person money
// net < 0  : this person owes the group
// expenses: [{ paid_by, amount, shares: [{ user_id, share }] }]
// settlements: [{ from_user, to_user, amount }]
function computeNets(memberIds, expenses, settlements) {
  const net = {};
  memberIds.forEach(id => { net[id] = 0; });
  expenses.forEach(e => {
    net[e.paid_by] = (net[e.paid_by] || 0) + e.amount;
    e.shares.forEach(s => { net[s.user_id] = (net[s.user_id] || 0) - s.share; });
  });
  settlements.forEach(s => {
    net[s.from_user] = (net[s.from_user] || 0) + s.amount; // they paid money out
    net[s.to_user] = (net[s.to_user] || 0) - s.amount;     // they received it
  });
  return net;
}

// Turn the balances into "who pays whom". Biggest debtor pays biggest creditor,
// repeat. This never needs more than (people - 1) payments, and for 3 people
// that is always the smallest possible number.
function simplify(net) {
  const cr = [], db = [];
  Object.keys(net).map(Number).sort((a, b) => a - b).forEach(id => {
    if (net[id] > 0) cr.push({ id, amt: net[id] });
    else if (net[id] < 0) db.push({ id, amt: -net[id] });
  });
  cr.sort((a, b) => b.amt - a.amt || a.id - b.id);
  db.sort((a, b) => b.amt - a.amt || a.id - b.id);
  const out = [];
  let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const x = Math.min(db[i].amt, cr[j].amt);
    out.push({ from: db[i].id, to: cr[j].id, amount: x });
    db[i].amt -= x; cr[j].amt -= x;
    if (db[i].amt === 0) i++;
    if (cr[j].amt === 0) j++;
  }
  return out;
}

// ---------- Database tables ----------
async function initSplitsDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS split_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS split_members (
      group_id INTEGER NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (group_id, user_id)
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_split_members_user ON split_members(user_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS split_expenses (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
      paid_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      added_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
      date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_split_expenses_group ON split_expenses(group_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS split_expense_shares (
      expense_id INTEGER NOT NULL REFERENCES split_expenses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_paise BIGINT NOT NULL CHECK (share_paise >= 0),
      PRIMARY KEY (expense_id, user_id)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS split_settlements (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
      from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_split_settlements_group ON split_settlements(group_id)');
  // One row per phone/browser that agreed to notifications
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)');
  // Remembers which of my shares I already copied into my own tracker (stops double-adding)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS split_share_links (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expense_id INTEGER NOT NULL REFERENCES split_expenses(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, expense_id)
    )`);
}

// ---------- Routes ----------
function mountSplits(app, pool, requireAuth, helpers) {
  const { ALLOWED_CATEGORIES, isValidDate } = helpers;

  // Slow down people guessing invite codes: 10 wrong tries per 10 minutes per user
  const joinFails = new Map();
  function tooManyJoinTries(userId) {
    const rec = joinFails.get(userId);
    return !!rec && rec.reset > Date.now() && rec.count >= 10;
  }
  function noteJoinFail(userId) {
    const now = Date.now();
    const rec = joinFails.get(userId);
    if (!rec || rec.reset <= now) joinFails.set(userId, { count: 1, reset: now + 10 * 60 * 1000 });
    else rec.count++;
  }

  // ---- Live updates (Server-Sent Events) ----
  // userId -> set of open connections (one per open phone/tab)
  const streams = new Map();

  const rs = p => '₹' + (p / 100).toFixed(2);

  // Send the "something changed" ping to the phones connected to THIS server process.
  async function deliverLocal(groupId) {
    try {
      const { rows } = await pool.query('SELECT user_id FROM split_members WHERE group_id = $1', [groupId]);
      const msg = 'data: ' + JSON.stringify({ t: 'changed', g: groupId }) + '\n\n';
      rows.forEach(r => {
        const set = streams.get(r.user_id);
        if (set) set.forEach(res => { try { res.write(msg); } catch (e) { /* closed */ } });
      });
    } catch (e) { console.error('deliverLocal failed', e); }
  }

  // Postgres LISTEN/NOTIFY: every change is announced through the database, and EVERY
  // server instance hears it and pings its own connected phones. So live updates keep
  // working even if Render runs more than one copy of your app.
  let listenerUp = false, listenerRetry = null;
  async function startListener() {
    const client = new Client(pool.options);
    let dead = false;
    const fail = () => {
      if (dead) return;
      dead = true; listenerUp = false;
      try { Promise.resolve(client.end()).catch(() => {}); } catch (e) { /* already closed */ }
      clearTimeout(listenerRetry);
      listenerRetry = setTimeout(startListener, 3000);   // reconnect automatically
    };
    client.on('error', fail);
    client.on('end', fail);
    client.on('notification', msg => {
      try { const p = JSON.parse(msg.payload); if (p && p.g) deliverLocal(p.g); } catch (e) { /* ignore */ }
    });
    try {
      await client.connect();
      await client.query('LISTEN split_changes');
      listenerUp = true;
    } catch (e) { console.error('[splits] listener error:', e.message); fail(); }
  }
  startListener();

  // Browser notifications for people who don't have the app open
  async function sendPush(groupId, actorId, what) {
    if (!pushOn) return;
    try {
      const info = (await pool.query(
        `SELECT g.name AS gname, NULLIF(TRIM(u.display_name), '') AS uname
         FROM split_groups g, users u WHERE g.id = $1 AND u.id = $2`, [groupId, actorId])).rows[0];
      if (!info) return;
      const subs = (await pool.query(
        `SELECT p.endpoint, p.p256dh, p.auth
         FROM push_subscriptions p JOIN split_members m ON m.user_id = p.user_id
         WHERE m.group_id = $1 AND p.user_id <> $2`, [groupId, actorId])).rows;   // never notify the person who did it
      if (!subs.length) return;
      const payload = JSON.stringify({ title: info.gname, body: (info.uname || 'Someone') + ' ' + what, tag: 'split-' + groupId });
      await Promise.all(subs.map(async s => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {   // phone unsubscribed or app removed
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]);
          } else console.error('[splits] push failed:', e.statusCode || e.message);
        }
      }));
    } catch (e) { console.error('[splits] sendPush:', e.message); }
  }

  // Called after every change: live-update open screens + notify the others
  async function changed(groupId, actorId, what) {
    try {
      if (listenerUp) await pool.query("SELECT pg_notify('split_changes', $1)", [JSON.stringify({ g: groupId })]);
      else await deliverLocal(groupId);                      // listener down: at least this server's phones
    } catch (e) { console.error(e); await deliverLocal(groupId); }
    sendPush(groupId, actorId, what);
  }

  // ---- Push subscription endpoints ----
  app.get('/api/splits/push/key', requireAuth, (req, res) => {
    if (!pushOn) return res.status(503).json({ error: 'Notifications are not set up on the server yet' });
    res.json({ key: process.env.VAPID_PUBLIC_KEY });
  });

  app.post('/api/splits/push/subscribe', requireAuth, async (req, res) => {
    if (!pushOn) return res.status(503).json({ error: 'Notifications are not set up on the server yet' });
    const sub = req.body && req.body.subscription;
    const ep = sub && sub.endpoint, k = sub && sub.keys;
    if (typeof ep !== 'string' || !/^https:\/\//.test(ep) || ep.length > 1000 || !k ||
        typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    try {
      const me = req.session.userId;
      // If another account used this same phone before, the phone now belongs to this account
      await pool.query(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, created_at = NOW()`, [ep, me, k.p256dh, k.auth]);
      await pool.query(
        `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint NOT IN
           (SELECT endpoint FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10)`, [me]);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/splits/push/unsubscribe', requireAuth, async (req, res) => {
    const ep = req.body && req.body.endpoint;
    if (typeof ep !== 'string') return res.status(400).json({ error: 'Invalid request' });
    try {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [ep, req.session.userId]);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/splits/stream', requireAuth, (req, res) => {
    const me = req.session.userId;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'          // stop proxies holding the messages back
    });
    res.write('retry: 3000\n\n');       // browser reconnects after 3s if dropped
    res.write('data: {"t":"ping"}\n\n');  // proves to the phone that messages really arrive

    let set = streams.get(me);
    if (!set) { set = new Set(); streams.set(me, set); }
    if (set.size >= 5) { const oldest = set.values().next().value; set.delete(oldest); try { oldest.end(); } catch (e) {} }
    set.add(res);

    // Heartbeat every 25s keeps the connection from being closed as idle
    const hb = setInterval(() => { try { res.write('data: {"t":"ping"}\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => {
      clearInterval(hb);
      set.delete(res);
      if (set.size === 0) streams.delete(me);
    });
  });

  const cleanText = (s, max) =>
    String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

  async function isMember(db, groupId, userId) {
    const { rowCount } = await db.query(
      'SELECT 1 FROM split_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    return rowCount > 0;
  }

  // Everything about one group. Caller must already have checked membership.
  async function loadGroup(db, groupId, me) {
    const g = (await db.query('SELECT id, name, code, created_by FROM split_groups WHERE id = $1', [groupId])).rows[0];
    if (!g) return null;

    const mrows = (await db.query(
      `SELECT u.id, NULLIF(TRIM(u.display_name), '') AS name
       FROM split_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 ORDER BY m.joined_at, u.id`, [groupId])).rows;
    // Never show login usernames. Unnamed members get a neutral label; duplicates get (2), (3)...
    const seen = {};
    const members = mrows.map(r => {
      const base = r.name || 'Unnamed member';
      seen[base] = (seen[base] || 0) + 1;
      return { id: r.id, name: seen[base] > 1 ? base + ' (' + seen[base] + ')' : base };
    });

    const erows = (await db.query(
      `SELECT id, title, amount_paise, paid_by, added_by, date
       FROM split_expenses WHERE group_id = $1 ORDER BY date DESC, id DESC`, [groupId])).rows;
    const srows = (await db.query(
      `SELECT s.expense_id, s.user_id, s.share_paise
       FROM split_expense_shares s JOIN split_expenses e ON e.id = s.expense_id
       WHERE e.group_id = $1`, [groupId])).rows;
    const linked = new Set((await db.query(
      `SELECT l.expense_id FROM split_share_links l JOIN split_expenses e ON e.id = l.expense_id
       WHERE e.group_id = $1 AND l.user_id = $2`, [groupId, me])).rows.map(r => r.expense_id));

    const sharesBy = {};
    srows.forEach(s => {
      (sharesBy[s.expense_id] = sharesBy[s.expense_id] || [])
        .push({ user_id: s.user_id, share: Number(s.share_paise) });
    });
    const expenses = erows.map(e => ({
      id: e.id, title: e.title, amount: Number(e.amount_paise), paid_by: e.paid_by,
      added_by: e.added_by, date: e.date, shares: sharesBy[e.id] || [],
      addedToTracker: linked.has(e.id)
    }));

    const setRows = (await db.query(
      `SELECT id, from_user, to_user, amount_paise, created_by, created_at
       FROM split_settlements WHERE group_id = $1 ORDER BY id DESC`, [groupId])).rows;
    const settlements = setRows.map(s => ({
      id: s.id, from_user: s.from_user, to_user: s.to_user, amount: Number(s.amount_paise),
      created_by: s.created_by, created_at: s.created_at
    }));

    const net = computeNets(members.map(m => m.id), expenses, settlements);
    return {
      group: { id: g.id, name: g.name, code: g.code, isOwner: g.created_by === me },
      me, members, expenses, settlements,
      balances: net,
      transfers: simplify(net)
    };
  }

  // ---- My groups, with my own balance in each ----
  app.get('/api/splits/groups', requireAuth, async (req, res) => {
    try {
      const me = req.session.userId;
      const { rows } = await pool.query(
        `SELECT g.id FROM split_groups g JOIN split_members m ON m.group_id = g.id
         WHERE m.user_id = $1 ORDER BY g.id DESC`, [me]);
      const out = [];
      for (const r of rows) {
        const d = await loadGroup(pool, r.id, me);
        if (d) out.push({ id: d.group.id, name: d.group.name, members: d.members.length, myBalance: d.balances[me] || 0 });
      }
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Create a group ----
  app.post('/api/splits/groups', requireAuth, async (req, res) => {
    const me = req.session.userId;
    const name = cleanText(req.body && req.body.name, 40);
    if (!name) return res.status(400).json({ error: 'Give the group a name' });
    try {
      const mine = await pool.query('SELECT COUNT(*)::int AS n FROM split_members WHERE user_id = $1', [me]);
      if (mine.rows[0].n >= MAX_GROUPS_PER_USER) return res.status(400).json({ error: 'You are in too many groups' });
      const nm = await pool.query('SELECT display_name FROM users WHERE id = $1', [me]);
      if (!nm.rows[0] || !String(nm.rows[0].display_name || '').trim()) {
        return res.status(400).json({ error: 'Set your name in Settings first, so friends can see who you are' });
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const bytes = crypto.randomBytes(6);
        let code = '';
        for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const g = await client.query(
            'INSERT INTO split_groups (name, code, created_by) VALUES ($1, $2, $3) RETURNING id', [name, code, me]);
          await client.query('INSERT INTO split_members (group_id, user_id) VALUES ($1, $2)', [g.rows[0].id, me]);
          await client.query('COMMIT');
          client.release();
          return res.json({ id: g.rows[0].id });
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          client.release();
          if (e.code !== '23505') throw e;   // code clash: try a new code
        }
      }
      res.status(500).json({ error: 'Could not create the group, try again' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Join with an invite code ----
  app.post('/api/splits/join', requireAuth, async (req, res) => {
    const me = req.session.userId;
    if (tooManyJoinTries(me)) return res.status(429).json({ error: 'Too many wrong codes. Try again in a few minutes.' });
    const code = String((req.body && req.body.code) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    try {
      const nm = await pool.query('SELECT display_name FROM users WHERE id = $1', [me]);
      if (!nm.rows[0] || !String(nm.rows[0].display_name || '').trim()) {
        return res.status(400).json({ error: 'Set your name in Settings first, so friends can see who you are' });
      }
      const g = code.length === 6
        ? (await pool.query('SELECT id FROM split_groups WHERE code = $1', [code])).rows[0] : null;
      if (!g) { noteJoinFail(me); return res.status(404).json({ error: 'No group found with that code' }); }

      if (await isMember(pool, g.id, me)) return res.json({ id: g.id });
      const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM split_members WHERE group_id = $1', [g.id]);
      if (cnt.rows[0].n >= MAX_MEMBERS) return res.status(400).json({ error: 'This group is full' });
      const mine = await pool.query('SELECT COUNT(*)::int AS n FROM split_members WHERE user_id = $1', [me]);
      if (mine.rows[0].n >= MAX_GROUPS_PER_USER) return res.status(400).json({ error: 'You are in too many groups' });

      await pool.query('INSERT INTO split_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [g.id, me]);
      changed(g.id, me, 'joined the group');
      res.json({ id: g.id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- One group (members only; outsiders get 404 so they can't even tell it exists) ----
  app.get('/api/splits/groups/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
      const me = req.session.userId;
      if (!(await isMember(pool, id, me))) return res.status(404).json({ error: 'Group not found' });
      res.json(await loadGroup(pool, id, me));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Add something to split ----
  // Body: { title, amount (rupees), paidBy (member id), splitAmong: [member ids], date }
  app.post('/api/splits/groups/:id/expenses', requireAuth, async (req, res) => {
    const gid = parseInt(req.params.id, 10);
    if (isNaN(gid)) return res.status(400).json({ error: 'Invalid id' });
    const me = req.session.userId;
    const b = req.body || {};

    const title = cleanText(b.title, 60);
    if (!title) return res.status(400).json({ error: 'What was it for? Add a short title' });
    const rupees = Number(b.amount);
    if (!Number.isFinite(rupees) || rupees <= 0 || rupees >= MAX_RUPEES) {
      return res.status(400).json({ error: 'Amount must be a positive number below 1,00,00,000' });
    }
    const paise = Math.round(rupees * 100);
    if (paise < 1) return res.status(400).json({ error: 'Amount is too small' });
    const date = String(b.date || '');
    if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be a real date' });
    const paidBy = parseInt(b.paidBy, 10);
    if (!Array.isArray(b.splitAmong) || b.splitAmong.length === 0 || b.splitAmong.length > MAX_MEMBERS) {
      return res.status(400).json({ error: 'Pick at least one person to split between' });
    }
    const among = [...new Set(b.splitAmong.map(n => parseInt(n, 10)))];
    if (among.some(n => isNaN(n))) return res.status(400).json({ error: 'Invalid people list' });

    const client = await pool.connect();
    try {
      if (!(await isMember(client, gid, me))) { client.release(); return res.status(404).json({ error: 'Group not found' }); }
      const m = (await client.query('SELECT user_id FROM split_members WHERE group_id = $1', [gid])).rows.map(r => r.user_id);
      if (!m.includes(paidBy) || !among.every(u => m.includes(u))) {
        client.release();
        return res.status(400).json({ error: 'Everyone must be a member of this group' });
      }
      const shares = splitEqual(paise, among);

      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO split_expenses (group_id, paid_by, added_by, title, amount_paise, date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [gid, paidBy, me, title, paise, date]);
      for (const s of shares) {
        await client.query(
          'INSERT INTO split_expense_shares (expense_id, user_id, share_paise) VALUES ($1, $2, $3)',
          [ins.rows[0].id, s.userId, s.share]);
      }
      await client.query('COMMIT');
      client.release();
      changed(gid, me, 'added "' + title + '" (' + rs(paise) + ')');
      res.json({ id: ins.rows[0].id });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Delete an entry (only the person who added it) ----
  app.delete('/api/splits/expenses/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('DELETE FROM split_expenses WHERE id = $1 AND added_by = $2 RETURNING group_id, title, amount_paise', [id, req.session.userId]);
      if (r.rowCount === 0) return res.status(404).json({ error: 'Entry not found, or it was added by someone else' });
      changed(r.rows[0].group_id, req.session.userId, 'deleted "' + r.rows[0].title + '" (' + rs(Number(r.rows[0].amount_paise)) + ')');
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Mark a payment as paid ----
  // Body: { from, to, amount (paise) }. Only the payer or the receiver can record it.
  app.post('/api/splits/groups/:id/settlements', requireAuth, async (req, res) => {
    const gid = parseInt(req.params.id, 10);
    if (isNaN(gid)) return res.status(400).json({ error: 'Invalid id' });
    const me = req.session.userId;
    const b = req.body || {};
    const from = parseInt(b.from, 10), to = parseInt(b.to, 10), amount = Number(b.amount);
    if (isNaN(from) || isNaN(to) || from === to) return res.status(400).json({ error: 'Invalid payment' });
    if (!Number.isInteger(amount) || amount <= 0 || amount >= MAX_RUPEES * 100) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (me !== from && me !== to) return res.status(403).json({ error: 'Only the two people involved can record this' });
    try {
      if (!(await isMember(pool, gid, me))) return res.status(404).json({ error: 'Group not found' });
      const chk = await pool.query('SELECT COUNT(*)::int AS n FROM split_members WHERE group_id = $1 AND user_id = ANY($2)', [gid, [from, to]]);
      if (chk.rows[0].n !== 2) return res.status(400).json({ error: 'Both people must be in the group' });

      // The amount can't be more than what is actually still owed
      const d = await loadGroup(pool, gid, me);
      const open = d.transfers.find(t => t.from === from && t.to === to);
      const owed = Math.max(0, -(d.balances[from] || 0));
      const due = Math.max(0, d.balances[to] || 0);
      if (!(open ? amount <= open.amount : amount <= Math.min(owed, due))) {
        return res.status(400).json({ error: 'That is more than is owed right now. Refresh and try again.' });
      }
      const r = await pool.query(
        `INSERT INTO split_settlements (group_id, from_user, to_user, amount_paise, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`, [gid, from, to, amount, me]);
      changed(gid, me, 'recorded a payment of ' + rs(amount));
      res.json({ id: r.rows[0].id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Undo a recorded payment (only whoever recorded it) ----
  app.delete('/api/splits/settlements/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('DELETE FROM split_settlements WHERE id = $1 AND created_by = $2 RETURNING group_id, amount_paise', [id, req.session.userId]);
      if (r.rowCount === 0) return res.status(404).json({ error: 'Payment not found, or recorded by someone else' });
      changed(r.rows[0].group_id, req.session.userId, 'undid a payment of ' + rs(Number(r.rows[0].amount_paise)));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ---- Copy MY share of a split into MY own tracker ----
  // Body: { category }.  Your share is what you actually spent, not what you paid.
  app.post('/api/splits/expenses/:id/add-to-tracker', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const me = req.session.userId;
    const category = String((req.body && req.body.category) || 'Other');
    if (!ALLOWED_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Unknown category' });

    const client = await pool.connect();
    try {
      const row = (await client.query(
        `SELECT e.title, e.date, g.name AS group_name, s.share_paise
         FROM split_expenses e
         JOIN split_groups g ON g.id = e.group_id
         JOIN split_members m ON m.group_id = e.group_id AND m.user_id = $2
         JOIN split_expense_shares s ON s.expense_id = e.id AND s.user_id = $2
         WHERE e.id = $1`, [id, me])).rows[0];
      if (!row) { client.release(); return res.status(404).json({ error: 'You have no share in this entry' }); }
      const share = Number(row.share_paise);
      if (share <= 0) { client.release(); return res.status(400).json({ error: 'Your share is zero' }); }

      await client.query('BEGIN');
      const link = await client.query(
        'INSERT INTO split_share_links (user_id, expense_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me, id]);
      if (link.rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ error: 'You already added this one' });
      }
      await client.query(
        'INSERT INTO expenses (user_id, amount, category, description, date) VALUES ($1, $2, $3, $4, $5)',
        [me, share / 100, category, (row.title + ' (' + row.group_name + ')').slice(0, 100), row.date]);
      await client.query('COMMIT');
      client.release();
      res.json({ success: true, amount: share });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });
}

module.exports = { mountSplits, initSplitsDb, splitEqual, computeNets, simplify };