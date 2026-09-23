document.getElementById('date').value = new Date().toISOString().split('T')[0];

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
}

loadExpenses();
