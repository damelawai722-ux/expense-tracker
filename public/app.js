if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

document.getElementById('date').value = new Date().toISOString().split('T')[0];

let barChart, pieChart;
let allExpenses = [];
let viewDate = new Date();

const CATEGORY_COLORS = {
  Food: '#8B0000', Travel: '#2980b9', Bills: '#e67e22',
  Entertainment: '#8e44ad', Shopping: '#27ae60', Health: '#16a085', Other: '#f1c40f'
};
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

// ---- Theme toggle ----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
applyTheme(localStorage.getItem('theme') || 'light');

// ---- Budget ----
function getBudget() {
  return parseFloat(localStorage.getItem('budget') || '0');
}
function editBudget() {
  const current = getBudget();
  const val = prompt('Set your monthly budget (₹):', current || '');
  if (val !== null && !isNaN(parseFloat(val))) {
    localStorage.setItem('budget', parseFloat(val));
    renderAll();
  }
}

// ---- Auth ----
async function checkAuth() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (!data.loggedIn) window.location.href = '/';
}
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
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
  await loadAllExpenses();
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await fetch('/api/expenses/' + id, { method: 'DELETE' });
  await loadAllExpenses();
}

async function loadAllExpenses() {
  const res = await fetch('/api/expenses');
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

  const budget = getBudget();
  const budgetDisplay = document.getElementById('budget-display');
  const fill = document.getElementById('progress-fill');
  if (budget > 0) {
    budgetDisplay.textContent = '₹' + budget.toFixed(2) + ' budget';
    fill.style.width = Math.min((monthTotal / budget) * 100, 100) + '%';
  } else {
    budgetDisplay.textContent = 'set a budget';
    fill.style.width = '0%';
  }

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

checkAuth();
loadAllExpenses();