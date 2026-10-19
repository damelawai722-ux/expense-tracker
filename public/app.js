if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Today's date in the user's LOCAL timezone (toISOString uses UTC and can show yesterday in India)
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
document.getElementById('date').value = todayStr();

let barChart, pieChart;
let allExpenses = [];
let viewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // day 1 avoids "Jan 31 + 1 month = March" bug
let currentUser = '';
let displayName = '';       // name shown on the home page (set in Settings)
let categoryBudgets = {};   // limits for the month being viewed, e.g. { Food: 3000, Bills: 2000 }
let monthlyBudget = 0;      // overall budget for the month being viewed
let lastDateMonth = '';     // month the Add form's date was last set for
let budgetCache = {};       // 'YYYY-MM' -> { overall, cats }  (budgets differ from month to month)

const CATEGORY_COLORS = {
  Food: '#F4A340', Travel: '#4C9AFF', Bills: '#7C6CF0',
  Entertainment: '#E86AA6', Shopping: '#2FBF8F', Health: '#EF5B5B', Other: '#9AA5A0'
};
const CATEGORY_ICONS = {
  Food: '🍔', Travel: '🚗', Bills: '🧾', Entertainment: '🎬', Shopping: '🛍️', Health: '💊', Other: '📦'
};

// 1234.5 -> "1,234.50" (Indian digit grouping)
function inr(n) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// read a colour from the current theme (so charts follow light/dark)
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

// ---- Small helpers ----
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// fetch wrapper: redirects on 401, returns { ok, data } with the server's JSON
async function api(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login.html';
    return { ok: false, data: { error: 'Not logged in' } };
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  return { ok: res.ok, data };
}
const jsonOpts = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

// ---- Theme toggle ----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀' : '🌙';
  const st = document.getElementById('theme-state');
  if (st) st.textContent = theme === 'dark' ? 'On' : 'Off';
  localStorage.setItem('theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  if (currentUser) renderAll();      // charts pick up the new colours
}
applyTheme(localStorage.getItem('theme') || 'light');

// ---- Colour themes (Settings > Theme color) ----
const COLOR_THEMES = {
  forest: { label: 'Forest', hero: '#1E5238', hero2: '#0F2E20', accent: '#C6F432' },
  ocean:  { label: 'Ocean',  hero: '#2468B8', hero2: '#0B2B52', accent: '#5CE1E6' },
  sunset: { label: 'Sunset', hero: '#D9531E', hero2: '#7C1D0A', accent: '#FFC857' },
  violet: { label: 'Violet', hero: '#6A4BD6', hero2: '#2B1A6B', accent: '#D6A8FF' },
  rose:   { label: 'Rose',   hero: '#C9235F', hero2: '#6B0F33', accent: '#FFB3CC' }
};
function applyColor(name) {
  if (!COLOR_THEMES[name]) name = 'forest';
  document.documentElement.setAttribute('data-color', name);
  localStorage.setItem('color', name);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLOR_THEMES[name].hero2);
  const st = document.getElementById('color-state');
  if (st) st.textContent = COLOR_THEMES[name].label;
  if (currentUser) renderAll();      // charts pick up the new colours
}
applyColor(localStorage.getItem('color') || 'forest');

// =====================================================================
//  MINIMAL MODAL (used by: edit expense, category budgets, month picker, export)
// =====================================================================
function injectUiStyles() {
  if (document.getElementById('ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'ui-styles';
  s.textContent = `
    .ui-toolbar { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 4px 0; }
    .ui-btn { border: 1px solid rgba(128,128,128,.35); background: transparent; color: inherit; font: inherit;
              font-size: 13px; padding: 8px 14px; border-radius: 999px; cursor: pointer; }
    .ui-btn:hover { background: rgba(128,128,128,.12); }
    .ui-btn.primary { background: #8B0000; border-color: #8B0000; color: #fff; }
    .ui-btn.primary:hover { background: #a00000; }
    .ui-btn.danger { color: #d62828; border-color: rgba(214,40,40,.5); }
    .ui-badge { display: inline-block; min-width: 18px; padding: 1px 6px; margin-left: 6px; border-radius: 999px;
                font-size: 11px; color: #fff; background: #d35400; }
    .ui-badge.danger { background: #d62828; }
    .ui-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center;
                  justify-content: center; padding: 16px; z-index: 900; }
    .ui-panel { width: 100%; max-width: 380px; max-height: 88vh; overflow-y: auto; border-radius: 16px; padding: 20px;
                box-shadow: 0 20px 50px rgba(0,0,0,.35); border: 1px solid rgba(128,128,128,.25); }
    .ui-panel h3 { margin: 0 0 14px; font-size: 16px; font-weight: 600; }
    .ui-field { display: block; margin-bottom: 12px; font-size: 12px; opacity: .9; }
    .ui-field input, .ui-field select { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 10px;
                font: inherit; font-size: 14px; color: inherit; background: transparent;
                border: 1px solid rgba(128,128,128,.4); border-radius: 8px; }
    .ui-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
    .ui-error { color: #d62828; font-size: 13px; min-height: 18px; margin-top: 4px; }
    .ui-hint { font-size: 11px; margin-top: 3px; opacity: .75; }
    .ui-hint.warn { color: #e67e22; opacity: 1; } .ui-hint.high { color: #d35400; opacity: 1; } .ui-hint.danger { color: #d62828; opacity: 1; }
    .ui-cat-row { display: grid; grid-template-columns: 1fr 120px; gap: 10px; align-items: start; padding: 8px 0;
                  border-top: 1px solid rgba(128,128,128,.2); }
    .ui-cat-row:first-of-type { border-top: 0; }
    .ui-cat-name { display: flex; align-items: center; gap: 8px; font-size: 14px; padding-top: 8px; }
    .ui-cat-row input { width: 100%; box-sizing: border-box; padding: 8px; font: inherit; font-size: 14px; color: inherit;
                        background: transparent; border: 1px solid rgba(128,128,128,.4); border-radius: 8px; }
    .ui-swatch { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .ui-picker-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
    .ui-picker-head select { flex: 1; padding: 8px; font: inherit; color: inherit; background: transparent;
                             border: 1px solid rgba(128,128,128,.4); border-radius: 8px; text-align: center; }
    .ui-months { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .ui-month { position: relative; padding: 12px 0; border-radius: 10px; border: 1px solid rgba(128,128,128,.3);
                background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
    .ui-month:hover { background: rgba(128,128,128,.14); }
    .ui-month.current { background: #8B0000; border-color: #8B0000; color: #fff; }
    .ui-month.has::after { content: ''; position: absolute; bottom: 5px; left: 50%; width: 4px; height: 4px; margin-left: -2px;
                           border-radius: 50%; background: currentColor; opacity: .7; }
    .ui-list-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .ui-list-sum { font-size: 12px; opacity: .75; text-align: right; }
    .ui-list { max-height: 58vh; overflow-y: auto; margin: 0 -8px; padding: 0 8px; }
    .ui-exp-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 12px;
                  margin-bottom: 6px; border: 1px solid rgba(128,128,128,.2); border-radius: 12px; cursor: pointer; }
    .ui-exp-row:hover { background: rgba(128,128,128,.12); }
    .ui-exp-main { min-width: 0; }
    .ui-exp-title { font-size: 14px; overflow-wrap: anywhere; }
    .ui-exp-cat { font-weight: 600; }
    .ui-exp-meta { font-size: 11px; opacity: .65; margin-top: 4px; }
    .ui-exp-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .ui-exp-amt { font-weight: 600; font-size: 14px; white-space: nowrap; }
    .ui-exp-go { font-size: 11px; opacity: .55; }
    .safe-box { margin-top: 14px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); }
    .safe-main { font-size: 15px; font-weight: 700; }
    .safe-main.warn { color: #e67e22; } .safe-main.danger { color: #d62828; }
    .safe-sub { font-size: 12px; color: var(--muted); margin-top: 5px; }
    .safe-sub.warn { color: #e67e22; }
    .ui-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: rgba(128,128,128,.25); margin: 4px 0 12px; }
    .ui-leg { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
    .ui-sec { font-size: 12px; font-weight: 600; letter-spacing: .5px; opacity: .75; margin: 18px 0 8px; }
    .ui-btn.primary { background: var(--lime); border-color: var(--lime); color: var(--on-lime); font-weight: 700; }
    .ui-btn.primary:hover { background: var(--lime); opacity: .9; }
    .ui-month.current { background: var(--lime); border-color: var(--lime); color: var(--on-lime); font-weight: 700; }
    .ui-panel { border-radius: 24px; }
    .qa-ico { font-size: 16px; }
    @media (max-width: 600px) {
      .ui-overlay { align-items: flex-end; padding: 0; }
      .ui-panel { max-width: none !important; border-radius: 26px 26px 0 0; max-height: 90vh; padding-bottom: 28px; }
    }
    .ui-menu-item { display: block; width: 100%; text-align: left; margin-bottom: 8px; border-radius: 10px; }
    .cb-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); max-width: 90vw;
                padding: 12px 16px; border-radius: 10px; color: #fff; background: #e67e22;
                box-shadow: 0 6px 20px rgba(0,0,0,.25); z-index: 1000; font-size: 14px; }
    .cb-toast.high { background: #d35400; }
    .cb-toast.danger { background: #d62828; }
    #month-label { cursor: pointer; }

    /* search + select on the Expenses tab */
    .search-row { display: flex; gap: 8px; align-items: center; margin-top: 14px; }
    .search-box { position: relative; flex: 1; min-width: 0; }
    .search-box svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 17px; height: 17px;
                      stroke: var(--muted); fill: none; stroke-width: 2; stroke-linecap: round; pointer-events: none; }
    .search-box input { width: 100%; min-width: 0; font: inherit; font-size: 16px; padding: 12px 40px 12px 40px;
                        border-radius: 999px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text); }
    .search-box input::-webkit-search-cancel-button { display: none; }
    .search-box input:focus { outline: 2px solid var(--bar-on); border-color: transparent; }
    .search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px;
                    border-radius: 50%; border: 0; background: var(--bg); color: var(--muted); cursor: pointer; font-size: 13px; }
    .search-clear[hidden] { display: none; }
    .expense-row .sel-box { width: 24px; height: 24px; border-radius: 8px; border: 2px solid var(--muted); flex-shrink: 0;
                            display: grid; place-items: center; font-size: 14px; font-weight: 800; color: var(--on-lime); }
    .expense-row.selected { border-color: var(--bar-on); }
    .expense-row.selected .sel-box { background: var(--lime); border-color: var(--lime); }
    .select-bar { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: 100%; max-width: 560px; z-index: 750;
                  display: flex; align-items: center; gap: 8px; background: var(--card-bg); border-top: 1px solid var(--border);
                  border-radius: 26px 26px 0 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
                  box-shadow: 0 -8px 24px rgba(0,0,0,.22); }
    .select-bar[hidden] { display: none; }
    .select-bar .sel-count { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; }
    .ui-btn:disabled { opacity: .4; cursor: not-allowed; }

    /* sweeping bar while a receipt is being read */
    .scan-progress { position: relative; height: 5px; border-radius: 5px; background: var(--border); overflow: hidden; margin: -4px 0 14px; }
    .scan-progress[hidden] { display: none; }
    .scan-progress i { position: absolute; top: 0; left: 0; height: 100%; width: 38%; border-radius: 5px;
                       background: linear-gradient(90deg, transparent, var(--bar-on) 35%, var(--bar-on) 65%, transparent);
                       animation: scanSweep 1.2s ease-in-out infinite; }
    @keyframes scanSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(265%); } }
  `;
  document.head.appendChild(s);
}

function openModal(title, opts) {
  injectUiStyles();
  const overlay = document.createElement('div');
  overlay.className = 'ui-overlay';
  const panel = document.createElement('div');
  panel.className = 'ui-panel';
  if (opts && opts.wide) panel.style.maxWidth = '520px';
  panel.style.background = 'var(--card-bg)';
  panel.style.color = 'var(--text)';
  panel.innerHTML = '<h3>' + esc(title) + '</h3><div class="ui-body"></div>';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const onKey = ev => { if (ev.key === 'Escape') close(); };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (opts && opts.onClose) opts.onClose();
  }
  overlay.addEventListener('mousedown', ev => { if (ev.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  return { body: panel.querySelector('.ui-body'), close };
}

// Small yes/no pop-up. Resolves true only if the OK button is pressed.
function confirmModal(title, lines, okText) {
  return new Promise(resolve => {
    let answer = false;
    const { body, close } = openModal(title, { onClose: () => resolve(answer) });
    body.innerHTML =
      lines.map(l => '<div style="margin-bottom:8px;font-size:14px">' + esc(l) + '</div>').join('') +
      '<div class="ui-actions">' +
        '<button class="ui-btn" id="cf-no">Cancel</button>' +
        '<button class="ui-btn primary" id="cf-yes">' + esc(okText) + '</button>' +
      '</div>';
    body.querySelector('#cf-no').onclick = close;
    body.querySelector('#cf-yes').onclick = () => { answer = true; close(); };
  });
}

// ---- Budgets are per month ----
// Each month has its own budget. A month you haven't set shows no budget.
function monthLabelOf(d) {
  return MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
}

const budgetLoading = {};
function ensureBudgets(monthStr) {
  if (budgetCache[monthStr]) return Promise.resolve(true);
  if (budgetLoading[monthStr]) return budgetLoading[monthStr];
  budgetLoading[monthStr] = (async () => {
    try {
      const [o, c] = await Promise.all([
        api('/api/budget?month=' + monthStr),
        api('/api/category-budgets?month=' + monthStr)
      ]);
      if (!o.ok || !c.ok) throw new Error('status');
      budgetCache[monthStr] = { overall: o.data.limit > 0 ? o.data.limit : 0, cats: c.data || {} };
      return true;
    } catch (err) {
      console.warn('Could not load budgets for ' + monthStr, err);
      return false;
    } finally {
      delete budgetLoading[monthStr];
    }
  })();
  return budgetLoading[monthStr];
}

function getBudget() { return monthlyBudget; }

async function editBudget() {
  const month = monthStrOf(viewDate);
  const val = prompt(
    'Budget for ' + monthLabelOf(viewDate) + ' (₹).\n' +
    'This only applies to this month.\nLeave empty or enter 0 for no budget:',
    monthlyBudget || '');
  if (val === null) return;
  const num = val.trim() === '' ? 0 : Math.round(parseFloat(val) * 100) / 100;
  if (isNaN(num) || num < 0) { alert('Please enter a valid amount'); return; }

  const r = await api('/api/budget', jsonOpts('PUT', { month, limit: num }));
  if (!r.ok) { alert(r.data.error || 'Could not save the budget'); return; }
  delete budgetCache[month];
  await ensureBudgets(month);
  renderAll();
}

// Text shown when you hover a category in the ring (or its row in the list)
function categoryTip(cat, spent) {
  const limit = categoryBudgets[cat];
  if (!(limit > 0)) return ['No limit set for ' + cat];
  const st = budgetState(spent, limit);
  const lines = ['₹' + spent.toFixed(2) + ' of ₹' + Number(limit).toFixed(2) + ' (' + Math.round(st.pct) + '%)'];
  if (st.msg) lines.push(st.msg);
  return lines;
}

// ---- Budget status: warnings + exceeded alerts ----
// Thresholds: 75% = heads-up, 90% = almost at limit, 100%+ = exceeded
function updateBudgetStatus(spent, budget) {
  const budgetDisplay = document.getElementById('budget-display');
  const fill = document.getElementById('progress-fill');

  let box = document.getElementById('budget-alert');
  if (!box) {
    box = document.createElement('div');
    box.id = 'budget-alert';
    fill.parentElement.insertAdjacentElement('afterend', box);
  }
  box.className = 'budget-alert';
  box.hidden = true;
  fill.classList.remove('warn', 'high', 'danger');

  if (!(budget > 0)) {
    budgetDisplay.textContent = 'set a budget';
    fill.style.width = '0%';
    return;
  }

  const pct = (spent / budget) * 100;
  budgetDisplay.textContent = '₹' + inr(budget) + ' budget · ' + Math.round(pct) + '% used';
  fill.style.width = Math.min(pct, 100) + '%';

  let level = '', msg = '';
  if (spent > budget) {
    level = 'danger';
    msg = `🚨 Over budget by ₹${(spent - budget).toFixed(2)} (${(pct - 100).toFixed(1)}% over your limit).`;
  } else if (pct >= 100) {
    level = 'danger';
    msg = '🚨 You have used 100% of your budget. Any more spending puts you over.';
  } else if (pct >= 90) {
    level = 'high';
    msg = `⚠ Almost at your limit: ${pct.toFixed(0)}% used, only ₹${(budget - spent).toFixed(2)} left.`;
  } else if (pct >= 75) {
    level = 'warn';
    msg = `⚠ Heads up: ${pct.toFixed(0)}% of your budget is used. ₹${(budget - spent).toFixed(2)} remaining.`;
  }

  if (level) {
    fill.classList.add(level);
    box.classList.add(level);
    box.textContent = msg;
    box.hidden = false;
  }
}

// ---- Auth ----
async function checkAuth() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/login.html';
    return false;
  }
  currentUser = data.username;
  displayName = data.displayName || '';
  window.myUserId = data.id;
  window.myAvatarDesc = data.avatar || null;
  window.myEmail = data.email || '';
  window.myEmailVerified = !!data.emailVerified;
  updateGreeting();
  if (window.refreshAccountRows) window.refreshAccountRows();
  return true;
}
async function logout() {
  if (window.splitsPushOff) await window.splitsPushOff();
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// Date shown in the Add form: today for the current month, otherwise the 1st of the month on screen
function defaultDateFor(d) {
  return monthStrOf(d) === monthStrOf(new Date()) ? todayStr() : monthStrOf(d) + '-01';
}

// ---- Month navigation ----
function changeMonth(delta) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
  renderAll();
}

function monthStrOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Tap the month name to jump straight to any month of any year
function openMonthPicker() {
  const { body, close } = openModal('Jump to month');
  const now = new Date();
  const withData = new Set(allExpenses.map(e => e.date.slice(0, 7)));
  const years = allExpenses.map(e => parseInt(e.date.slice(0, 4), 10));
  const minYear = Math.min(now.getFullYear() - 1, viewDate.getFullYear(), ...years);
  const maxYear = Math.max(now.getFullYear() + 1, viewDate.getFullYear());
  let pickYear = viewDate.getFullYear();

  function draw() {
    let opts = '';
    for (let y = maxYear; y >= minYear; y--) {
      opts += '<option value="' + y + '"' + (y === pickYear ? ' selected' : '') + '>' + y + '</option>';
    }
    let grid = '';
    for (let m = 0; m < 12; m++) {
      const key = pickYear + '-' + String(m + 1).padStart(2, '0');
      const cur = (pickYear === viewDate.getFullYear() && m === viewDate.getMonth()) ? ' current' : '';
      const has = withData.has(key) ? ' has' : '';
      grid += '<button class="ui-month' + cur + has + '" data-m="' + m + '">' +
              MONTH_NAMES[m].slice(0, 3) + '</button>';
    }
    body.innerHTML =
      '<div class="ui-picker-head">' +
        '<button class="ui-btn" data-y="-1" ' + (pickYear <= minYear ? 'disabled' : '') + '>‹</button>' +
        '<select id="pick-year">' + opts + '</select>' +
        '<button class="ui-btn" data-y="1" ' + (pickYear >= maxYear ? 'disabled' : '') + '>›</button>' +
      '</div>' +
      '<div class="ui-months">' + grid + '</div>' +
      '<div class="ui-hint">A dot means that month has expenses.</div>' +
      '<div class="ui-actions"><button class="ui-btn" id="pick-today">This month</button></div>';
  }
  draw();

  body.addEventListener('click', ev => {
    const yBtn = ev.target.closest('[data-y]');
    const mBtn = ev.target.closest('[data-m]');
    if (yBtn && !yBtn.disabled) { pickYear += parseInt(yBtn.dataset.y, 10); draw(); }
    if (mBtn) {
      viewDate = new Date(pickYear, parseInt(mBtn.dataset.m, 10), 1);
      close();
      renderAll();
    }
    if (ev.target.id === 'pick-today') {
      viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
      close();
      renderAll();
    }
  });
  body.addEventListener('change', ev => {
    if (ev.target.id === 'pick-year') { pickYear = parseInt(ev.target.value, 10); draw(); }
  });
}

// ---- Expenses ----
async function addExpense() {
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value;
  const date = document.getElementById('date').value;
  const verdict = document.getElementById('verdict').value;

  if (!amount || amount <= 0 || !date) {
    alert('Please enter a valid amount and date');
    return;
  }

  const monthKey = date.slice(0, 7);
  await ensureBudgets(monthKey);                      // that month's limits
  const before = budgetLevelOf(category, monthKey);   // alert level before this expense
  const overallBefore = overallLevelOf(monthKey);     // same for the overall monthly budget

  // Would this expense push a limit over 100%? Ask first. (Cancel keeps the form as it is.)
  const warnLines = [];
  const mb = budgetCache[monthKey];
  if (mb && mb.cats[category] > 0) {
    const newSpent = categorySpent(category, monthKey) + amount;
    if (newSpent > mb.cats[category]) {
      warnLines.push(category + ' will be ₹' + (newSpent - mb.cats[category]).toFixed(2) +
                     ' over its limit of ₹' + Number(mb.cats[category]).toFixed(2) + '.');
    }
  }
  if (mb && mb.overall > 0) {
    const monthSpent = allExpenses
      .filter(e => e.date.slice(0, 7) === monthKey)
      .reduce((t, e) => t + e.amount, 0) + amount;
    if (monthSpent > mb.overall) {
      warnLines.push('Your monthly budget will be ₹' + (monthSpent - mb.overall).toFixed(2) +
                     ' over (budget ₹' + Number(mb.overall).toFixed(2) + ').');
    }
  }
  if (warnLines.length && !(await confirmModal('Over budget', warnLines.concat('Add this expense anyway?'), 'Add anyway'))) {
    return;
  }

  const r = await api('/api/expenses', jsonOpts('POST', { amount, category, description, date, verdict }));
  if (!r.ok) {
    alert(r.data.error || 'Could not save the expense');   // the server's validation message
    return;
  }

  closeAddSheet();
  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  document.getElementById('verdict').value = '';
  document.querySelectorAll('.filled-by-scan').forEach(el => el.classList.remove('filled-by-scan'));
  document.getElementById('scanStatus').textContent = '';
  await loadAllExpenses();

  const after = budgetLevelOf(category, monthKey);
  if (shouldWarn(before, after)) {
    showToast(category + ' budget: ' + after.msg, after.level);
  }

  const overallAfter = overallLevelOf(monthKey);
  if (shouldWarn(overallBefore, overallAfter)) {
    showToast('Monthly budget: ' + overallAfter.msg, overallAfter.level);
  }
}

async function deleteExpense(id) {
  const r = await api('/api/expenses/' + id, { method: 'DELETE' });
  if (!r.ok) { alert(r.data.error || 'Could not delete'); return false; }
  await loadAllExpenses();
  return true;
}

// Tap an expense row to edit (or delete) it
function openEditExpense(e) {
  const { body, close } = openModal('Edit expense');
  const options = Object.keys(CATEGORY_COLORS).map(c =>
    '<option' + (c === e.category ? ' selected' : '') + '>' + c + '</option>').join('');
  body.innerHTML =
    '<label class="ui-field">Amount (₹)<input id="ed-amount" type="number" step="0.01" min="0" value="' + esc(e.amount) + '"></label>' +
    '<label class="ui-field">Category<select id="ed-category">' + options + '</select></label>' +
    '<label class="ui-field">Note<input id="ed-desc" type="text" maxlength="100" value="' + esc(e.description) + '"></label>' +
    '<label class="ui-field">Date<input id="ed-date" type="date" value="' + esc(e.date) + '"></label>' +
    '<label class="ui-field">How do you feel about it?<select id="ed-verdict">' +
      '<option value=""' + (!e.verdict ? ' selected' : '') + '>Not rated</option>' +
      '<option value="worth"' + (e.verdict === 'worth' ? ' selected' : '') + '>👍 Worth it</option>' +
      '<option value="regret"' + (e.verdict === 'regret' ? ' selected' : '') + '>👎 Regret</option></select></label>' +
    '<div class="ui-error" id="ed-error"></div>' +
    '<div class="ui-actions">' +
      '<button class="ui-btn danger" id="ed-delete">Delete</button>' +
      '<button class="ui-btn" id="ed-cancel">Cancel</button>' +
      '<button class="ui-btn primary" id="ed-save">Save</button>' +
    '</div>';

  const err = body.querySelector('#ed-error');
  body.querySelector('#ed-cancel').onclick = close;

  body.querySelector('#ed-delete').onclick = async () => {
    if (!confirm('Delete this expense?')) return;
    if (await deleteExpense(e.id)) close();
  };

  body.querySelector('#ed-save').onclick = async () => {
    const amount = parseFloat(body.querySelector('#ed-amount').value);
    if (!amount || amount <= 0) { err.textContent = 'Enter a valid amount'; return; }
    const r = await api('/api/expenses/' + e.id, jsonOpts('PUT', {
      amount,
      category: body.querySelector('#ed-category').value,
      description: body.querySelector('#ed-desc').value,
      date: body.querySelector('#ed-date').value,
      verdict: body.querySelector('#ed-verdict').value
    }));
    if (!r.ok) { err.textContent = r.data.error || 'Could not save'; return; }
    close();
    await loadAllExpenses();
  };
}

async function loadAllExpenses() {
  const res = await fetch('/api/expenses');
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  allExpenses = await res.json();
  renderAll();
}

function renderAll() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed
  const monthStr = monthStrOf(viewDate);

  // budgets of the month being viewed (they differ from month to month)
  const mb = budgetCache[monthStr] || { overall: 0, cats: {} };
  monthlyBudget = mb.overall;
  categoryBudgets = mb.cats;

  // keep the Add form's date inside the month on screen (a scanned date is left alone)
  if (lastDateMonth !== monthStr) {
    lastDateMonth = monthStr;
    const dateEl = document.getElementById('date');
    if (!dateEl.classList.contains('filled-by-scan')) dateEl.value = defaultDateFor(viewDate);
  }

  const label = document.getElementById('month-label');
  label.textContent = MONTH_NAMES[month] + (year !== new Date().getFullYear() ? ' ' + year : '') + ' ▾';
  label.title = 'Tap to jump to another month or year';

  const monthExpenses = allExpenses.filter(e => e.date.slice(0, 7) === monthStr);

  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

  document.getElementById('month-total').textContent = inr(monthTotal);

  const sb = document.getElementById('settings-budget-val');
  if (sb) sb.textContent = monthlyBudget > 0
    ? '₹' + inr(monthlyBudget) + ' for ' + monthLabelOf(viewDate)
    : 'Not set for ' + monthLabelOf(viewDate);

  // the "% vs previous" pill was removed; hide it if the old HTML still has it
  const pctEl = document.getElementById('pct-change');
  if (pctEl) pctEl.hidden = true;

  updateBudgetStatus(monthTotal, getBudget());
  updateSafeToSpend(monthExpenses, monthTotal);
  updateToolbar(monthExpenses);

  renderRecentList(monthExpenses);
  renderExpensesTab(monthExpenses);
  renderBarChart(year, month, monthExpenses);
  renderPieChart(monthExpenses, monthTotal);

  // first visit to this month: fetch its budgets, then draw again
  if (!budgetCache[monthStr]) {
    ensureBudgets(monthStr).then(ok => { if (ok && monthStrOf(viewDate) === monthStr) renderAll(); });
  }
}

const RECENT_LIMIT = 5;
const verdictBadge = e => e.verdict === 'worth' ? ' 👍' : e.verdict === 'regret' ? ' 👎' : '';
const newestFirst = (a, b) => b.date.localeCompare(a.date) || b.id - a.id;

// One expense as a rounded card: category icon, name, note, amount on the right
function expenseRowEl(e, onClick, showDate) {
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.title = 'Tap to edit';
  row.onclick = onClick;
  const color = CATEGORY_COLORS[e.category] || '#999999';
  row.innerHTML =
    '<div class="exp-icon" style="background:' + color + '26">' + (CATEGORY_ICONS[e.category] || '💸') + '</div>' +
    '<div class="exp-main">' +
      '<div class="exp-title">' + esc(e.category) + verdictBadge(e) + '</div>' +
      (e.description ? '<div class="exp-note">' + esc(e.description) + '</div>' : '') +
      (showDate ? '<div class="expense-meta">' + esc(e.date) + '</div>' : '') +
    '</div>' +
    '<div class="exp-amt">₹' + inr(e.amount) + '</div>';
  return row;
}

function renderRecentList(monthExpenses) {
  const list = document.getElementById('expense-list-new');
  list.innerHTML = '';
  const sorted = [...monthExpenses].sort(newestFirst);
  sorted.slice(0, RECENT_LIMIT).forEach(e => list.appendChild(expenseRowEl(e, () => openEditExpense(e), true)));
  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty">Nothing here yet. Tap + to add your first expense.</div>';
  }
  const btn = document.getElementById('view-all-btn');
  if (btn) btn.hidden = sorted.length === 0;
}

// "All Expenses" page: category chips + expenses grouped by day
let expenseFilter = 'All';
let expenseQuery = '';              // text typed in the search box
let selectMode = false;             // "Select" mode for deleting several at once
const selectedIds = new Set();
let visibleRows = [];               // the rows currently shown (for "Select all")

function renderExpensesTab(monthExpenses) {
  const chipsEl = document.getElementById('filter-chips');
  const cats = ['All'].concat(Object.keys(CATEGORY_COLORS));
  if (!cats.includes(expenseFilter)) expenseFilter = 'All';
  const keepScroll = chipsEl.scrollLeft;
  chipsEl.innerHTML = cats.map(c =>
    '<button class="chip' + (c === expenseFilter ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>').join('');
  chipsEl.scrollLeft = keepScroll;

  // Searching looks through ALL months; otherwise just the month on screen
  const searching = expenseQuery.trim() !== '';
  const rows = (searching ? allExpenses : monthExpenses)
    .filter(e => (expenseFilter === 'All' || e.category === expenseFilter) && (!searching || matchesQuery(e, expenseQuery)))
    .sort(newestFirst);
  const total = rows.reduce((s, e) => s + e.amount, 0);
  visibleRows = rows;
  for (const id of [...selectedIds]) if (!allExpenses.some(e => e.id === id)) selectedIds.delete(id);   // already deleted

  document.getElementById('exp-label').textContent = searching
    ? 'RESULTS' + (expenseFilter === 'All' ? '' : ' · ' + expenseFilter.toUpperCase())
    : (expenseFilter === 'All' ? 'TOTAL SPENT' : 'TOTAL · ' + expenseFilter.toUpperCase());
  document.getElementById('exp-total').textContent = inr(total);
  document.getElementById('exp-count').textContent =
    rows.length + (rows.length === 1 ? ' transaction' : ' transactions') + ' · ' + (searching ? 'all months' : monthLabelOf(viewDate));
  updateSelectUi();

  const list = document.getElementById('all-expenses-list');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = searching
      ? '<div class="empty">Nothing matches “' + esc(expenseQuery.trim()) + '”.</div>'
      : '<div class="empty">No expenses here.</div>';
    return;
  }

  const groups = [];
  rows.forEach(e => {
    let g = groups[groups.length - 1];
    if (!g || g.date !== e.date) { g = { date: e.date, items: [], total: 0 }; groups.push(g); }
    g.items.push(e);
    g.total += e.amount;
  });

  groups.forEach(g => {
    const [y, m, d] = g.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML =
      '<span class="day-pill">' + dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() + '</span>' +
      '<span>' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>' +
      '<span class="day-total">₹' + inr(g.total) + '</span>';
    list.appendChild(head);
    g.items.forEach(e => {
      const row = expenseRowEl(e, () => openEditExpense(e), false);
      if (selectMode) {
        const on = selectedIds.has(e.id);
        row.classList.add('selecting');
        row.classList.toggle('selected', on);
        row.title = '';
        row.insertAdjacentHTML('afterbegin', '<span class="sel-box">' + (on ? '✓' : '') + '</span>');
        row.onclick = () => {                      // tapping selects instead of opening the editor
          if (selectedIds.has(e.id)) selectedIds.delete(e.id); else selectedIds.add(e.id);
          const now = selectedIds.has(e.id);
          row.classList.toggle('selected', now);
          row.querySelector('.sel-box').textContent = now ? '✓' : '';
          updateSelectUi();
        };
      }
      list.appendChild(row);
    });
  });
}

// Every word typed must appear somewhere in the expense: note, category, amount, date, worth-it/regret
function matchesQuery(e, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const [y, m, d] = e.date.split('-').map(Number);
  const pretty = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const hay = [e.category, e.description || '', e.date, pretty, e.amount.toFixed(2), String(e.amount),
    e.verdict === 'worth' ? 'worth it' : e.verdict === 'regret' ? 'regret' : ''].join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

function rerenderExpensesTab() {      // redraw just this tab (keeps the search box focused)
  const monthStr = monthStrOf(viewDate);
  renderExpensesTab(allExpenses.filter(e => e.date.slice(0, 7) === monthStr));
}

// ---- Select mode: pick expenses, then delete them together ----
function updateSelectUi() {
  const bar = document.getElementById('select-bar');
  if (!bar) return;                    // older index.html without the select bar
  bar.hidden = !selectMode;
  document.body.classList.toggle('selecting', selectMode);
  const tog = document.getElementById('select-toggle');
  if (tog) tog.textContent = selectMode ? 'Done' : 'Select';
  const n = selectedIds.size;
  document.getElementById('sel-count').textContent = n ? n + ' selected' : 'Tap expenses to select';
  const del = document.getElementById('sel-del');
  del.disabled = n === 0;
  del.textContent = n ? 'Delete (' + n + ')' : 'Delete';
  const allOn = visibleRows.length > 0 && visibleRows.every(e => selectedIds.has(e.id));
  document.getElementById('sel-all').textContent = allOn ? 'Clear' : 'Select all';
}
function setSelectMode(on) {
  selectMode = on;
  selectedIds.clear();
  rerenderExpensesTab();
}
function exitSelectMode() { if (selectMode) setSelectMode(false); }

async function deleteSelected() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  const everything = ids.length === allExpenses.length;
  const ok = await confirmModal('Delete expenses',
    ['Delete ' + ids.length + ' expense' + (ids.length === 1 ? '' : 's') + '?' +
       (everything ? ' That is every expense you have recorded.' : ''),
     'This can’t be undone.'], 'Delete');
  if (!ok) return;
  const r = await api('/api/expenses/bulk-delete', jsonOpts('POST', { ids }));
  if (!r.ok) { showToast(r.data.error || 'Could not delete', 'danger'); return; }
  selectMode = false;
  selectedIds.clear();
  await loadAllExpenses();
  showToast(r.data.deleted + ' expense' + (r.data.deleted === 1 ? '' : 's') + ' deleted');
}

// Settings > Delete all expenses (needs the word DELETE typed)
function openDeleteAll() {
  const n = allExpenses.length;
  const { body, close } = openModal('Delete all expenses');
  if (n === 0) {
    body.innerHTML = '<div style="font-size:14px">You have no expenses to delete.</div>' +
      '<div class="ui-actions"><button class="ui-btn" id="da-close">Close</button></div>';
    body.querySelector('#da-close').onclick = close;
    return;
  }
  body.innerHTML =
    '<div style="font-size:14px;margin-bottom:12px">This permanently deletes <b>all ' + n + '</b> of your expenses, in every month. ' +
      'Your budgets, name, picture and split groups are not touched.</div>' +
    '<label class="ui-field">Type <b>DELETE</b> to confirm<input id="da-input" autocomplete="off" autocapitalize="characters"></label>' +
    '<div class="ui-error" id="da-err"></div>' +
    '<div class="ui-actions"><button class="ui-btn" id="da-no">Cancel</button>' +
      '<button class="ui-btn danger" id="da-yes" disabled>Delete everything</button></div>';
  const input = body.querySelector('#da-input'), yes = body.querySelector('#da-yes');
  input.addEventListener('input', () => { yes.disabled = input.value.trim() !== 'DELETE'; });
  body.querySelector('#da-no').onclick = close;
  yes.onclick = async () => {
    yes.disabled = true;
    const r = await api('/api/expenses/delete-all', jsonOpts('POST', { confirm: 'DELETE' }));
    if (!r.ok) { body.querySelector('#da-err').textContent = r.data.error || 'Could not delete'; return; }
    close();
    selectMode = false;
    selectedIds.clear();
    await loadAllExpenses();
    showToast(r.data.deleted + ' expense' + (r.data.deleted === 1 ? '' : 's') + ' deleted');
  };
}

function renderBarChart(year, month, monthExpenses) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyTotals = Array(daysInMonth).fill(0);

  monthExpenses.forEach(e => {
    const day = parseInt(e.date.slice(8, 10), 10);
    dailyTotals[day - 1] += e.amount;
  });

  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const colors = dailyTotals.map(v => v > 0 ? cssVar('--bar-on') : cssVar('--bar-off'));

  const maxVal = Math.max(...dailyTotals);
  const maxDay = dailyTotals.indexOf(maxVal) + 1;
  const captionEl = document.getElementById('outlay-caption');
  if (captionEl) {
    captionEl.textContent = maxVal > 0
      ? `1–${daysInMonth} ${MONTH_NAMES[month].slice(0,3)} · peak ${String(maxDay).padStart(2,'0')} ${MONTH_NAMES[month].slice(0,3)} ₹${maxVal.toFixed(2)}`
      : `1–${daysInMonth} ${MONTH_NAMES[month].slice(0,3)} · nothing recorded yet`;
  }

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: dailyTotals,
        backgroundColor: colors,
        maxBarThickness: 12,
        borderRadius: 4,
        minBarLength: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => labels[items[0].dataIndex] + ' ' + MONTH_NAMES[month].slice(0,3),
            label: (item) => '₹' + item.raw.toFixed(2)
          }
        }
      },
      scales: {
        y: { display: false },
        x: { display: false }
      }
    }
  });
}

function renderPieChart(monthExpenses, monthTotal) {
  const totals = {};
  monthExpenses.forEach(e => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });

  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#999');

  document.getElementById('ring-center').textContent =
    monthTotal >= 1000 ? '₹' + (monthTotal / 1000).toFixed(1) + 'k' : '₹' + monthTotal.toFixed(0);

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => '₹' + Number(item.raw).toFixed(2),
            afterLabel: item => categoryTip(item.label, item.raw)   // budget message on hover
          }
        }
      }
    }
  });

  const listEl = document.getElementById('category-list');
  listEl.innerHTML = '';
  if (labels.length === 0) {
    listEl.innerHTML = '<div class="muted small">No expenses this month.</div>';
    return;
  }
  labels.forEach((cat, i) => {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.title = categoryTip(cat, values[i]).join('\n');
    row.innerHTML = `
      <div class="label"><span class="swatch" style="background:${colors[i]}"></span>${esc(cat)}</div>
      <div>₹${values[i].toFixed(2)}</div>
    `;
    listEl.appendChild(row);
  });
}

// =====================================================================
//  RECEIPT SCANNING
//  1) Photo goes to the server, which asks the Gemini AI to read it.
//  2) If the AI is unavailable, the browser falls back to Tesseract OCR
//     plus the rule-based parser below.
//  3) Either way the result only PRE-FILLS the form; the user reviews it.
// =====================================================================
const SCAN_DEBUG = true; // true = log scan results to the browser console

// ---------- Rule-based parser (used by the Tesseract fallback) ----------
const CATEGORY_KEYWORDS = {
  Bills: ['electric', 'electricity', 'power', 'discom', 'msedcl', 'bses', 'mseb',
          'recharge', 'broadband', 'wifi', 'jio', 'airtel', 'bsnl', 'vodafone',
          'postpaid', 'prepaid', 'dth', 'water bill', 'gas bill', 'insurance', 'utility'],
  Food: ['restaurant', 'cafe', 'hotel', 'bakery', 'pizza', 'burger', 'swiggy',
         'zomato', 'canteen', 'sweets', 'mart', 'grocery', 'supermarket',
         'kirana', 'vegetable', 'dhaba'],
  Travel: ['petrol', 'fuel', 'diesel', 'uber', 'ola', 'taxi', 'bus', 'ticket',
           'railway', 'irctc', 'parking', 'toll'],
  Entertainment: ['cinema', 'movie', 'pvr', 'inox', 'netflix', 'game', 'concert'],
  Shopping: ['mall', 'fashion', 'garments', 'electronics', 'mobile', 'footwear',
             'clothing', 'amazon', 'flipkart'],
  Health: ['pharmacy', 'medical', 'chemist', 'clinic', 'hospital', 'medicine',
           'diagnostic', 'dental']
};

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const pad2 = n => String(n).padStart(2, '0');

// Three date styles: 21/10/2020, 21 October 2020, Oct 21, 2020
const DATE_PATTERNS = [
  { re: /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g, order: 'dmy' },
  { re: /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,9})\.?,?[\s\-]+(\d{2,4})\b/g, order: 'dMy' },
  { re: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g, order: 'Mdy' }
];

function stripDates(line) {
  let out = line;
  DATE_PATTERNS.forEach(p => { out = out.replace(p.re, ' '); });
  return out;
}

function findBestDate(lines) {
  let best = null;
  lines.forEach(line => {
    DATE_PATTERNS.forEach(({ re, order }) => {
      for (const m of line.matchAll(re)) {
        let dd, mm, yy;
        if (order === 'dmy')      { dd = +m[1]; mm = +m[2]; yy = m[3]; }
        else if (order === 'dMy') { dd = +m[1]; mm = MONTHS[m[2].slice(0, 3).toLowerCase()]; yy = m[3]; }
        else                      { mm = MONTHS[m[1].slice(0, 3).toLowerCase()]; dd = +m[2]; yy = m[3]; }

        if (!mm || dd < 1 || dd > 31 || mm < 1 || mm > 12) continue;
        if (yy.length === 3) continue;
        if (yy.length === 2) yy = '20' + yy;

        // prefer "paid on"/"date" lines, avoid "due date" lines
        let score = 1;
        if (/paid/i.test(line)) score += 3;
        if (/date|dated|invoice/i.test(line)) score += 1;
        if (/due|expir|valid/i.test(line)) score -= 3;

        if (!best || score > best.score) best = { iso: yy + '-' + pad2(mm) + '-' + pad2(dd), score };
      }
    });
  });
  return best ? best.iso : null;
}

function findAmount(lines) {
  const cleaned = lines.map(stripDates);          // dates removed, so "2020" is never an amount
  const toNum = s => parseFloat(s.replace(/,/g, ''));
  const numRe = /\d[\d,]*(?:\.\d{1,2})?/g;
  const labelRe = /(grand\s*total|net\s*(payable|amount)|total|payable|amount|paid)/i;
  const skipRe = /(change|tender|cash\s*(given|recd|received)|discount|saving)/i;
  const ok = n => n > 0 && n < 10000000;

  // 1) numbers on a "total"-like line, or on the line right after it
  let cands = [];
  cleaned.forEach((line, i) => {
    if (!labelRe.test(line) || skipRe.test(line)) return;
    let nums = line.match(numRe) || [];
    if (!nums.length && cleaned[i + 1]) nums = cleaned[i + 1].match(numRe) || [];
    nums.forEach(n => cands.push(toNum(n)));
  });
  cands = cands.filter(ok);

  // 2) numbers written right after ₹ / Rs / INR
  if (!cands.length) {
    const cur = cleaned.join('\n').matchAll(/(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d{1,2})?)/gi);
    cands = [...cur].map(m => toNum(m[1])).filter(ok);
  }

  // 3) any number with two decimals
  if (!cands.length) {
    cands = (cleaned.join('\n').match(/\d[\d,]*\.\d{2}/g) || []).map(toNum).filter(ok);
  }
  return cands.length ? Math.max(...cands) : null;
}

function guessCategory(lower) {
  let best = 'Other', bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    words.forEach(w => {
      // whole-word match for short words, so "bus" doesn't match "business"
      const re = new RegExp('\\b' + w + (w.length <= 4 ? '\\b' : ''));
      if (re.test(lower)) score++;
    });
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

// skip lines that look like OCR garbage (logos, stamps)
function looksClean(line) {
  const words = line.split(/\s+/);
  const compact = line.replace(/\s/g, '');
  if (compact.length < 4) return false;
  const letters = (line.match(/[A-Za-z]/g) || []).length;
  if (letters / compact.length < 0.7) return false;
  if (words.some(w => /[a-z][A-Z]/.test(w))) return false;           // e.g. "WErWEEw"
  if (words.filter(w => w.length === 1).length >= 2) return false;   // lots of lone letters
  return words.some(w => w.length >= 4);
}

function pickDescription(lines) {
  const line = lines.slice(0, 8).find(looksClean);
  return line ? line.replace(/[^\w\s&.-]/g, '').slice(0, 40) : '';
}

function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return {
    amount: findAmount(lines),
    date: findBestDate(lines),
    category: guessCategory(text.toLowerCase()),
    description: pickDescription(lines)
  };
}

// ---------- Image helpers ----------
// Grayscale + contrast stretch, for the Tesseract fallback
async function preprocessImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = 1800 / Math.max(bmp.width, bmp.height);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = g;
    hist[g]++;
  }

  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const range = Math.max(hi - lo, 1);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((px[i] - lo) * 255) / range));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Color JPEG, longest side 1600px, as base64 (small enough to upload quickly)
async function resizeForUpload(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

// ---------- The two scanners ----------
async function scanWithAI(file) {
  const image = await resizeForUpload(file);
  const res = await fetch('/api/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mimeType: 'image/jpeg' })
  });
  if (!res.ok) throw new Error('AI scan failed: ' + res.status);
  return res.json();
}

async function scanWithTesseract(file) {
  let worker;
  try {
    const canvas = await preprocessImage(file);
    worker = await Tesseract.createWorker('eng', 1);
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    if (SCAN_DEBUG) console.log('--- TESSERACT TEXT ---\n' + data.text);
    return parseReceipt(data.text);
  } finally {
    if (worker) await worker.terminate();
  }
}

// ---------- Wire up the button ----------
const scanBtn = document.getElementById('scanBtn');
const receiptInput = document.getElementById('receiptInput');
const scanStatus = document.getElementById('scanStatus');

// Two ways to add a receipt on a phone:
//   "Scan receipt" -> camera (the input in index.html has capture="environment")
//   "Upload"       -> gallery / files (a second input without capture)
// On a laptop there is no camera to choose, so only ONE button is shown, and it opens the file picker.
const isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

const uploadInput = document.createElement('input');
uploadInput.type = 'file';
uploadInput.accept = 'image/*';
uploadInput.hidden = true;
scanBtn.insertAdjacentElement('afterend', uploadInput);

let uploadBtn = null;
if (isTouchDevice) {
  uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.id = 'uploadBtn';
  uploadBtn.className = scanBtn.className;
  uploadBtn.textContent = '🖼 Upload';
  scanBtn.insertAdjacentElement('afterend', uploadBtn);
  uploadBtn.addEventListener('click', () => uploadInput.click());
  scanBtn.addEventListener('click', () => receiptInput.click());          // camera
} else {
  scanBtn.textContent = '🖼 Upload receipt';
  scanBtn.addEventListener('click', () => uploadInput.click());           // file picker
}

// Left-to-right sweeping bar shown while the AI reads a receipt
function setScanLoading(on) {
  let bar = document.getElementById('scan-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'scan-progress';
    bar.className = 'scan-progress';
    bar.hidden = true;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Reading receipt');
    bar.innerHTML = '<i></i>';
    document.querySelector('.scan-row').insertAdjacentElement('afterend', bar);
  }
  bar.hidden = !on;
}

async function handleReceiptFile(input) {
  const file = input.files[0];
  if (!file) return;

  scanBtn.disabled = true;
  if (uploadBtn) uploadBtn.disabled = true;
  setScanLoading(true);
  try {
    let result, source = 'AI';
    try {
      scanStatus.textContent = 'Reading receipt with AI…';
      result = await scanWithAI(file);
    } catch (err) {
      console.warn(err);
      source = 'Tesseract';
      scanStatus.textContent = 'AI unavailable, using basic scan…';
      result = await scanWithTesseract(file);
    }
    if (SCAN_DEBUG) console.log('--- PARSED (' + source + ') ---', result);
    fillFormFromReceipt(result);
  } catch (err) {
    console.error(err);
    scanStatus.textContent = 'Could not read the receipt. Please enter it manually.';
  } finally {
    setScanLoading(false);
    scanBtn.disabled = false;
    if (uploadBtn) uploadBtn.disabled = false;
    input.value = '';
  }
}

receiptInput.addEventListener('change', () => handleReceiptFile(receiptInput));
uploadInput.addEventListener('change', () => handleReceiptFile(uploadInput));

function fillFormFromReceipt(r) {
  // reset first, so values from an earlier scan never linger
  document.querySelectorAll('.filled-by-scan').forEach(el => el.classList.remove('filled-by-scan'));
  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  document.getElementById('date').value = defaultDateFor(viewDate);

  const mark = (id, value) => {
    const el = document.getElementById(id);
    el.value = value;
    el.classList.add('filled-by-scan');
  };

  if (r.amount != null) mark('amount', r.amount);
  if (r.date)           mark('date', r.date);
  mark('category', r.category || 'Other');
  if (r.description)    mark('description', r.description);

  scanStatus.textContent = r.amount != null
    ? 'Check the highlighted fields, fix anything wrong, then press Add.'
    : "Couldn't find a payable amount. Please enter it yourself.";
}

// remove the highlight once the user edits a field
['amount', 'category', 'description', 'date'].forEach(id => {
  document.getElementById(id).addEventListener('input', e =>
    e.target.classList.remove('filled-by-scan'));
});

// =====================================================================
//  CATEGORY BUDGETS (now tucked away in a small pop-up)
//  Limits are stored in the database. Alerts use the same thresholds as
//  the overall budget: 75% heads-up, 90% almost there, 100%+ exceeded.
// =====================================================================
const LEVEL_RANK = { '': 0, warn: 1, high: 2, danger: 3 };

function budgetState(spent, limit) {
  if (!(limit > 0)) return { level: '', pct: 0, msg: '' };
  const pct = (spent / limit) * 100;
  if (spent > limit) {
    return { level: 'danger', pct, msg: '🚨 Over by ₹' + (spent - limit).toFixed(2) };
  }
  if (pct >= 100) {
    return { level: 'danger', pct, msg: '🚨 100% of the limit used' };
  }
  if (pct >= 90) {
    return { level: 'high', pct, msg: '⚠ ' + pct.toFixed(0) + '% used, only ₹' + (limit - spent).toFixed(2) + ' left' };
  }
  if (pct >= 75) {
    return { level: 'warn', pct, msg: '⚠ ' + pct.toFixed(0) + '% used, ₹' + (limit - spent).toFixed(2) + ' left' };
  }
  return { level: '', pct, msg: '' };
}

function categorySpent(category, monthStr) {
  return allExpenses
    .filter(e => e.category === category && e.date.slice(0, 7) === monthStr)
    .reduce((s, e) => s + e.amount, 0);
}

// uses the limits of THAT month (the expense's month may not be the month on screen)
function budgetLevelOf(category, monthStr) {
  const b = budgetCache[monthStr];
  return budgetState(categorySpent(category, monthStr), b ? b.cats[category] : 0);
}

// Warn when an expense crosses a new level, and also when it is added to something already over the limit
function shouldWarn(before, after) {
  return !!after.level && (LEVEL_RANK[after.level] > LEVEL_RANK[before.level] || after.level === 'danger');
}

// Alert level of the overall monthly budget for a month
function overallLevelOf(monthStr) {
  const spent = allExpenses
    .filter(e => e.date.slice(0, 7) === monthStr)
    .reduce((s, e) => s + e.amount, 0);
  const b = budgetCache[monthStr];
  return budgetState(spent, b ? b.overall : 0);
}

function showToast(message, level) {
  injectUiStyles();
  const t = document.createElement('div');
  t.className = 'cb-toast ' + (level || '');
  t.textContent = message;
  // stack above any toast that is still showing
  t.style.bottom = (100 + document.querySelectorAll('.cb-toast').length * 60) + 'px';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

function openCategoryBudgets() {
  const { body, close } = openModal('Category budgets · ' + monthLabelOf(viewDate));
  const monthStr = monthStrOf(viewDate);
  const cats = Object.keys(CATEGORY_COLORS);

  let rows = '';
  cats.forEach(cat => {
    const spent = categorySpent(cat, monthStr);
    const st = budgetState(spent, categoryBudgets[cat]);
    rows +=
      '<div class="ui-cat-row">' +
        '<div><div class="ui-cat-name"><span class="ui-swatch" style="background:' + CATEGORY_COLORS[cat] + '"></span>' + esc(cat) + '</div>' +
          '<div class="ui-hint ' + st.level + '">₹' + spent.toFixed(2) + ' spent this month' + (st.msg ? ' · ' + esc(st.msg) : '') + '</div></div>' +
        '<input type="number" min="0" step="0.01" inputmode="decimal" placeholder="No limit" data-cat="' + cat + '" value="' + (categoryBudgets[cat] || '') + '">' +
      '</div>';
  });

  body.innerHTML =
    '<div class="ui-hint" style="margin-bottom:8px">Limits for ' + monthLabelOf(viewDate) + ' (₹). Only this month is affected. Leave empty for no limit.</div>' +
    rows +
    '<div class="ui-error" id="cb-error"></div>' +
    '<div class="ui-actions">' +
      '<button class="ui-btn" id="cb-cancel">Cancel</button>' +
      '<button class="ui-btn primary" id="cb-save">Save</button>' +
    '</div>';

  body.querySelector('#cb-cancel').onclick = close;
  body.querySelector('#cb-save').onclick = async () => {
    const err = body.querySelector('#cb-error');
    const budgets = {};
    for (const input of body.querySelectorAll('input[data-cat]')) {
      const raw = input.value.trim();
      const n = raw === '' ? 0 : Math.round(parseFloat(raw) * 100) / 100;
      if (isNaN(n) || n < 0) { err.textContent = 'Check the amount for ' + input.dataset.cat; return; }
      budgets[input.dataset.cat] = n;     // 0 = remove, the server understands that
    }
    const month = monthStrOf(viewDate);
    const r = await api('/api/category-budgets', jsonOpts('PUT', { month, budgets }));
    if (!r.ok) { err.textContent = r.data.error || 'Could not save'; return; }
    delete budgetCache[month];
    await ensureBudgets(month);
    close();
    renderAll();
  };
}

// =====================================================================
//  TOOLBAR (category budgets + export), kept slim above the daily chart
// =====================================================================
function ensureToolbar() {
  const bar = document.getElementById('quick-actions');
  if (bar.dataset.ready) return bar;
  bar.dataset.ready = '1';
  injectUiStyles();
  bar.innerHTML =
    '<button class="qa-btn" id="btn-cat-budgets"><span class="qa-ico">🎯</span><span>Budgets</span><span class="ui-badge" id="cb-badge" hidden></span></button>' +
    '<button class="qa-btn" id="btn-insights"><span class="qa-ico">💡</span><span>Insights</span></button>' +
    '<button class="qa-btn" id="btn-splits"><span class="qa-ico">🤝</span><span>Splits</span><span class="ui-badge" id="sp-badge" hidden></span></button>';
  bar.querySelector('#btn-cat-budgets').onclick = openCategoryBudgets;
  bar.querySelector('#btn-insights').onclick = openInsights;
  bar.querySelector('#btn-splits').onclick = () => openSplits();
  if (window.refreshSplitsBadge) window.refreshSplitsBadge();   // number on the Splits button
  return bar;
}

// Small badge on the button when any category is close to or over its limit
function updateToolbar(monthExpenses) {
  ensureToolbar();
  const spentBy = {};
  monthExpenses.forEach(e => { spentBy[e.category] = (spentBy[e.category] || 0) + e.amount; });
  let alerts = 0, over = false;
  Object.keys(CATEGORY_COLORS).forEach(cat => {
    const st = budgetState(spentBy[cat] || 0, categoryBudgets[cat]);
    if (st.level) alerts++;
    if (st.level === 'danger') over = true;
  });
  const badge = document.getElementById('cb-badge');
  badge.hidden = alerts === 0;
  badge.textContent = alerts;
  badge.className = 'ui-badge' + (over ? ' danger' : '');
}

// =====================================================================
//  SAFE TO SPEND TODAY
//  Turns the monthly budget into a daily allowance, plus a simple end-of-month projection.
// =====================================================================
function updateSafeToSpend(monthExpenses, monthTotal) {
  const card = document.getElementById('progress-fill').closest('.hero');
  let box = document.getElementById('safe-box');
  if (!box) {
    injectUiStyles();
    box = document.createElement('div');
    box.id = 'safe-box';
    card.appendChild(box);
  }
  box.className = 'safe-box';
  box.hidden = false;

  const money = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
  const show = (main, mainCls, subs) => {
    box.innerHTML = '<div class="safe-main ' + mainCls + '">' + main + '</div>' +
      subs.map(x => '<div class="safe-sub ' + (x.cls || '') + '">' + x.text + '</div>').join('');
  };

  const budget = getBudget();
  const now = new Date();
  const viewing = monthStrOf(viewDate);
  const thisMonth = monthStrOf(now);

  if (viewing > thisMonth) { box.hidden = true; return; }          // future month: nothing to say

  if (!(budget > 0)) {
    if (viewing === thisMonth) show('Safe to spend today', '', [{ text: 'Set a budget to see how much you can spend each day.' }]);
    else box.hidden = true;
    return;
  }

  if (viewing < thisMonth) {                                          // past month: how did it end?
    const diff = budget - monthTotal;
    if (diff >= 0) show('Finished ' + money(diff) + ' under budget', '', []);
    else show('Finished ' + money(diff) + ' over budget', 'danger', []);
    return;
  }

  // current month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const daysLeft = daysInMonth - day + 1;                             // today included
  const today = todayStr();
  const spentToday = monthExpenses.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0);
  const spentBefore = monthTotal - spentToday;
  const remaining = budget - monthTotal;
  const dailyShare = (budget - spentBefore) / daysLeft;               // today's fair share
  const todayLeft = dailyShare - spentToday;

  const subs = [];
  if (remaining > 0) {
    subs.push({ text: money(remaining) + ' left for ' + daysLeft + (daysLeft === 1 ? ' day' : ' days') +
                      ' · about ' + money(remaining / daysLeft) + ' a day' });
  }
  if (day >= 3) {                                                     // too early to project on days 1-2
    const diff = (monthTotal / day) * daysInMonth - budget;
    subs.push(diff > 0
      ? { text: '📈 At this pace you will end the month about ' + money(diff) + ' over budget', cls: 'warn' }
      : { text: '✅ At this pace you will end the month about ' + money(diff) + ' under budget' });
  }

  if (remaining < 0) show('🚨 Over budget by ' + money(remaining), 'danger', subs);
  else if (remaining === 0) show('🚨 Budget fully used', 'danger', subs);
  else if (todayLeft <= 0) show("Today's share is used up", 'warn', subs);
  else show('Safe to spend today: ' + money(todayLeft), todayLeft < dailyShare * 0.25 ? 'warn' : '', subs);
}

// =====================================================================
//  INSIGHTS: worth it vs regret
// =====================================================================
function openInsights() {
  const monthStr = monthStrOf(viewDate);
  const { body, close } = openModal('Insights · ' + monthLabelOf(viewDate), { wide: true });
  const money = n => '₹' + n.toFixed(2);

  function draw() {
    const rows = allExpenses.filter(e => e.date.slice(0, 7) === monthStr);
    const sum = { worth: 0, regret: 0, none: 0 };
    rows.forEach(e => { sum[e.verdict === 'worth' || e.verdict === 'regret' ? e.verdict : 'none'] += e.amount; });
    const total = sum.worth + sum.regret + sum.none;
    const pct = n => total > 0 ? Math.round((n / total) * 100) : 0;

    let html =
      '<div class="ui-list-top"><button class="ui-btn" id="in-back">← Back</button>' +
      '<div class="ui-list-sum">' + rows.length + ' expenses · ' + money(total) + '</div></div>';

    if (!rows.length) {
      body.innerHTML = html + '<div class="muted small">No expenses this month.</div>';
      body.querySelector('#in-back').onclick = close;
      return;
    }

    html +=
      '<div class="ui-bar">' +
        '<div style="width:' + pct(sum.worth) + '%;background:#27ae60"></div>' +
        '<div style="width:' + pct(sum.regret) + '%;background:#d62828"></div>' +
      '</div>' +
      '<div class="ui-leg"><span>👍 Worth it</span><span>' + money(sum.worth) + ' · ' + pct(sum.worth) + '%</span></div>' +
      '<div class="ui-leg"><span>👎 Regret</span><span>' + money(sum.regret) + ' · ' + pct(sum.regret) + '%</span></div>' +
      '<div class="ui-leg"><span>Not rated yet</span><span>' + money(sum.none) + ' · ' + pct(sum.none) + '%</span></div>';

    const byCat = {};
    rows.filter(e => e.verdict === 'regret').forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) {
      html += '<div class="ui-sec">WHERE YOU REGRET MOST</div>' +
        top.map(([c, v]) => '<div class="ui-leg"><span>' + esc(c) + '</span><span>' + money(v) + '</span></div>').join('');
    }

    const unrated = rows.filter(e => !e.verdict).sort(newestFirst);
    html += '<div class="ui-sec">RATE YOUR EXPENSES' + (unrated.length ? ' (' + unrated.length + ' LEFT)' : '') + '</div>';
    if (!unrated.length) html += '<div class="ui-hint">Everything this month is rated.</div>';
    unrated.slice(0, 8).forEach(e => {
      html +=
        '<div class="ui-exp-row" style="cursor:default">' +
          '<div class="ui-exp-main"><div class="ui-exp-title"><span class="ui-exp-cat">' + esc(e.category) + '</span>' +
            (e.description ? ' — ' + esc(e.description) : '') + '</div>' +
            '<div class="ui-exp-meta">' + esc(e.date) + ' · ' + money(e.amount) + '</div></div>' +
          '<div class="ui-exp-right">' +
            '<button class="ui-btn" data-id="' + e.id + '" data-v="worth" title="Worth it">👍</button>' +
            '<button class="ui-btn" data-id="' + e.id + '" data-v="regret" title="Regret">👎</button>' +
          '</div>' +
        '</div>';
    });
    if (unrated.length > 8) html += '<div class="ui-hint">' + (unrated.length - 8) + ' more. They appear as you rate these.</div>';
    html += '<div class="ui-error" id="in-error"></div>';

    body.innerHTML = html;
    body.querySelector('#in-back').onclick = close;
  }
  draw();

  body.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-v]');
    if (!btn) return;
    const e = allExpenses.find(x => x.id === parseInt(btn.dataset.id, 10));
    if (!e) return;
    btn.disabled = true;
    const r = await api('/api/expenses/' + e.id, jsonOpts('PUT', {
      amount: e.amount, category: e.category, description: e.description, date: e.date, verdict: btn.dataset.v
    }));
    if (!r.ok) {
      draw();
      const er = body.querySelector('#in-error');
      if (er) er.textContent = r.data.error || 'Could not save';
      return;
    }
    e.verdict = btn.dataset.v;
    draw();
    renderAll();
  });
}

// =====================================================================
//  EXPORT (CSV comes from the server; PDF is made by the browser's print dialog)
// =====================================================================
function openExportMenu() {
  const { body, close } = openModal('Export');
  const monthStr = monthStrOf(viewDate);
  const niceMonth = MONTH_NAMES[viewDate.getMonth()].slice(0, 3) + ' ' + viewDate.getFullYear();
  body.innerHTML =
    '<button class="ui-btn ui-menu-item" data-a="csv-month">CSV · ' + niceMonth + '</button>' +
    '<button class="ui-btn ui-menu-item" data-a="csv-all">CSV · all expenses</button>' +
    '<button class="ui-btn ui-menu-item" data-a="pdf">PDF · ' + niceMonth + '</button>' +
    '<div class="ui-hint">For PDF, choose "Save as PDF" in the print window.</div>';
  body.addEventListener('click', ev => {
    const a = ev.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'csv-month') window.location.href = '/api/export.csv?month=' + monthStr;
    if (a.dataset.a === 'csv-all') window.location.href = '/api/export.csv';
    if (a.dataset.a === 'pdf') exportPdf();
    close();
  });
}

function exportPdf() {
  const monthStr = monthStrOf(viewDate);
  const title = MONTH_NAMES[viewDate.getMonth()] + ' ' + viewDate.getFullYear();
  const rows = allExpenses
    .filter(e => e.date.slice(0, 7) === monthStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = rows.reduce((s, e) => s + e.amount, 0);

  const byCat = {};
  rows.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to export the PDF'); return; }

  w.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>Expenses ' + esc(title) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}' +
    '.sub{color:#666;font-size:13px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}' +
    'th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}th{background:#f3f3f3}' +
    'td.r,th.r{text-align:right}.total{font-weight:bold}h2{font-size:15px;margin:18px 0 6px}</style></head><body>' +
    '<h1>Expense report — ' + esc(title) + '</h1>' +
    '<div class="sub">' + (displayName ? esc(displayName) + ' · ' : '') + 'generated ' + esc(todayStr()) + '</div>' +
    '<h2>By category</h2><table><tr><th>Category</th><th class="r">Amount (₹)</th></tr>' +
    Object.keys(byCat).map(c => '<tr><td>' + esc(c) + '</td><td class="r">' + byCat[c].toFixed(2) + '</td></tr>').join('') +
    '<tr class="total"><td>Total</td><td class="r">' + total.toFixed(2) + '</td></tr></table>' +
    '<h2>All expenses</h2><table><tr><th>Date</th><th>Category</th><th>Note</th><th class="r">Amount (₹)</th></tr>' +
    (rows.length
      ? rows.map(e => '<tr><td>' + esc(e.date) + '</td><td>' + esc(e.category) + '</td><td>' + esc(e.description) +
          '</td><td class="r">' + e.amount.toFixed(2) + '</td></tr>').join('')
      : '<tr><td colspan="4">No expenses this month.</td></tr>') +
    '</table></body></html>'
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ---- Start ----
// Optional "How do you feel about it?" field in the Add form (it can also be set later in Insights)
(function () {
  const sel = document.createElement('select');
  sel.id = 'verdict';
  sel.className = 'note-input';
  sel.innerHTML = '<option value="">Rate it later (optional)</option>' +
                  '<option value="worth">👍 Worth it</option><option value="regret">👎 Regret</option>';
  document.getElementById('description').insertAdjacentElement('afterend', sel);
})();

// ---- Greeting: shows the name from Settings, never the login username ----
function updateGreeting() {
  const small = document.getElementById('hello-small');
  const big = document.getElementById('hello-name');
  if (displayName) {
    small.hidden = false;
    small.textContent = 'Welcome back,';
    big.textContent = displayName;
  } else {
    small.hidden = true;
    big.textContent = 'Welcome back 👋';
  }
  const st = document.getElementById('name-state');
  if (st) st.textContent = displayName || 'Not set';
  if (window.refreshMyAvatarUI) window.refreshMyAvatarUI();   // picture + initial follow the name
}

function openNameEditor() {
  const { body, close } = openModal('Your name');
  body.innerHTML =
    '<label class="ui-field">Name shown on the home page' +
      '<input id="nm-input" type="text" maxlength="30" placeholder="e.g. Dame" value="' + esc(displayName) + '"></label>' +
    '<div class="ui-hint">Your login username is never shown. Leave it empty to show no name.</div>' +
    '<div class="ui-error" id="nm-error"></div>' +
    '<div class="ui-actions">' +
      '<button class="ui-btn" id="nm-cancel">Cancel</button>' +
      '<button class="ui-btn primary" id="nm-save">Save</button>' +
    '</div>';
  const input = body.querySelector('#nm-input');
  setTimeout(() => input.focus(), 100);
  body.querySelector('#nm-cancel').onclick = close;
  const save = async () => {
    const r = await api('/api/profile', jsonOpts('PUT', { displayName: input.value }));
    if (!r.ok) { body.querySelector('#nm-error').textContent = r.data.error || 'Could not save'; return; }
    displayName = r.data.displayName || '';
    updateGreeting();
    close();
  };
  body.querySelector('#nm-save').onclick = save;
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(); });
}

function openThemePicker() {
  const { body, close } = openModal('Theme color');
  const current = document.documentElement.getAttribute('data-color') || 'forest';
  body.innerHTML =
    '<div class="theme-grid">' +
      Object.entries(COLOR_THEMES).map(([k, t]) =>
        '<button class="theme-opt' + (k === current ? ' active' : '') + '" data-c="' + k + '">' +
          '<span class="theme-dot" style="background:linear-gradient(135deg,' + t.hero + ',' + t.hero2 + ')">' +
            '<i style="background:' + t.accent + '"></i></span>' +
          '<span>' + t.label + '</span></button>').join('') +
    '</div>' +
    '<div class="ui-hint" style="margin-top:12px">Works in both light and dark mode.</div>' +
    '<div class="ui-actions"><button class="ui-btn primary" id="th-done">Done</button></div>';
  body.addEventListener('click', ev => {
    const b = ev.target.closest('[data-c]');
    if (b) {
      applyColor(b.dataset.c);
      body.querySelectorAll('.theme-opt').forEach(x => x.classList.toggle('active', x === b));
    }
    if (ev.target.id === 'th-done') close();
  });
}

// ---- Bottom navigation: Home / Expenses / Analytics / Settings ----
function showView(name) {
  if (name !== 'expenses') exitSelectMode();   // leaving the tab ends Select mode
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === 'analytics') renderAll();   // draw the charts now that they are visible
}

// ---- Add expense sheet (the + button) ----
function openAddSheet() {
  document.getElementById('add-sheet').classList.add('open');
  document.body.classList.add('no-scroll');
  setTimeout(() => document.getElementById('amount').focus(), 150);
}
function closeAddSheet() {
  document.getElementById('add-sheet').classList.remove('open');
  document.body.classList.remove('no-scroll');
}
document.getElementById('add-sheet').addEventListener('mousedown', ev => {
  if (ev.target.id === 'add-sheet') closeAddSheet();
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeAddSheet(); });

document.getElementById('filter-chips').addEventListener('click', ev => {
  const b = ev.target.closest('[data-cat]');
  if (!b) return;
  expenseFilter = b.dataset.cat;
  renderAll();
});

document.getElementById('month-label').addEventListener('click', openMonthPicker);

// Search box + Select mode on the Expenses tab
(function wireExpenseTools() {
  const input = document.getElementById('exp-search');
  const clear = document.getElementById('exp-search-clear');
  if (input) {
    let t = null;
    input.addEventListener('input', () => {
      clear.hidden = input.value === '';
      clearTimeout(t);
      t = setTimeout(() => { expenseQuery = input.value; rerenderExpensesTab(); }, 120);
    });
    clear.addEventListener('click', () => {
      input.value = ''; clear.hidden = true; expenseQuery = ''; rerenderExpensesTab(); input.focus();
    });
  }
  const tog = document.getElementById('select-toggle');
  if (tog) tog.addEventListener('click', () => setSelectMode(!selectMode));
  const cancel = document.getElementById('sel-cancel');
  if (cancel) cancel.addEventListener('click', () => setSelectMode(false));
  const all = document.getElementById('sel-all');
  if (all) all.addEventListener('click', () => {
    const allOn = visibleRows.length > 0 && visibleRows.every(e => selectedIds.has(e.id));
    selectedIds.clear();
    if (!allOn) visibleRows.forEach(e => selectedIds.add(e.id));
    rerenderExpensesTab();
  });
  const del = document.getElementById('sel-del');
  if (del) del.addEventListener('click', deleteSelected);
})();

checkAuth().then(async ok => {
  if (ok) {
    await ensureBudgets(monthStrOf(viewDate));   // so the first draw already has them
    await loadAllExpenses();
    if (window.maybeShowWelcomeGuide) window.maybeShowWelcomeGuide();
  }
});