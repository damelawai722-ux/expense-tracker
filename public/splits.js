// =====================================================================
//  SPLITS (shared groups)  -  browser side
//  Loaded after app.js, so it can use: api, jsonOpts, openModal, confirmModal,
//  esc, inr, todayStr, displayName, CATEGORY_ICONS, loadAllExpenses
//  All amounts from the server are in PAISE (1/100 of a rupee).
// =====================================================================
(function () {
  const money = p => '₹' + inr(Math.abs(p) / 100);

  function injectSplitStyles() {
    if (document.getElementById('sp-styles')) return;
    const s = document.createElement('style');
    s.id = 'sp-styles';
    s.textContent = `
      .sp-top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
      .sp-back { border:0; background:none; color:var(--muted); font:inherit; font-size:13px; font-weight:600; cursor:pointer; padding:6px 0; }
      .sp-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px; margin-bottom:8px;
                border:1px solid var(--border); border-radius:16px; cursor:pointer; background:var(--bg); }
      .sp-row:active { opacity:.75; }
      .sp-name { font-weight:700; font-size:15px; overflow-wrap:anywhere; }
      .sp-sub { font-size:12px; color:var(--muted); margin-top:3px; }
      .sp-get { color:#1f9d63; font-weight:800; white-space:nowrap; font-size:13px; }
      .sp-owe { color:#ff453a; background:rgba(255,69,58,.16); padding:5px 11px; border-radius:999px; font-weight:800; white-space:nowrap; font-size:13px; }
      .sp-even { color:var(--muted); font-weight:600; white-space:nowrap; font-size:13px; }
      .sp-hero { border-radius:20px; padding:16px 18px; color:#fff; margin-bottom:6px;
                 background:linear-gradient(145deg,var(--hero-1),var(--hero-2)); }
      .sp-hero small { opacity:.7; font-size:11px; letter-spacing:1.2px; font-weight:600; }
      .sp-hero b { display:block; font-size:24px; font-weight:800; margin-top:6px; }
      .sp-code { font-family:ui-monospace,monospace; letter-spacing:2px; font-weight:800; }
      .sp-pay { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 0;
                border-top:1px solid var(--border); font-size:14px; }
      .sp-pay:first-of-type { border-top:0; }
      .sp-item { padding:12px 0; border-top:1px solid var(--border); }
      .sp-item:first-of-type { border-top:0; }
      .sp-item-head { display:flex; justify-content:space-between; gap:10px; font-weight:700; font-size:14px; }
      .sp-item-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
      .sp-checks { display:flex; flex-direction:column; gap:6px; margin:6px 0 4px; }
      .sp-check { display:flex; align-items:center; gap:10px; padding:9px 10px; border:1px solid var(--border); border-radius:10px; font-size:14px; }
      .sp-check input { width:auto; margin:0; }
      .sp-preview { font-size:13px; font-weight:600; margin:8px 0; min-height:18px; }
      .sp-note { font-size:12px; color:var(--muted); margin-top:10px; }

      .sp-gname { font-size:22px; font-weight:800; margin:2px 0 10px; overflow-wrap:anywhere; }
      .sp-title { font-size:12px; font-weight:800; letter-spacing:1.2px; color:var(--muted); margin:22px 0 10px; }
      .sp-empty { padding:16px; text-align:center; font-size:14px; color:var(--muted); border:1px dashed var(--border); border-radius:14px; }

      .sp-av { width:34px; height:34px; border-radius:50%; display:inline-grid; place-items:center; flex-shrink:0;
               color:#fff; font-weight:800; font-size:15px; }
      .sp-av.sm { width:22px; height:22px; font-size:11px; }

      .sp-members { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
      .sp-mchip { display:inline-flex; align-items:center; gap:8px; padding:5px 14px 5px 5px; border-radius:999px;
                  background:var(--bg); border:1px solid var(--border); font-size:14px; max-width:100%; }
      .sp-mchip b { font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sp-mchip.me { border-color:var(--bar-on); }
      .sp-hero span { display:block; margin-top:6px; font-size:12px; opacity:.75; }

      .sp-flow { border:1px solid var(--border); background:var(--bg); border-radius:18px; padding:14px; margin-bottom:12px; }
      /* YOU PAY: loud red. YOU RECEIVE: bright green. Between others: quiet and dashed. */
      .sp-flow.out { border:2px solid #ff453a; background:linear-gradient(135deg, rgba(255,69,58,.24), rgba(255,69,58,.07));
                     box-shadow:0 0 0 4px rgba(255,69,58,.14), 0 8px 22px rgba(255,69,58,.28); }
      .sp-flow.in  { border:2px solid #22c55e; background:linear-gradient(135deg, rgba(34,197,94,.22), rgba(34,197,94,.06));
                     box-shadow:0 0 0 4px rgba(34,197,94,.12), 0 8px 22px rgba(34,197,94,.22); }
      .sp-flow.other { border:1px dashed var(--border); opacity:.72; }
      .sp-flag { display:inline-block; margin-bottom:12px; padding:4px 11px; border-radius:999px; font-size:11px; font-weight:800;
                 letter-spacing:.9px; background:var(--border); color:var(--muted); }
      .sp-flag.out { background:#ff453a; color:#fff; }
      .sp-flag.in { background:#16a34a; color:#fff; }
      .sp-flow.out .sp-arrow b { color:#ff453a; font-size:18px; }
      .sp-flow.in .sp-arrow b { color:#16a34a; font-size:18px; }
      .sp-flow.out .sp-arrow i { background:#ff453a; } .sp-flow.out .sp-arrow i::after { border-left-color:#ff453a; }
      .sp-flow.in .sp-arrow i { background:#16a34a; } .sp-flow.in .sp-arrow i::after { border-left-color:#16a34a; }
      .sp-mark.pay { background:#ff453a; border-color:#ff453a; color:#fff; font-size:15px; }
      .sp-mark.recv { background:#16a34a; border-color:#16a34a; color:#fff; font-size:15px; }
      .sp-hero.owe { background:linear-gradient(145deg, #ef4435, #8f1d14); }
      .sp-row.owing { border-color:#ff453a; background:rgba(255,69,58,.10); }

      .sp-opts { border:1px solid var(--border); border-radius:16px; padding:14px; background:var(--bg); }
      .sp-opt-note { font-size:13px; font-weight:600; margin-bottom:12px; }
      .sp-opt-note.ok { color:#16a34a; } .sp-opt-note.warn { color:#d35400; }
      .sp-opt-btns { display:flex; gap:10px; flex-wrap:wrap; }
      .sp-flow-row { display:grid; grid-template-columns:1fr minmax(92px, 1.1fr) 1fr; align-items:center; gap:6px; }
      .sp-person { display:flex; flex-direction:column; align-items:center; text-align:center; gap:4px; min-width:0; }
      .sp-person .sp-av, .sp-person .av { width:46px; height:46px; font-size:22px; }
      .sp-newpill { display:inline-block; margin-left:8px; padding:2px 8px; border-radius:999px; background:#d35400; color:#fff; font-size:10px; font-weight:800; letter-spacing:.6px; vertical-align:middle; }
      .sp-person span { font-weight:700; font-size:14px; max-width:100%; overflow-wrap:anywhere; line-height:1.2; }
      .sp-person small { font-size:11px; color:var(--muted); }
      .sp-arrow { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .sp-arrow b { font-size:16px; font-weight:800; white-space:nowrap; }
      .sp-arrow i { display:block; width:100%; height:2px; background:var(--muted); position:relative; border-radius:2px; }
      .sp-arrow i::after { content:''; position:absolute; right:-1px; top:-4px; border-left:8px solid var(--muted);
                           border-top:5px solid transparent; border-bottom:5px solid transparent; }
      .sp-mark { width:100%; margin-top:12px; padding:10px; font-weight:700; }

      .sp-rank { padding:12px 0; border-top:1px solid var(--border); }
      .sp-rank:first-of-type { border-top:0; padding-top:0; }
      .sp-rank-top { display:flex; align-items:center; gap:10px; }
      .sp-medal { width:24px; text-align:center; font-size:18px; color:var(--muted); font-weight:700; }
      .sp-rname { flex:1; font-weight:700; font-size:15px; min-width:0; overflow-wrap:anywhere; }
      .sp-bar { height:8px; border-radius:8px; background:var(--border); margin:9px 0 6px; overflow:hidden; }
      .sp-bar i { display:block; height:100%; background:var(--bar-on); border-radius:8px; transition:width .3s; }
      .sp-rstat { font-size:12px; font-weight:700; color:var(--muted); }
      .sp-rstat.get { color:#1f9d63; }
      .sp-rstat.owe { color:var(--danger); }

      .sp-exp { border:1px solid var(--border); background:var(--bg); border-radius:16px; padding:14px; margin-bottom:10px; }
      .sp-exp-top { display:flex; justify-content:space-between; gap:12px; font-size:16px; }
      .sp-exp-title { font-weight:700; overflow-wrap:anywhere; }
      .sp-exp-meta { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:13px; color:var(--muted); }
      .sp-exp-meta b { color:var(--text); }
      .sp-pills { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
      .sp-pill { font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; border:1px solid var(--border); color:var(--muted); }
      .sp-pill.mine { color:var(--text); border-color:var(--bar-on); }

      .sp-live { display:flex; align-items:center; justify-content:center; gap:8px; margin-top:22px;
                 font-size:13px; font-weight:600; color:var(--muted); }
      .sp-dot { width:8px; height:8px; border-radius:50%; background:#1f9d63; box-shadow:0 0 0 0 rgba(31,157,99,.6);
                animation:spPulse 2s infinite; }
      @keyframes spPulse { 70% { box-shadow:0 0 0 7px rgba(31,157,99,0); } 100% { box-shadow:0 0 0 0 rgba(31,157,99,0); } }
    `;
    document.head.appendChild(s);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'cb-toast';
    t.style.background = '#1f6b4a';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  const AV_COLORS = ['#2E9E6B', '#3B82F6', '#E0822B', '#8B5CF6', '#E0507A', '#14A3A3', '#B8860B', '#E05252'];
  function avatar(m, small) {
    if (window.avatarHtml) return window.avatarHtml(m, small ? 'sm' : '');   // photo, avatar, or coloured initial
    const initial = String(m.name || '?').trim().charAt(0).toUpperCase() || '?';
    return '<span class="sp-av' + (small ? ' sm' : '') + '" style="background:' + AV_COLORS[m.id % AV_COLORS.length] + '">' + esc(initial) + '</span>';
  }

  function dateLabel(d) {
    const [y, m, day] = d.split('-').map(Number);
    return day + ' ' + MONTH_NAMES[m - 1].slice(0, 3).charAt(0) + MONTH_NAMES[m - 1].slice(1, 3).toLowerCase();
  }

  function statusHtml(bal) {
    if (bal > 0) return '<span class="sp-get">you get back ' + money(bal) + '</span>';
    if (bal < 0) return '<span class="sp-owe">you owe ' + money(bal) + '</span>';
    return '<span class="sp-even">settled up</span>';
  }

  // ------------------------- entry point -------------------------
  function openSplits() {
    injectSplitStyles();
    const ctx = openModal('Splits', { wide: true });
    showList(ctx);
    startLive(ctx);
    if (window.maybeShowSplitsGuide) window.maybeShowSplitsGuide();
  }
  window.openSplits = openSplits;

  // ------------------------- live connection (shared) -------------------------
  // ONE connection serves the open Splits screen AND the number on the Splits button.
  let sharedES = null, esOpened = false, lastMsgAt = 0;
  const liveListeners = new Set();
  const streamLive = () => !!(sharedES && sharedES.readyState === 1 && lastMsgAt && (Date.now() - lastMsgAt) < 40000);

  function ensureStream() {
    if (sharedES || typeof EventSource === 'undefined') return;   // very old browser: the 4-second check still works
    sharedES = new EventSource('/api/splits/stream');
    sharedES.onopen = () => { const re = esOpened; esOpened = true; liveListeners.forEach(f => f({ t: 'open', re })); };
    sharedES.onmessage = ev => {
      lastMsgAt = Date.now();
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      liveListeners.forEach(f => f(m));
    };
    // the badge reacts to every change and after a reconnect
    liveListeners.add(m => { if (m.t === 'changed' || (m.t === 'open' && m.re)) refreshBadgeSoon(); });
  }

  // The little number on the Splits button: groups where I owe money + groups with news I haven't seen
  let badgeTimer = null;
  async function refreshBadge() {
    const el = document.getElementById('sp-badge');
    if (!el) return;                       // Home screen not drawn yet
    ensureStream();                        // we know we're logged in once the button exists
    const r = await api('/api/splits/summary');
    if (!r.ok) return;
    const n = r.data.attention || 0;
    el.hidden = n === 0;
    el.textContent = n;
    el.className = 'ui-badge' + (r.data.owing > 0 ? ' danger' : '');   // red when you owe, orange for news only
    const bits = [];
    if (r.data.owing > 0) bits.push('You owe money in ' + r.data.owing + (r.data.owing === 1 ? ' group' : ' groups'));
    if (r.data.unseen > 0) bits.push(r.data.unseen + (r.data.unseen === 1 ? ' group has' : ' groups have') + ' new updates');
    el.parentElement.title = bits.join(' · ');
  }
  function refreshBadgeSoon() { clearTimeout(badgeTimer); badgeTimer = setTimeout(refreshBadge, 300); }
  window.refreshSplitsBadge = refreshBadgeSoon;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshBadgeSoon(); });
  setInterval(() => { if (document.visibilityState === 'visible') refreshBadgeSoon(); }, 60000);

  // Live updates for the open Splits window: the server pings us, we quietly re-fetch.
  function startLive(ctx) {
    ensureStream();
    let timer = null;
    const refresh = (groupId) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (ctx.view === 'list') showList(ctx, true);
        else if (ctx.view === 'group' && (groupId == null || ctx.gid === groupId)) showGroup(ctx, ctx.gid, true);
        // while typing in a form we never redraw; the next screen fetches fresh data anyway
      }, 250);
    };
    const onMsg = m => {
      if (!ctx.body.isConnected) { cleanup(); return; }               // Splits was closed
      if (m.t === 'changed') refresh(m.g);
      else if (m.t === 'open' && m.re) refresh(null);                 // reconnected: catch up on anything missed
    };
    // Safety net: trust the live connection only while messages really arrive; otherwise re-check every 4s
    const poll = setInterval(() => {
      if (!ctx.body.isConnected) { cleanup(); return; }
      if (!streamLive() && document.visibilityState === 'visible') refresh(null);
    }, 4000);
    function cleanup() {
      liveListeners.delete(onMsg);
      clearInterval(poll);
      clearTimeout(timer);
      refreshBadgeSoon();                                              // I may have read updates: recount
    }
    liveListeners.add(onMsg);
  }

  // ------------------------- my groups -------------------------
  async function showList(ctx, silent) {
    const { body } = ctx;
    ctx.view = 'list';
    if (!silent) body.innerHTML = '<div class="muted small">Loading…</div>';
    const r = await api('/api/splits/groups');
    if (!r.ok) { body.innerHTML = '<div class="ui-error">' + esc(r.data.error || 'Could not load') + '</div>'; return; }
    const groups = r.data;

    body.innerHTML =
      '<div class="ui-actions" style="justify-content:flex-start;margin:0 0 14px">' +
        '<button class="ui-btn primary" id="sp-new">+ New group</button>' +
        '<button class="ui-btn" id="sp-join">Join with code</button>' +
        '<button class="ui-btn" id="sp-help" aria-label="How splits work">?</button>' +
      '</div>' +
      (groups.length
        ? groups.map(g =>
            '<div class="sp-row' + (g.myBalance < 0 ? ' owing' : '') + '" data-g="' + g.id + '"><div><div class="sp-name">' + esc(g.name) + (g.unseen ? '<span class="sp-newpill">NEW</span>' : '') + '</div>' +
            '<div class="sp-sub">' + g.members + (g.members === 1 ? ' member' : ' members') + '</div></div>' +
            statusHtml(g.myBalance) + '</div>').join('')
        : '<div class="empty">No groups yet.<br>Create one for a trip or a flat, then share the code with friends.</div>') +
      '<div id="sp-pushbox"></div>' +
      '<div class="sp-note">Keeps track only. No real money moves through the app.</div>';

    body.querySelector('#sp-new').onclick = () => showCreate(ctx);
    body.querySelector('#sp-join').onclick = () => showJoin(ctx);
    body.querySelector('#sp-help').onclick = () => window.openSplitsGuide && window.openSplitsGuide();
    body.querySelectorAll('[data-g]').forEach(el => { el.onclick = () => showGroup(ctx, Number(el.dataset.g)); });
    setupPush(body.querySelector('#sp-pushbox'));
    refreshBadgeSoon();
  }

  // ------------------------- notifications (Web Push) -------------------------
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function keyToBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
  async function currentSub() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications were not allowed');
    const k = await api('/api/splits/push/key');
    if (!k.ok) throw new Error(k.data.error || 'Notifications are not available');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(k.data.key) }));
    const r = await api('/api/splits/push/subscribe', jsonOpts('POST', { subscription: sub.toJSON() }));
    if (!r.ok) throw new Error(r.data.error || 'Could not save');
  }
  async function disablePush() {
    const sub = await currentSub();
    if (!sub) return;
    await api('/api/splits/push/unsubscribe', jsonOpts('POST', { endpoint: sub.endpoint }));
    await sub.unsubscribe();
  }
  // app.js calls this on log out so a shared phone stops getting your notifications
  window.splitsPushOff = async () => { try { if (pushSupported()) await disablePush(); } catch (e) { /* ignore */ } };

  async function setupPush(box) {
    if (!box) return;
    if (!pushSupported()) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      box.innerHTML = '<div class="sp-note">' + (ios
        ? 'For notifications on iPhone: tap Share → Add to Home Screen, then open the app from your Home Screen.'
        : 'Notifications are not supported in this browser.') + '</div>';
      return;
    }
    if (Notification.permission === 'denied') {
      box.innerHTML = '<div class="sp-note">Notifications are blocked. Allow them in your browser or phone settings for this site.</div>';
      return;
    }
    let on = false;
    try { on = !!(await currentSub()); } catch (e) { /* treat as off */ }
    box.innerHTML = '<div class="ui-actions" style="justify-content:flex-start;margin:14px 0 0"><button class="ui-btn" id="sp-push">' +
      (on ? '🔔 Notifications on · Turn off' : '🔔 Turn on notifications') + '</button></div>';
    box.querySelector('#sp-push').onclick = async () => {
      try {
        if (on) { await disablePush(); toast('Notifications off'); }
        else { await enablePush(); toast('Notifications on'); }
      } catch (e) { toast(e.message || 'Could not change notifications'); }
      setupPush(box);
    };
  }

  function showCreate(ctx) {
    const { body } = ctx;
    ctx.view = 'form';
    body.innerHTML =
      '<button class="sp-back" id="sp-b">‹ Back</button>' +
      '<label class="ui-field">Group name<input id="sp-name" maxlength="40" placeholder="e.g. Shillong trip"></label>' +
      '<div class="ui-error" id="sp-err"></div>' +
      '<div class="ui-actions"><button class="ui-btn primary" id="sp-go">Create group</button></div>';
    body.querySelector('#sp-b').onclick = () => showList(ctx);
    const input = body.querySelector('#sp-name');
    setTimeout(() => input.focus(), 100);
    const go = async () => {
      const r = await api('/api/splits/groups', jsonOpts('POST', { name: input.value }));
      if (!r.ok) { body.querySelector('#sp-err').textContent = r.data.error || 'Could not create'; return; }
      showGroup(ctx, r.data.id);
    };
    body.querySelector('#sp-go').onclick = go;
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
  }

  function showJoin(ctx) {
    const { body } = ctx;
    ctx.view = 'form';
    body.innerHTML =
      '<button class="sp-back" id="sp-b">‹ Back</button>' +
      '<label class="ui-field">Invite code<input id="sp-code" maxlength="10" placeholder="e.g. K7M2QX" autocapitalize="characters" style="letter-spacing:2px;text-transform:uppercase"></label>' +
      '<div class="ui-error" id="sp-err"></div>' +
      '<div class="ui-actions"><button class="ui-btn primary" id="sp-go">Join group</button></div>';
    body.querySelector('#sp-b').onclick = () => showList(ctx);
    const input = body.querySelector('#sp-code');
    setTimeout(() => input.focus(), 100);
    const go = async () => {
      const r = await api('/api/splits/join', jsonOpts('POST', { code: input.value }));
      if (!r.ok) { body.querySelector('#sp-err').textContent = r.data.error || 'Could not join'; return; }
      showGroup(ctx, r.data.id);
    };
    body.querySelector('#sp-go').onclick = go;
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
  }

  // ------------------------- one group -------------------------
  async function showGroup(ctx, gid, silent) {
    const { body } = ctx;
    ctx.view = 'group';
    ctx.gid = gid;
    if (!silent) body.innerHTML = '<div class="muted small">Loading…</div>';
    const r = await api('/api/splits/groups/' + gid);
    if (!r.ok) {
      if (r.data.error === 'Group not found') { toast('This group is no longer available'); showList(ctx); return; }
      body.innerHTML = '<button class="sp-back" id="sp-b">‹ Back</button><div class="ui-error">' +
        esc(r.data.error || 'Could not load') + '</div>';
      body.querySelector('#sp-b').onclick = () => showList(ctx);
      return;
    }
    const d = r.data;
    const me = d.me;
    const nameOf = id => id === me ? 'You' : ((d.members.find(m => m.id === id) || (d.former || []).find(m => m.id === id) || {}).name || 'Someone');
    const myBal = d.balances[me] || 0;

    const memberOf = id => d.members.find(m => m.id === id) || (d.former || []).find(m => m.id === id) || { id, name: 'Someone' };
    const dn = id => id === me ? 'You' : memberOf(id).name;           // display name
    const av = (id, small) => avatar(memberOf(id), small);

    const heroLabel = myBal > 0 ? 'YOU GET BACK' : myBal < 0 ? 'YOU OWE' : 'YOU ARE ALL SETTLED';
    const heroAmt = myBal === 0 ? '✓' : money(myBal);
    const totalSpent = d.expenses.reduce((s, e) => s + e.amount, 0);

    // Members: you first, everyone as a clear chip with a coloured initial
    const membersHtml = [...d.members].sort((a, b) => (b.id === me) - (a.id === me)).map(m =>
      `<span class="sp-mchip${m.id === me ? ' me' : ''}">${av(m.id)}<b>${esc(dn(m.id))}</b></span>`).join('');

    // Who pays whom: person → arrow with amount → person. Yours stand out: red = you pay, green = you receive.
    const transfersHtml = d.transfers.length
      ? d.transfers.map((t, i) => {
          const kind = t.from === me ? 'out' : t.to === me ? 'in' : 'other';
          const flag = kind === 'out' ? '<span class="sp-flag out">⬆ YOU PAY</span>'
            : kind === 'in' ? '<span class="sp-flag in">⬇ YOU RECEIVE</span>'
            : '<span class="sp-flag">BETWEEN OTHERS</span>';
          const btn = kind === 'out' ? `<button class="ui-btn sp-mark pay" data-pay="${i}">I’ve paid ${money(t.amount)}</button>`
            : kind === 'in' ? `<button class="ui-btn sp-mark recv" data-pay="${i}">Mark as received</button>` : '';
          return `<div class="sp-flow ${kind}">
            ${flag}
            <div class="sp-flow-row">
              <div class="sp-person">${av(t.from)}<span>${esc(dn(t.from))}</span><small>pays</small></div>
              <div class="sp-arrow"><b>${money(t.amount)}</b><i></i></div>
              <div class="sp-person">${av(t.to)}<span>${esc(dn(t.to))}</span><small>receives</small></div>
            </div>
            ${btn}
          </div>`;
        }).join('')
      : '<div class="sp-empty">🎉 Nobody owes anything. Everyone is even.</div>';

    // Who paid the most: ranked, with bars
    const paidBy = {};
    d.members.forEach(m => { paidBy[m.id] = 0; });
    d.expenses.forEach(e => { paidBy[e.paid_by] = (paidBy[e.paid_by] || 0) + e.amount; });
    const ranked = [...d.members].sort((a, b) => paidBy[b.id] - paidBy[a.id] || a.name.localeCompare(b.name));
    const maxPaid = Math.max(1, ...ranked.map(m => paidBy[m.id]));
    const medals = ['🥇', '🥈', '🥉'];
    const rankHtml = totalSpent > 0 ? ranked.map((m, i) => {
      const bal = d.balances[m.id] || 0;
      const stat = bal > 0 ? `<span class="sp-rstat get">gets back ${money(bal)}</span>`
        : bal < 0 ? `<span class="sp-rstat owe">owes ${money(bal)}</span>`
        : '<span class="sp-rstat">settled</span>';
      const w = paidBy[m.id] > 0 ? Math.max(3, Math.round(paidBy[m.id] / maxPaid * 100)) : 0;
      return `<div class="sp-rank">
        <div class="sp-rank-top"><span class="sp-medal">${paidBy[m.id] > 0 && i < 3 ? medals[i] : (i + 1)}</span>${av(m.id)}
          <span class="sp-rname">${esc(dn(m.id))}</span><b>${money(paidBy[m.id])}</b></div>
        <div class="sp-bar"><i style="width:${w}%"></i></div>
        ${stat}
      </div>`;
    }).join('') : '';

    // Expense cards
    const expHtml = d.expenses.length
      ? d.expenses.map(e => {
          const mine = e.shares.find(s => s.user_id === me);
          return `<div class="sp-exp">
            <div class="sp-exp-top"><span class="sp-exp-title">${esc(e.title)}</span><b>${money(e.amount)}</b></div>
            <div class="sp-exp-meta">${av(e.paid_by, true)}<span><b>${esc(dn(e.paid_by))}</b> paid · ${dateLabel(e.date)}</span></div>
            <div class="sp-pills">
              <span class="sp-pill">Split ${e.shares.length} way${e.shares.length === 1 ? '' : 's'}</span>
              ${mine ? `<span class="sp-pill mine">Your share ${money(mine.share)}</span>` : '<span class="sp-pill">You’re not in this split</span>'}
            </div>
            <div class="sp-item-actions">
              ${mine && mine.share > 0
                ? (e.addedToTracker
                    ? '<span class="sp-sub">✓ In your expenses</span>'
                    : `<button class="ui-btn" data-track="${e.id}" data-share="${mine.share}" data-title="${esc(e.title)}">＋ Add to my expenses</button>`)
                : ''}
              ${e.added_by === me ? `<button class="ui-btn danger" data-del="${e.id}">Delete</button>` : ''}
            </div>
          </div>`;
        }).join('')
      : '<div class="sp-empty">Nothing added yet. Tap “Add expense to split” to start.</div>';

    const setHtml = d.settlements.length
      ? d.settlements.map(s => `<div class="sp-exp">
          <div class="sp-exp-top"><span class="sp-exp-title">${esc(dn(s.from_user))} → ${esc(dn(s.to_user))}</span><b>${money(s.amount)}</b></div>
          <div class="sp-exp-meta"><span>Marked as paid</span></div>
          ${s.created_by === me ? `<div class="sp-item-actions"><button class="ui-btn danger" data-undo="${s.id}">Undo</button></div>` : ''}
        </div>`).join('')
      : '';

    body.innerHTML = `
      <div class="sp-top"><button class="sp-back" id="sp-b">‹ All groups</button>
        <button class="ui-btn" id="sp-share">Invite code <span class="sp-code">${esc(d.group.code)}</span></button></div>
      <div class="sp-gname">${esc(d.group.name)}</div>
      <div class="sp-members">${membersHtml}</div>
      <div class="sp-hero${myBal < 0 ? ' owe' : ''}"><small>${heroLabel}</small><b>${heroAmt}</b>
        <span>Group total ${money(totalSpent)} · ${d.members.length} ${d.members.length === 1 ? 'person' : 'people'}</span></div>
      <div class="ui-actions" style="justify-content:flex-start;margin-top:12px"><button class="ui-btn primary" id="sp-add">+ Add expense to split</button></div>
      <div class="sp-title">WHO PAYS WHOM</div>${transfersHtml}
      ${rankHtml ? `<div class="sp-title">WHO PAID THE MOST</div>${rankHtml}` : ''}
      <div class="sp-title">EXPENSES</div>${expHtml}
      ${setHtml ? `<div class="sp-title">PAYMENTS MADE</div>${setHtml}` : ''}
      <div class="sp-title">GROUP OPTIONS</div>
      <div class="sp-opts">
        <div class="sp-opt-note ${d.group.canLeave ? 'ok' : 'warn'}">${d.group.canLeave
          ? '✓ You’re settled up, so you can leave this group.'
          : '⚠ Settle up first: you ' + (myBal > 0 ? 'are still owed ' : 'still owe ') + money(myBal) + '. Then you can leave.'}</div>
        <div class="sp-opt-btns">
          <button class="ui-btn" id="sp-leave" ${d.group.canLeave ? '' : 'disabled'}>Leave group</button>
          ${d.group.canDelete ? '<button class="ui-btn danger" id="sp-delgroup">Delete group</button>' : ''}
        </div>
        ${d.group.canDelete ? '' : `<div class="sp-note">${d.group.allSettled
          ? 'Only the person who created the group can delete it.'
          : 'The group can be deleted once everyone is settled up.'}</div>`}
      </div>
      <div class="sp-live"><span class="sp-dot"></span>Live · changes appear instantly for everyone</div>
      <div class="sp-note" style="text-align:center">Only the person who added an entry can delete it.</div>`;

    body.querySelector('#sp-b').onclick = () => showList(ctx);
    body.querySelector('#sp-add').onclick = () => showAddExpense(ctx, d);
    refreshBadgeSoon();
    const leaveBtn = body.querySelector('#sp-leave');
    if (leaveBtn) leaveBtn.onclick = () => leaveFlow(ctx, d);
    const delBtn = body.querySelector('#sp-delgroup');
    if (delBtn) delBtn.onclick = () => deleteGroupFlow(ctx, d);
    body.querySelector('#sp-share').onclick = async () => {
      const text = 'Join my group "' + d.group.name + '" on Expense Tracker. Invite code: ' + d.group.code;
      if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { /* cancelled */ } }
      try { await navigator.clipboard.writeText(text); toast('Invite copied'); }
      catch (e) { toast('Code: ' + d.group.code); }
    };

    body.querySelectorAll('[data-pay]').forEach(btn => {
      btn.onclick = async () => {
        const t = d.transfers[Number(btn.dataset.pay)];
        const ok = await confirmModal('Mark as paid',
          [nameOf(t.from) + ' paid ' + nameOf(t.to) + ' ' + money(t.amount) + '?',
           'This only records it. No money moves through the app.'], 'Yes, paid');
        if (!ok) return;
        const rr = await api('/api/splits/groups/' + gid + '/settlements',
          jsonOpts('POST', { from: t.from, to: t.to, amount: t.amount }));
        if (!rr.ok) toast(rr.data.error || 'Could not save');
        showGroup(ctx, gid);
      };
    });
    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        if (!(await confirmModal('Delete entry', ['Remove this from the group? Balances will update for everyone.'], 'Delete'))) return;
        const rr = await api('/api/splits/expenses/' + btn.dataset.del, { method: 'DELETE' });
        if (!rr.ok) toast(rr.data.error || 'Could not delete');
        showGroup(ctx, gid);
      };
    });
    body.querySelectorAll('[data-undo]').forEach(btn => {
      btn.onclick = async () => {
        const rr = await api('/api/splits/settlements/' + btn.dataset.undo, { method: 'DELETE' });
        if (!rr.ok) toast(rr.data.error || 'Could not undo');
        showGroup(ctx, gid);
      };
    });
    body.querySelectorAll('[data-track]').forEach(btn => {
      btn.onclick = () => askCategoryAndAdd(btn.dataset.track, Number(btn.dataset.share), btn.dataset.title, () => showGroup(ctx, gid));
    });
  }

  // ------------------------- leave / delete a group -------------------------
  async function doLeave(ctx, d, deleteGroup, closeFn) {
    const r = await api('/api/splits/groups/' + d.group.id + '/leave', jsonOpts('POST', { deleteGroup }));
    if (closeFn) closeFn();
    if (!r.ok) { toast(r.data.error || 'Could not leave'); showGroup(ctx, d.group.id, true); return; }
    toast(r.data.deleted ? 'Group deleted' : 'You left the group');
    showList(ctx);
  }

  async function leaveFlow(ctx, d) {
    const name = d.group.name;
    if (d.members.length > 1) {
      const ok = await confirmModal('Leave group',
        ['Leave “' + name + '”?', 'Your past entries stay in the group’s history. You can rejoin later with the invite code.'], 'Leave');
      if (ok) doLeave(ctx, d, false);
      return;
    }
    // last person in the group: leave it behind, or delete it?
    const { body, close } = openModal('Leave group');
    body.innerHTML =
      '<div style="font-size:14px;margin-bottom:14px">You are the last person in “' + esc(name) + '”. What should happen to the group?</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
        '<button class="ui-btn danger" id="lv-del">Leave and delete the group</button>' +
        '<button class="ui-btn" id="lv-keep">Leave, but keep the group</button>' +
        '<button class="ui-btn" id="lv-no">Cancel</button></div>' +
      '<div class="sp-note">A kept group stays saved. Anyone with its invite code, including you, can join it again.</div>';
    body.querySelector('#lv-no').onclick = close;
    body.querySelector('#lv-keep').onclick = () => doLeave(ctx, d, false, close);
    body.querySelector('#lv-del').onclick = () => doLeave(ctx, d, true, close);
  }

  async function deleteGroupFlow(ctx, d) {
    const n = d.members.length;
    const ok = await confirmModal('Delete group',
      ['Delete “' + d.group.name + '” for ' + (n === 1 ? 'good' : 'all ' + n + ' members') + '?',
       'All its expenses and payments are removed for everyone. This can’t be undone.'], 'Delete group');
    if (!ok) return;
    const r = await api('/api/splits/groups/' + d.group.id, { method: 'DELETE' });
    if (!r.ok) { toast(r.data.error || 'Could not delete the group'); return; }
    toast('Group deleted');
    showList(ctx);
  }

  // Pick a category, then copy MY share into my own tracker
  function askCategoryAndAdd(expenseId, sharePaise, title, done) {
    const { body, close } = openModal('Add my share');
    body.innerHTML =
      '<div style="font-size:14px;margin-bottom:12px">Add <b>' + money(sharePaise) + '</b> for “' + esc(title) + '” to your own expenses?</div>' +
      '<label class="ui-field">Category<select id="sp-cat">' +
        Object.keys(CATEGORY_ICONS).map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label>' +
      '<div class="ui-error" id="sp-err"></div>' +
      '<div class="ui-actions"><button class="ui-btn" id="sp-no">Cancel</button><button class="ui-btn primary" id="sp-yes">Add</button></div>';
    body.querySelector('#sp-no').onclick = close;
    body.querySelector('#sp-yes').onclick = async () => {
      const r = await api('/api/splits/expenses/' + expenseId + '/add-to-tracker',
        jsonOpts('POST', { category: body.querySelector('#sp-cat').value }));
      if (!r.ok) { body.querySelector('#sp-err').textContent = r.data.error || 'Could not add'; return; }
      close();
      toast('Added to your expenses');
      if (typeof loadAllExpenses === 'function') await loadAllExpenses();  // refresh totals and budget alerts
      done();
    };
  }

  // ------------------------- add something to split -------------------------
  function showAddExpense(ctx, d) {
    const { body } = ctx;
    ctx.view = 'form';
    const me = d.me;
    body.innerHTML =
      '<button class="sp-back" id="sp-b">‹ Back</button>' +
      '<label class="ui-field">What was it for?<input id="sp-title" maxlength="60" placeholder="e.g. Taxi"></label>' +
      '<label class="ui-field">Amount paid (₹)<input id="sp-amt" type="number" step="0.01" inputmode="decimal" placeholder="0.00"></label>' +
      '<label class="ui-field">Paid by<select id="sp-paidby">' +
        d.members.map(m => '<option value="' + m.id + '"' + (m.id === me ? ' selected' : '') + '>' + esc(m.id === me ? 'You' : m.name) + '</option>').join('') +
      '</select></label>' +
      '<label class="ui-field">Date<input id="sp-date" type="date" value="' + esc(todayStr()) + '"></label>' +
      '<div class="ui-sec" style="margin-top:4px">SPLIT EQUALLY BETWEEN</div>' +
      '<div class="sp-checks">' +
        d.members.map(m => '<label class="sp-check"><input type="checkbox" class="sp-who" value="' + m.id + '" checked>' + esc(m.id === me ? 'You' : m.name) + '</label>').join('') +
      '</div>' +
      '<div class="sp-preview" id="sp-prev"></div>' +
      '<div class="ui-error" id="sp-err"></div>' +
      '<div class="ui-actions"><button class="ui-btn primary" id="sp-save">Add to group</button></div>';

    const amt = body.querySelector('#sp-amt');
    const prev = body.querySelector('#sp-prev');
    const checked = () => [...body.querySelectorAll('.sp-who:checked')].map(c => Number(c.value));
    function updatePreview() {
      const n = checked().length, paise = Math.round(Number(amt.value) * 100);
      if (!n || !(paise > 0)) { prev.textContent = ''; return; }
      const lo = Math.floor(paise / n), hi = paise % n ? lo + 1 : lo;
      prev.textContent = n + ' way' + (n === 1 ? '' : 's') + ': ' + (lo === hi ? money(lo) + ' each' : money(lo) + ' to ' + money(hi) + ' each');
    }
    amt.addEventListener('input', updatePreview);
    body.querySelectorAll('.sp-who').forEach(c => c.addEventListener('change', updatePreview));
    body.querySelector('#sp-b').onclick = () => showGroup(ctx, d.group.id);
    setTimeout(() => body.querySelector('#sp-title').focus(), 100);

    body.querySelector('#sp-save').onclick = async () => {
      const err = body.querySelector('#sp-err');
      err.textContent = '';
      const r = await api('/api/splits/groups/' + d.group.id + '/expenses', jsonOpts('POST', {
        title: body.querySelector('#sp-title').value,
        amount: amt.value,
        paidBy: Number(body.querySelector('#sp-paidby').value),
        date: body.querySelector('#sp-date').value,
        splitAmong: checked()
      }));
      if (!r.ok) { err.textContent = r.data.error || 'Could not save'; return; }
      showGroup(ctx, d.group.id);
    };
  }
})();