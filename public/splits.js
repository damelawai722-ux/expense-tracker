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
      .sp-owe { color:var(--danger); font-weight:800; white-space:nowrap; font-size:13px; }
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
  }
  window.openSplits = openSplits;

  // Live updates: the server pings us when a group changes; we quietly re-fetch.
  function startLive(ctx) {
    if (typeof EventSource === 'undefined') return;   // very old browser: Refresh button still works
    const es = new EventSource('/api/splits/stream');
    let timer = null, opened = false;
    const refresh = (groupId) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (ctx.view === 'list') showList(ctx, true);
        else if (ctx.view === 'group' && (groupId == null || ctx.gid === groupId)) showGroup(ctx, ctx.gid, true);
        // while typing in a form we never redraw; the next screen fetches fresh data anyway
      }, 250);
    };
    // Safety net: if the live connection is not open (blocked, dropped, old browser),
    // quietly re-check every 5 seconds while the screen is visible.
    const poll = setInterval(() => {
      if (!ctx.body.isConnected) { clearInterval(poll); es.close(); return; }
      if (document.visibilityState === 'visible' && es.readyState !== 1) refresh(null);
    }, 5000);
    es.onopen = () => { if (opened) refresh(null); opened = true; };   // reconnected: catch up on anything missed
    es.onmessage = ev => {
      if (!ctx.body.isConnected) { es.close(); return; }               // Splits was closed
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'changed') refresh(m.g);
    };
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
      '</div>' +
      (groups.length
        ? groups.map(g =>
            '<div class="sp-row" data-g="' + g.id + '"><div><div class="sp-name">' + esc(g.name) + '</div>' +
            '<div class="sp-sub">' + g.members + (g.members === 1 ? ' member' : ' members') + '</div></div>' +
            statusHtml(g.myBalance) + '</div>').join('')
        : '<div class="empty">No groups yet.<br>Create one for a trip or a flat, then share the code with friends.</div>') +
      '<div id="sp-pushbox"></div>' +
      '<div class="sp-note">Keeps track only. No real money moves through the app.</div>';

    body.querySelector('#sp-new').onclick = () => showCreate(ctx);
    body.querySelector('#sp-join').onclick = () => showJoin(ctx);
    body.querySelectorAll('[data-g]').forEach(el => { el.onclick = () => showGroup(ctx, Number(el.dataset.g)); });
    setupPush(body.querySelector('#sp-pushbox'));
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
      body.innerHTML = '<button class="sp-back" id="sp-b">‹ Back</button><div class="ui-error">' +
        esc(r.data.error || 'Could not load') + '</div>';
      body.querySelector('#sp-b').onclick = () => showList(ctx);
      return;
    }
    const d = r.data;
    const me = d.me;
    const nameOf = id => id === me ? 'You' : ((d.members.find(m => m.id === id) || {}).name || 'Someone');
    const myBal = d.balances[me] || 0;

    const heroLabel = myBal > 0 ? 'YOU GET BACK' : myBal < 0 ? 'YOU OWE' : 'YOU ARE ALL SETTLED';
    const heroAmt = myBal === 0 ? '✓' : money(myBal);

    const transfersHtml = d.transfers.length
      ? d.transfers.map((t, i) =>
          '<div class="sp-pay"><span>' + (t.from === me ? '<b>You</b>' : esc(nameOf(t.from))) + ' pay' + (t.from === me ? '' : 's') + ' ' +
          (t.to === me ? '<b>you</b>' : esc(nameOf(t.to))) + ' <b>' + money(t.amount) + '</b></span>' +
          ((t.from === me || t.to === me)
            ? '<button class="ui-btn" data-pay="' + i + '">Mark as paid</button>' : '') + '</div>').join('')
      : '<div class="muted small">Nobody owes anything.</div>';

    const expHtml = d.expenses.length
      ? d.expenses.map(e => {
          const mine = e.shares.find(s => s.user_id === me);
          return '<div class="sp-item"><div class="sp-item-head"><span>' + esc(e.title) + '</span><span>' + money(e.amount) + '</span></div>' +
            '<div class="sp-sub">' + esc(nameOf(e.paid_by)) + ' paid · ' + dateLabel(e.date) + ' · split ' + e.shares.length + ' way' + (e.shares.length === 1 ? '' : 's') +
            (mine ? ' · your share ' + money(mine.share) : ' · not in this split') + '</div>' +
            '<div class="sp-item-actions">' +
              (mine && mine.share > 0
                ? (e.addedToTracker
                    ? '<span class="sp-sub">✓ In your expenses</span>'
                    : '<button class="ui-btn" data-track="' + e.id + '" data-share="' + mine.share + '" data-title="' + esc(e.title) + '">Add my share to my expenses</button>')
                : '') +
              (e.added_by === me ? '<button class="ui-btn danger" data-del="' + e.id + '">Delete</button>' : '') +
            '</div></div>';
        }).join('')
      : '<div class="muted small">Nothing added yet.</div>';

    const setHtml = d.settlements.length
      ? d.settlements.map(s =>
          '<div class="sp-item"><div class="sp-item-head"><span>' + esc(nameOf(s.from_user)) + ' paid ' + esc(nameOf(s.to_user)) + '</span><span>' + money(s.amount) + '</span></div>' +
          (s.created_by === me ? '<div class="sp-item-actions"><button class="ui-btn danger" data-undo="' + s.id + '">Undo</button></div>' : '') +
          '</div>').join('')
      : '';

    body.innerHTML =
      '<div class="sp-top"><button class="sp-back" id="sp-b">‹ All groups</button>' +
        '<button class="ui-btn" id="sp-share">Code <span class="sp-code">' + esc(d.group.code) + '</span></button></div>' +
      '<div class="sp-name" style="font-size:18px">' + esc(d.group.name) + '</div>' +
      '<div class="sp-sub" style="margin-bottom:12px">' + d.members.map(m => esc(m.id === me ? 'You' : m.name)).join(', ') + '</div>' +
      '<div class="sp-hero"><small>' + heroLabel + '</small><b>' + heroAmt + '</b></div>' +
      '<div class="ui-sec">WHO PAYS WHOM</div>' + transfersHtml +
      '<div class="ui-actions" style="justify-content:flex-start"><button class="ui-btn primary" id="sp-add">+ Add expense to split</button>' +
        '<button class="ui-btn" id="sp-refresh">Refresh</button></div>' +
      '<div class="ui-sec">EXPENSES</div>' + expHtml +
      (setHtml ? '<div class="ui-sec">PAYMENTS MADE</div>' + setHtml : '') +
      '<div class="sp-note">Updates when you open or refresh. Only the person who added an entry can delete it.</div>';

    body.querySelector('#sp-b').onclick = () => showList(ctx);
    body.querySelector('#sp-refresh').onclick = () => showGroup(ctx, gid);
    body.querySelector('#sp-add').onclick = () => showAddExpense(ctx, d);
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