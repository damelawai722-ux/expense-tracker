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
let viewDate = new Date();
let currentUser = '';
let categoryBudgets = {};   // per-category monthly limits, e.g. { Food: 3000, Bills: 2000 }

const CATEGORY_COLORS = {
  Food: '#8B0000', Travel: '#2980b9', Bills: '#e67e22',
  Entertainment: '#8e44ad', Shopping: '#27ae60', Health: '#16a085', Other: '#f1c40f'
};
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

// ---- Theme toggle ----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀' : '🌙';
  localStorage.setItem('theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
applyTheme(localStorage.getItem('theme') || 'light');

// ---- Budget (stored per user) ----
function getBudget() {
  return parseFloat(localStorage.getItem('budget_' + currentUser) || '0');
}
function editBudget() {
  const current = getBudget();
  const val = prompt('Set your monthly budget (₹):', current || '');
  if (val !== null && !isNaN(parseFloat(val))) {
    localStorage.setItem('budget_' + currentUser, parseFloat(val));
    renderAll();
  }
}

// ---- Budget status: warnings + exceeded alerts ----
// Thresholds: 75% = heads-up, 90% = almost at limit, 100%+ = exceeded
function updateBudgetStatus(spent, budget) {
  const budgetDisplay = document.getElementById('budget-display');
  const fill = document.getElementById('progress-fill');

  // create the alert box once, right under the progress bar
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
  budgetDisplay.textContent = '₹' + budget.toFixed(2) + ' budget · ' + Math.round(pct) + '% used';
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
  return true;
}
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ---- Month navigation ----
function changeMonth(delta) {
  viewDate.setMonth(viewDate.getMonth() + delta);
  renderAll();
}

function monthStrOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---- Expenses ----
async function addExpense() {
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value;
  const date = document.getElementById('date').value;

  if (!amount || amount <= 0 || !date) {
    alert('Please enter a valid amount and date');
    return;
  }

  const monthKey = date.slice(0, 7);
  const before = budgetLevelOf(category, monthKey);   // alert level before this expense

  await fetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, category, description, date })
  });

  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  document.querySelectorAll('.filled-by-scan').forEach(el => el.classList.remove('filled-by-scan'));
  document.getElementById('scanStatus').textContent = '';
  await loadAllExpenses();

  // warn if this expense pushed the category past a new threshold
  const after = budgetLevelOf(category, monthKey);
  if (after.level && LEVEL_RANK[after.level] > LEVEL_RANK[before.level]) {
    showToast(category + ' budget: ' + after.msg, after.level);
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await fetch('/api/expenses/' + id, { method: 'DELETE' });
  await loadAllExpenses();
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

  document.getElementById('month-label').textContent =
    MONTH_NAMES[month] + (year !== new Date().getFullYear() ? ' ' + year : '');

  const monthExpenses = allExpenses.filter(e => e.date.slice(0, 7) === monthStr);

  const prevDate = new Date(year, month - 1, 1);
  const prevStr = monthStrOf(prevDate);
  const prevExpenses = allExpenses.filter(e => e.date.slice(0, 7) === prevStr);

  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);

  document.getElementById('month-total').textContent = monthTotal.toFixed(2);

  const pctEl = document.getElementById('pct-change');
  if (prevTotal > 0) {
    const pct = Math.round(((monthTotal - prevTotal) / prevTotal) * 100);
    pctEl.textContent = (pct >= 0 ? '+' : '') + pct + '% vs previous';
  } else {
    pctEl.textContent = monthTotal > 0 ? 'new spending' : 'nothing recorded yet';
  }

  updateBudgetStatus(monthTotal, getBudget());
  renderCategoryBudgets(monthExpenses);

  renderRecentList(monthExpenses);
  renderBarChart(year, month, monthExpenses);
  renderPieChart(monthExpenses, monthTotal);
}

function renderRecentList(monthExpenses) {
  const list = document.getElementById('expense-list-new');
  list.innerHTML = '';
  const sorted = [...monthExpenses].sort((a, b) => b.date.localeCompare(a.date));
  sorted.slice(0, 8).forEach(e => {
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.onclick = () => deleteExpense(e.id);
    row.innerHTML = `
      <div>
        <div>${e.category}${e.description ? ' — ' + e.description : ''}</div>
        <div class="expense-meta">${e.date}</div>
      </div>
      <div>₹${e.amount.toFixed(2)}</div>
    `;
    list.appendChild(row);
  });
  if (sorted.length === 0) {
    list.innerHTML = '<div class="muted small">Nothing here yet — add your first expense below.</div>';
  }
}

function renderBarChart(year, month, monthExpenses) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyTotals = Array(daysInMonth).fill(0);

  monthExpenses.forEach(e => {
    const day = parseInt(e.date.slice(8, 10), 10);
    dailyTotals[day - 1] += e.amount;
  });

  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const colors = dailyTotals.map(v => v > 0 ? '#8B0000' : '#C9CDD3');

  // Caption: peak day
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
        maxBarThickness: 10,
        borderRadius: 3,
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
      plugins: { legend: { display: false } }
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
    row.innerHTML = `
      <div class="label"><span class="swatch" style="background:${colors[i]}"></span>${cat}</div>
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

scanBtn.addEventListener('click', () => receiptInput.click());

receiptInput.addEventListener('change', async () => {
  const file = receiptInput.files[0];
  if (!file) return;

  scanBtn.disabled = true;
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
    scanBtn.disabled = false;
    receiptInput.value = '';
  }
});

function fillFormFromReceipt(r) {
  // reset first, so values from an earlier scan never linger
  document.querySelectorAll('.filled-by-scan').forEach(el => el.classList.remove('filled-by-scan'));
  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  document.getElementById('date').value = todayStr();

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
//  CATEGORY BUDGETS
//  A monthly limit per category, stored in the database (so it follows
//  the user to any device). Alerts use the same thresholds as the
//  overall budget: 75% heads-up, 90% almost there, 100%+ exceeded.
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

function budgetLevelOf(category, monthStr) {
  return budgetState(categorySpent(category, monthStr), categoryBudgets[category]);
}

function showToast(message, level) {
  const t = document.createElement('div');
  t.className = 'cb-toast ' + (level || '');
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

async function loadCategoryBudgets() {
  try {
    const res = await fetch('/api/category-budgets');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) throw new Error('status ' + res.status);
    categoryBudgets = await res.json();
  } catch (err) {
    console.warn('Could not load category budgets:', err);
    categoryBudgets = {};
  }
}

async function editCategoryBudget(category) {
  const current = categoryBudgets[category] || '';
  const val = prompt('Monthly limit for ' + category + ' (₹).\nLeave empty or enter 0 to remove it:', current);
  if (val === null) return;

  const num = val.trim() === '' ? 0 : Math.round(parseFloat(val) * 100) / 100;
  if (isNaN(num) || num < 0) {
    alert('Please enter a valid amount');
    return;
  }

  try {
    const url = '/api/category-budgets/' + encodeURIComponent(category);
    const res = num === 0
      ? await fetch(url, { method: 'DELETE' })
      : await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: num })
        });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) throw new Error('status ' + res.status);

    if (num === 0) delete categoryBudgets[category];
    else categoryBudgets[category] = num;
    renderAll();
  } catch (err) {
    console.error(err);
    alert('Could not save the limit. Please try again.');
  }
}

// Styles for the card and the pop-up warning (works in light and dark theme)
function injectBudgetStyles() {
  if (document.getElementById('cb-styles')) return;
  const s = document.createElement('style');
  s.id = 'cb-styles';
  s.textContent = `
    .cb-row { padding: 10px 0; border-top: 1px solid rgba(128,128,128,.25); cursor: pointer; }
    .cb-top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .cb-name { display: flex; align-items: center; gap: 8px; }
    .cb-track { height: 6px; border-radius: 3px; background: rgba(128,128,128,.25); margin-top: 8px; overflow: hidden; }
    .cb-fill { height: 100%; background: #27ae60; transition: width .3s; }
    .cb-fill.warn { background: #e67e22; }
    .cb-fill.high { background: #d35400; }
    .cb-fill.danger { background: #d62828; }
    .cb-msg { margin-top: 6px; font-size: 12px; }
    .cb-msg.warn { color: #e67e22; }
    .cb-msg.high { color: #d35400; }
    .cb-msg.danger { color: #d62828; }
    .cb-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); max-width: 90vw;
                padding: 12px 16px; border-radius: 10px; color: #fff; background: #e67e22;
                box-shadow: 0 6px 20px rgba(0,0,0,.25); z-index: 1000; font-size: 14px; }
    .cb-toast.high { background: #d35400; }
    .cb-toast.danger { background: #d62828; }
  `;
  document.head.appendChild(s);
}

// Create the card once, just above the DAILY OUTLAY card
function ensureBudgetCard() {
  let card = document.getElementById('cat-budget-card');
  if (card) return card;
  injectBudgetStyles();
  card = document.createElement('div');
  card.id = 'cat-budget-card';
  card.className = 'card span-2';
  card.addEventListener('click', e => {
    const row = e.target.closest('.cb-row');
    if (row) editCategoryBudget(row.dataset.cat);
  });
  document.getElementById('barChart').closest('.card').insertAdjacentElement('beforebegin', card);
  return card;
}

function renderCategoryBudgets(monthExpenses) {
  const card = ensureBudgetCard();
  const spentBy = {};
  monthExpenses.forEach(e => { spentBy[e.category] = (spentBy[e.category] || 0) + e.amount; });

  let html = '<div class="card-title-row"><div class="card-title">CATEGORY BUDGETS</div>' +
             '<div class="muted small">tap a category to set its limit</div></div>';

  Object.keys(CATEGORY_COLORS).forEach(cat => {
    const spent = spentBy[cat] || 0;
    const limit = categoryBudgets[cat];
    const st = budgetState(spent, limit);
    html += '<div class="cb-row" data-cat="' + cat + '">' +
      '<div class="cb-top">' +
        '<span class="cb-name"><span class="swatch" style="background:' + CATEGORY_COLORS[cat] + '"></span>' + cat + '</span>' +
        '<span class="cb-amt">₹' + spent.toFixed(2) + (limit > 0 ? ' / ₹' + Number(limit).toFixed(2) : ' · set limit') + '</span>' +
      '</div>';
    if (limit > 0) {
      html += '<div class="cb-track"><div class="cb-fill ' + st.level + '" style="width:' + Math.min(st.pct, 100) + '%"></div></div>';
      if (st.msg) html += '<div class="cb-msg ' + st.level + '">' + st.msg + '</div>';
    }
    html += '</div>';
  });
  card.innerHTML = html;
}

// ---- Start ----
checkAuth().then(async ok => {
  if (ok) {
    await loadCategoryBudgets();   // limits first, so the first draw already has them
    await loadAllExpenses();
  }
});