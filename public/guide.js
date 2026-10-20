// =====================================================================
// GUIDE: welcome tour (first launch), Help screen (Settings), Splits explainer
// Loaded after app.js and splits.js. Uses: openModal, showView, currentUser
// "Seen" flags are kept per user, in this browser's localStorage.
// =====================================================================
(function () {

// ---------- "seen" flags ----------
const uid = () => String(window.myUserId || (typeof currentUser !== 'undefined' ? currentUser : '') || 'x');
const flagKey = name => 'guide:' + name + ':' + uid();
function seen(name) {
  try { return localStorage.getItem(flagKey(name)) === '1'; }
  catch (e) { return true; }                 // storage blocked: never nag
}
function markSeen(name) {
  try { localStorage.setItem(flagKey(name), '1'); } catch (e) { /* ignore */ }
}

// ---------- styles (match the app's theme variables) ----------
function injectGuideStyles() {
  if (document.getElementById('gd-styles')) return;
  const s = document.createElement('style');
  s.id = 'gd-styles';
  s.textContent = `
    .gd-count { font-size:11px; font-weight:700; letter-spacing:1px; color:var(--muted); text-align:center; margin-bottom:10px; }
    .gd-step { text-align:center; min-height:250px; }
    .gd-ico { width:72px; height:72px; margin:0 auto 14px; border-radius:24px; display:grid; place-items:center;
              font-size:36px; background:linear-gradient(145deg,var(--hero-1),var(--hero-2)); }
    .gd-title { font-size:19px; font-weight:800; margin-bottom:10px; }
    .gd-text { font-size:14px; line-height:1.55; text-align:left; opacity:.9; }
    .gd-text p { margin-bottom:8px; }
    .gd-text ul { padding-left:18px; margin:6px 0 8px; }
    .gd-text li { margin-bottom:5px; }
    .gd-tip { margin-top:10px; padding:10px 12px; border-radius:12px; background:var(--bg); border:1px solid var(--border);
              font-size:13px; text-align:left; }
    .gd-dots { display:flex; justify-content:center; gap:6px; margin:14px 0 2px; }
    .gd-dots i { width:7px; height:7px; border-radius:7px; background:var(--border); transition:width .2s, background .2s; }
    .gd-dots i.on { width:20px; background:var(--bar-on); }
    .gd-help details { border:1px solid var(--border); border-radius:14px; margin-bottom:8px; background:var(--bg); }
    .gd-help summary { cursor:pointer; padding:13px 14px; font-weight:700; font-size:14px; list-style:none; display:flex; align-items:center; gap:10px; }
    .gd-help summary::-webkit-details-marker { display:none; }
    .gd-help summary::after { content:'›'; margin-left:auto; font-size:20px; color:var(--muted); transition:transform .2s; }
    .gd-help details[open] summary::after { transform:rotate(90deg); }
    .gd-help .gd-body { padding:0 14px 14px; font-size:13.5px; line-height:1.55; }
    .gd-help .gd-body p { margin-bottom:8px; }
    .gd-help .gd-body ul { padding-left:18px; margin:4px 0 8px; }
    .gd-help .gd-body li { margin-bottom:4px; }
    .gd-intro { font-size:13px; color:var(--muted); margin-bottom:12px; }
    @media (prefers-reduced-motion: reduce) { .gd-dots i, .gd-help summary::after { transition:none; } }
  `;
  document.head.appendChild(s);
}

// ---------- generic step-by-step tour ----------
function runTour(title, steps, onClose) {
  injectGuideStyles();
  let i = 0;
  const { body, close } = openModal(title, { onClose });

  function draw() {
    const s = steps[i];
    const first = i === 0, last = i === steps.length - 1;
    body.innerHTML =
      '<div class="gd-count">' + (i + 1) + ' of ' + steps.length + '</div>' +
      '<div class="gd-step">' +
        '<div class="gd-ico">' + s.icon + '</div>' +
        '<div class="gd-title">' + s.title + '</div>' +
        '<div class="gd-text">' + s.html + '</div>' +
        (s.tip ? '<div class="gd-tip">💡 ' + s.tip + '</div>' : '') +
      '</div>' +
      '<div class="gd-dots">' + steps.map((_, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="ui-actions">' +
        (first ? '' : '<button class="ui-btn" id="gd-back">Back</button>') +
        (last ? '' : '<button class="ui-btn" id="gd-skip">Skip</button>') +
        '<button class="ui-btn primary" id="gd-next">' + (last ? 'Got it' : 'Next') + '</button>' +
      '</div>';
    const back = body.querySelector('#gd-back');
    if (back) back.onclick = () => { i--; draw(); };
    const skip = body.querySelector('#gd-skip');
    if (skip) skip.onclick = close;
    body.querySelector('#gd-next').onclick = () => { if (last) close(); else { i++; draw(); } };
  }
  draw();
}
// ---------- Spotlight tour: a guide walks you through the app room by room ----------
function runSpotlightTour(steps, onClose) {
  if (!document.getElementById('gt-styles')) {
    const st = document.createElement('style');
    st.id = 'gt-styles';
    st.textContent = `
      .gt-block{position:fixed;inset:0;z-index:950}
      .gt-spot{position:fixed;z-index:951;border-radius:18px;pointer-events:none;transition:all .3s;
        box-shadow:0 0 0 9999px rgba(0,0,0,.65),0 0 0 3px var(--lime)}
      .gt-arrow{position:fixed;z-index:952;font-size:28px;line-height:1;pointer-events:none;animation:gtBob .7s infinite alternate}
      @keyframes gtBob{to{transform:translateY(8px)}}
      .gt-card{position:fixed;z-index:953;left:50%;transform:translateX(-50%);width:min(92vw,420px);
        background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:22px;
        padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.4)}
      .gt-who{display:flex;align-items:center;gap:10px;margin-bottom:8px}
      .gt-av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:24px;
        background:linear-gradient(145deg,var(--hero-1),var(--hero-2))}
      .gt-room{font-size:11px;font-weight:800;letter-spacing:1px;color:var(--muted)}
      .gt-name{font-weight:800;font-size:14px}
      .gt-say{font-size:14px;line-height:1.5}`;
    document.head.appendChild(st);
  }
  let i = 0;
  const block = document.createElement('div'); block.className = 'gt-block';
  const spot = document.createElement('div');  spot.className = 'gt-spot';
  const arrow = document.createElement('div'); arrow.className = 'gt-arrow';
  const card = document.createElement('div');  card.className = 'gt-card';
  document.body.append(block, spot, arrow, card);

  function place() {
    const s = steps[i], last = i === steps.length - 1;
    const el = s.sel && document.querySelector(s.sel);
    card.innerHTML =
      '<div class="gt-who"><div class="gt-av" style="background:url(guide.png) center/cover"></div><div><div class="gt-name">Dame, your guide</div>' +
      '<div class="gt-room">' + s.who + '</div></div></div>' +
      '<div class="gt-say">' + s.say + '</div>' +
      '<div class="ui-actions">' +
        (i ? '<button class="ui-btn" id="gt-back">Back</button>' : '') +
        (last ? '' : '<button class="ui-btn" id="gt-skip">Skip</button>') +
        '<button class="ui-btn primary" id="gt-next">' + (last ? 'Finish' : 'Next') + '</button></div>';
    card.querySelector('#gt-next').onclick = () => last ? finish() : go(i + 1);
    const b = card.querySelector('#gt-back'); if (b) b.onclick = () => go(i - 1);
    const k = card.querySelector('#gt-skip'); if (k) k.onclick = finish;

    if (!el) {                                   // no target: centred card on a dimmed screen
      spot.style.display = arrow.style.display = 'none';
      block.style.background = 'rgba(0,0,0,.65)';
      Object.assign(card.style, { top: '50%', bottom: 'auto', transform: 'translate(-50%,-50%)' });
      return;
    }
    block.style.background = 'transparent';
    const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { display: 'block', top: r.top - pad + 'px', left: r.left - pad + 'px',
      width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const topHalf = r.top + r.height / 2 < innerHeight / 2;   // target high up: card goes low, and vice versa
    card.style.transform = 'translateX(-50%)';
    card.style.top = topHalf ? 'auto' : '16px';
    card.style.bottom = topHalf ? '16px' : 'auto';
    arrow.style.display = 'block';
    arrow.textContent = topHalf ? '👆' : '👇';
    arrow.style.left = r.left + r.width / 2 - 14 + 'px';
    arrow.style.top = (topHalf ? r.bottom + pad + 2 : r.top - pad - 34) + 'px';
  }
  function go(n) {
    i = n;
    const s = steps[i];
    if (s.view) showView(s.view);                // takes the screen to the right room
    const el = s.sel && document.querySelector(s.sel);
    if (el) el.scrollIntoView({ block: 'center' });
    setTimeout(place, 150);
  }
  const onKey = ev => { if (ev.key === 'Escape') finish(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  function finish() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    [block, spot, arrow, card].forEach(x => x.remove());
    showView('home');
    if (onClose) onClose();
  }
  go(0);
}

const WELCOME_TOUR = [
  { view: 'home', who: 'WELCOME', say: "Welcome in! I'm Dame, and I'll show you around, step by step. Follow me!" },
  { view: 'home', sel: '.hero', who: 'THE LIVING ROOM · HOME', say: "This is the main part. The big card shows everything you've spent this month." },
  { view: 'home', sel: '#budget-display', who: 'THE LIVING ROOM · HOME', say: "Tap here to set a monthly budget. The bar fills as you spend, and you'll get a warning at 75%, 90% and 100%." },
  { view: 'home', sel: '#month-bar', who: 'THE CALENDAR WALL', say: "Use the arrows, or tap the month name, to visit any month or year. Every month has its own budget." },
  { view: 'home', sel: '#quick-actions', who: 'THE UTILITY CORNER', say: "Budgets sets a limit for each category, Insights shows what was worth it or a regret, and Splits shares costs with friends." },
  { view: 'home', sel: '.fab', who: 'THE FRONT DOOR', say: "This + button is the front door. Tap it to add an expense. You can even scan a receipt from there." },
  { view: 'expenses', sel: '.search-row', who: 'THE STUDY · EXPENSES', say: "Every expense lives in here, grouped by day. Search by note, amount or date, filter by category, or press Select to delete several at once." },
  { view: 'analytics', sel: '#view-analytics .card', who: 'THE GALLERY · ANALYTICS', say: "Your spending as charts: a bar for each day, and a ring showing where your money went." },
  { view: 'settings', sel: '.settings-list', who: 'THE CONTROL ROOM · SETTINGS', say: "Profile picture, theme colours, dark mode, export and password all live here. The Help button brings me back any time." },
  { view: 'home', who: 'END OF THE TOUR', say: "That's the whole house! Tap + to add your first expense. Enjoy yourself!!" }
];
// =====================================================================
//  1) WELCOME TOUR
// =====================================================================
const WELCOME_STEPS = [
  { icon: '👋', title: 'Welcome to Expense Tracker',
    html: '<p>Track what you spend, stay inside a monthly budget, and split costs with friends.</p>' +
          '<p>This quick tour shows how everything works. It takes about a minute.</p>',
    tip: 'You can open this guide again any time from Settings → Help &amp; guide.' },

  { icon: '➕', title: 'Add an expense',
    html: '<p>Tap the big <b>+</b> button at the bottom of the screen.</p>' +
          '<ul><li>Enter the amount, pick a category, add a note if you like, and check the date.</li>' +
          '<li>Press <b>Add expense</b> to save it.</li>' +
          '<li>Short on time? Use <b>Scan receipt</b> (camera) or <b>Upload</b> (a photo from your gallery). The app reads the receipt and fills the form for you.</li></ul>',
    tip: 'After a scan, check the highlighted fields before you press Add. The scan can make mistakes.' },

  { icon: '🏠', title: 'Your Home screen',
    html: '<p>The green card shows how much you have spent this month.</p>' +
          '<ul><li>Tap <b>set a budget</b> to choose a limit for the month. The bar fills as you spend and warns you at 75%, 90% and 100%.</li>' +
          '<li><b>Safe to spend today</b> turns your budget into a daily amount.</li>' +
          '<li>Use the arrows at the top, or tap the month name, to look at any other month. Each month has its own budget.</li>' +
          '<li>Tap any expense in <b>Recent</b> to edit or delete it.</li></ul>' },

  { icon: '📋', title: 'The Expenses tab',
    html: '<p>Every expense, grouped by day.</p>' +
          '<ul><li>Tap a category chip to filter.</li>' +
          '<li>Type in the search box to find an expense by note, category, amount or date. Search looks through all months.</li>' +
          '<li>Press <b>Select</b> to pick several expenses and delete them together.</li>' +
          '<li>The download icon at the top exports your data as CSV or PDF.</li></ul>' },

  { icon: '📊', title: 'Analytics',
    html: '<p>Two charts for the month you are viewing:</p>' +
          '<ul><li><b>Daily outlay</b>: a bar for each day you spent money.</li>' +
          '<li><b>By category</b>: a ring showing where your money went. Hover or press a slice to see its budget status.</li></ul>' },

  { icon: '🎯', title: 'Budgets and Insights',
    html: '<ul><li><b>Budgets</b> sets a limit for each category (Food, Travel and so on) for the month. A badge appears when one is close to its limit or over it.</li>' +
          '<li>If an expense would push you over a limit, the app asks you to confirm before saving it.</li>' +
          '<li><b>Insights</b> lets you mark expenses as 👍 <b>worth it</b> or 👎 <b>regret</b>, then shows how much of your spending falls into each.</li></ul>' },

  { icon: '🤝', title: 'Splits: share costs with friends',
    html: '<p>Use <b>Splits</b> for trips, flats and anything you share.</p>' +
          '<ul><li>Create a group and send the invite code to your friends.</li>' +
          '<li>Add each shared cost: who paid and who shares it.</li>' +
          '<li>The app works out who pays whom, so everyone settles with the fewest payments.</li></ul>',
    tip: 'The Splits button also has its own short guide the first time you open it.' },

  { icon: '⚙️', title: 'Settings',
    html: '<p>Open <b>Settings</b> (bottom right) to:</p>' +
          '<ul><li>Add a profile picture and your name.</li>' +
          '<li>Choose a theme colour and switch dark mode on or off.</li>' +
          '<li>Add a verified email so you can recover your account, and change your password.</li>' +
          '<li>Export your data or delete all expenses.</li></ul>' +
          '<p>That is everything. Tap <b>+</b> to add your first expense.</p>' }
];

function openWelcomeTour() {
  runSpotlightTour(WELCOME_TOUR, () => markSeen('welcome'));
}
// Called by app.js once the user is logged in and their data is loaded
window.maybeShowWelcomeGuide = function () {
  if (!seen('welcome')) openWelcomeTour();
};
window.openWelcomeTour = openWelcomeTour;

// =====================================================================
//  2) SPLITS EXPLAINER
// =====================================================================
const SPLITS_STEPS = [
  { icon: '👥', title: 'Create or join a group',
    html: '<p>A group is a set of people who share costs, such as a trip or a flat.</p>' +
          '<ul><li><b>New group</b>: give it a name, then share the invite code with your friends.</li>' +
          '<li><b>Join with code</b>: type a code a friend sent you.</li></ul>' },

  { icon: '🧾', title: 'Add what was spent',
    html: '<p>Inside a group, tap <b>Add expense to split</b>.</p>' +
          '<ul><li>Say what it was for and how much.</li>' +
          '<li>Choose who paid.</li>' +
          '<li>Tick the people who share it. The cost is split equally between them.</li></ul>',
    tip: 'Not everyone has to be in every split. Only tick the people who shared that cost.' },

  { icon: '🔁', title: 'See who pays whom',
    html: '<p><b>Who pays whom</b> shows the simplest way to settle up.</p>' +
          '<ul><li><b style="color:#ff453a">Red</b> card: you need to pay someone.</li>' +
          '<li><b style="color:#16a34a">Green</b> card: someone needs to pay you.</li>' +
          '<li>Dashed card: a payment between other people.</li></ul>' },

  { icon: '✅', title: 'Mark payments as paid',
    html: '<p>Paid someone back in cash or through UPI? Tap <b>I’ve paid</b>. If you were paid, tap <b>Mark as received</b>.</p>' +
          '<p>Balances update for everyone straight away.</p>',
    tip: 'The app only keeps track. No real money moves through it.' },

  { icon: '💼', title: 'Keep your own records',
    html: '<ul><li><b>Add to my expenses</b> copies your share of a split into your own tracker, so your budget stays accurate.</li>' +
          '<li>You can leave a group once you are settled up.</li>' +
          '<li>Changes appear live for everyone. Turn on notifications at the bottom of the group list to hear about new splits.</li></ul>' }
];

function openSplitsGuide() {
  runTour('How Splits work', SPLITS_STEPS, () => markSeen('splits'));
}
// Called by splits.js each time the Splits window opens; shows only the first time
window.maybeShowSplitsGuide = function () {
  if (!seen('splits')) openSplitsGuide();
};
window.openSplitsGuide = openSplitsGuide;

// =====================================================================
//  3) HELP SCREEN (Settings → Help & guide)
// =====================================================================
const HELP_TOPICS = [
  { icon: '➕', title: 'Adding expenses',
    html: '<p>Tap the <b>+</b> button, fill in the amount, category, note and date, then press <b>Add expense</b>.</p>' +
          '<p>If the expense would take a category or your monthly budget over its limit, the app asks you to confirm first.</p>' },

  { icon: '📷', title: 'Scanning a receipt',
    html: '<ul><li>On a phone, <b>Scan receipt</b> opens the camera and <b>Upload</b> picks a photo from your gallery. On a computer there is one <b>Upload receipt</b> button.</li>' +
          '<li>The app reads the amount, date, category and shop name and fills the form. Filled fields are outlined in orange.</li>' +
          '<li>Always check the fields and fix anything wrong before pressing Add.</li>' +
          '<li>If the AI reader is unavailable, a simpler scan is used automatically.</li></ul>' },

  { icon: '💰', title: 'Monthly budget and safe to spend',
    html: '<ul><li>Tap <b>set a budget</b> on Home, or use Settings → Monthly budget.</li>' +
          '<li>Budgets are per month. Setting one for October does not change November.</li>' +
          '<li>The bar turns orange at 75%, deeper orange at 90% and red at 100%.</li>' +
          '<li><b>Safe to spend today</b> divides what is left by the days remaining. From day 3 it also predicts whether you will finish the month over or under budget.</li></ul>' },

  { icon: '🎯', title: 'Category budgets',
    html: '<p>Set a separate limit for Food, Travel, Bills and the other categories. Leave a box empty for no limit.</p>' +
          '<p>A badge on the Budgets button shows how many categories are close to or over their limit. It is red if any is over.</p>' },

  { icon: '📋', title: 'Expenses tab: search, filter, select',
    html: '<ul><li>Tap an expense to edit or delete it.</li>' +
          '<li>Category chips filter the list.</li>' +
          '<li>The search box matches note, category, amount, date, “worth it” and “regret”, across all months.</li>' +
          '<li><b>Select</b> lets you tick several expenses and delete them in one go.</li></ul>' },

  { icon: '📊', title: 'Analytics',
    html: '<p><b>Daily outlay</b> shows how much you spent on each day of the month. <b>By category</b> shows the split of your spending. Use the month arrows to compare months.</p>' },

  { icon: '💡', title: 'Insights: worth it or regret',
    html: '<p>Rate expenses with 👍 or 👎, either when editing an expense or in <b>Insights</b>. Insights shows the share of your spending you feel good or bad about, and which categories you regret most.</p>' },

  { icon: '🤝', title: 'Splits',
    html: '<ul><li>Create a group, then share the invite code.</li>' +
          '<li>Add shared costs: who paid, and who shares them.</li>' +
          '<li><b>Who pays whom</b> gives the fewest payments needed to settle up.</li>' +
          '<li>Mark payments as paid or received. The app only keeps track; no money moves through it.</li>' +
          '<li><b>Add to my expenses</b> copies your share into your own tracker.</li>' +
          '<li>You can leave a group once you are settled up.</li></ul>' +
          '<button class="ui-btn" id="gd-open-splits-guide">Open the Splits guide</button>' },

  { icon: '⬇️', title: 'Exporting your data',
    html: '<p>Use the download icon on the Expenses tab, or Settings → Export data. Choose CSV for one month or all expenses, or PDF for a printable monthly report (pick “Save as PDF” in the print window).</p>' },

  { icon: '🔐', title: 'Account and password',
    html: '<p>In Settings, add a verified email under <b>Email &amp; password recovery</b> so you can get back in if you forget your password. <b>Change password</b> needs your current password.</p>' },

  { icon: '🗑️', title: 'Deleting data',
    html: '<p><b>Delete all expenses</b> in Settings removes every expense in every month. You must type DELETE to confirm. Your budgets, name, picture and split groups are not touched.</p>' }
];

function openHelp() {
  injectGuideStyles();
  const { body, close } = openModal('Help & guide', { wide: true });
  body.innerHTML =
    '<div class="gd-help">' +
      '<div class="gd-intro">Tap a topic to read how it works.</div>' +
      HELP_TOPICS.map(t =>
        '<details><summary><span>' + t.icon + '</span>' + t.title + '</summary>' +
        '<div class="gd-body">' + t.html + '</div></details>').join('') +
    '</div>' +
    '<div class="ui-actions">' +
      '<button class="ui-btn" id="gd-replay">Replay welcome tour</button>' +
      '<button class="ui-btn primary" id="gd-close">Close</button>' +
    '</div>';
  body.querySelector('#gd-close').onclick = close;
  body.querySelector('#gd-replay').onclick = () => { close(); openWelcomeTour(); };
  const sg = body.querySelector('#gd-open-splits-guide');
  if (sg) sg.onclick = () => { close(); openSplitsGuide(); };
}
window.openHelp = openHelp;

})();