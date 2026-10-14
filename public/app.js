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

// ================= Receipt scanning =================
const SCAN_DEBUG = true; // true = log the raw OCR text to the console

const CATEGORY_KEYWORDS = {
  Food: ['restaurant', 'cafe', 'hotel', 'bakery', 'pizza', 'burger', 'swiggy',
         'zomato', 'canteen', 'sweets', 'mart', 'grocery', 'supermarket',
         'kirana', 'vegetable', 'dhaba'],
  Travel: ['petrol', 'fuel', 'diesel', 'uber', 'ola', 'taxi', 'bus', 'ticket',
           'railway', 'irctc', 'parking', 'toll'],
  Bills: ['electricity', 'recharge', 'broadband', 'jio', 'airtel', 'bsnl',
          'water bill', 'gas', 'insurance'],
  Entertainment: ['cinema', 'movie', 'pvr', 'inox', 'netflix', 'game', 'concert'],
  Shopping: ['mall', 'fashion', 'garments', 'electronics', 'mobile', 'footwear',
             'clothing', 'amazon', 'flipkart'],
  Health: ['pharmacy', 'medical', 'chemist', 'clinic', 'hospital', 'medicine',
           'diagnostic', 'dental']
};

const scanBtn = document.getElementById('scanBtn');
const receiptInput = document.getElementById('receiptInput');
const scanStatus = document.getElementById('scanStatus');

scanBtn.addEventListener('click', () => receiptInput.click());

receiptInput.addEventListener('change', async () => {
  const file = receiptInput.files[0];
  if (!file) return;

  scanBtn.disabled = true;
  try {
    scanStatus.textContent = 'Reading receipt…';
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          scanStatus.textContent = 'Reading… ' + Math.round(m.progress * 100) + '%';
        }
      }
    });

    if (SCAN_DEBUG) console.log('--- RAW OCR TEXT ---\n' + data.text);

    const result = parseReceipt(data.text);
    if (SCAN_DEBUG) console.log('--- PARSED ---', result);

    fillFormFromReceipt(result);
  } catch (err) {
    console.error(err);
    scanStatus.textContent = 'Could not read the receipt. Please enter it manually.';
  } finally {
    scanBtn.disabled = false;
    receiptInput.value = '';
  }
});

function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const toNum = s => parseFloat(s.replace(/,/g, ''));

  // 1) Amount: look at "total"-like lines, ignore cash/change lines
  const totalWords = /(grand\s*total|net\s*payable|total|payable|amount\s*due)/i;
  const skipWords = /(change|tender|cash\s*(given|recd|received)|qty|items)/i;

  let candidates = [];
  lines.forEach(line => {
    if (totalWords.test(line) && !skipWords.test(line)) {
      (line.match(/\d[\d,]*(?:\.\d{1,2})?/g) || []).forEach(n => candidates.push(toNum(n)));
    }
  });
  if (candidates.length === 0) {
    // fallback: any decimal money-looking number anywhere
    candidates = (text.match(/\d[\d,]*\.\d{2}/g) || []).map(toNum);
  }
  candidates = candidates.filter(n => n > 0);
  const amount = candidates.length ? Math.max(...candidates) : null;

  // 2) Date: assume DD/MM/YYYY (Indian format), validate the parts
  let date = null;
  const d = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (d) {
    let dd = parseInt(d[1], 10), mm = parseInt(d[2], 10), yy = d[3];
    if (yy.length === 2) yy = '20' + yy;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      date = yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    }
  }

  // 3) Category: first keyword match, else Other
  let category = 'Other';
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some(w => lower.includes(w))) { category = cat; break; }
  }

  // 4) Description: first line is usually the shop name
  const description = lines[0] ? lines[0].replace(/[^\w\s&.-]/g, '').slice(0, 40) : '';

  return { amount, date, category, description };
}

function fillFormFromReceipt(r) {
  const found = [];
  const mark = (id, value) => {
    const el = document.getElementById(id);
    el.value = value;
    el.classList.add('filled-by-scan');
  };

  if (r.amount != null) { mark('amount', r.amount); found.push('amount'); }
  if (r.date)           { mark('date', r.date);     found.push('date'); }
  mark('category', r.category);                      found.push('category');
  if (r.description)    { mark('description', r.description); }

  scanStatus.textContent = found.includes('amount')
    ? 'Check the highlighted fields, fix anything wrong, then press Add.'
    : "Couldn't find the total. Please enter the amount yourself.";
}

// remove the highlight once the user edits a field
['amount', 'category', 'description', 'date'].forEach(id => {
  document.getElementById(id).addEventListener('input', e =>
    e.target.classList.remove('filled-by-scan'));
});

// ---- Start ----
checkAuth().then(ok => {
  if (ok) loadAllExpenses();
});