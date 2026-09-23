document.getElementById('date').value = new Date().toISOString().split('T')[0];

let barChart, pieChart;

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
  loadExpenses();
}

async function deleteExpense(id) {
  await fetch('/api/expenses/' + id, { method: 'DELETE' });
  loadExpenses();
}

async function loadExpenses() {
  const res = await fetch('/api/expenses');
  const expenses = await res.json();

  const list = document.getElementById('expense-list');
  list.innerHTML = '';
  let total = 0;

  expenses.forEach(e => {
    total += e.amount;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${e.date}</td>
      <td>${e.category}</td>
      <td>${e.description || '-'}</td>
      <td>₹${e.amount.toFixed(2)}</td>
      <td><button class="delete-btn" onclick="deleteExpense(${e.id})">Delete</button></td>
    `;
    list.appendChild(row);
  });

  document.getElementById('total-amount').textContent = '₹' + total.toFixed(2);
  document.getElementById('total-count').textContent = expenses.length;

  loadBarChart();
  loadPieChart();
}

async function loadBarChart() {
  const res = await fetch('/api/summary/daily');
  const data = await res.json();

  const labels = data.map(d => d.date);
  const values = data.map(d => d.total);

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Spending by Date',
        data: values,
        backgroundColor: '#8B0000',
        maxBarThickness: 30
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Spending by Date', font: { size: 16 } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 13 } } },
        x: { ticks: { font: { size: 13 } } }
      }
    }
  });
}

async function loadPieChart() {
  const res = await fetch('/api/summary/category');
  const data = await res.json();

  const labels = data.map(d => d.category);
  const values = data.map(d => d.total);

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#8B0000', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#c0392b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Spending by Category', font: { size: 16 } },
        legend: { labels: { font: { size: 13 } } }
      }
    }
  });
}

loadExpenses();
