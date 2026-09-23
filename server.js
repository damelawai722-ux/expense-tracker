const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/api/expenses', (req, res) => {
  const { amount, category, description, date } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Amount, category, and date are required' });
  }
  const stmt = db.prepare('INSERT INTO expenses (amount, category, description, date) VALUES (?, ?, ?, ?)');
  stmt.run(amount, category, description || '', date);
  res.json({ success: true });
});

app.get('/api/expenses', (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();
  res.json(rows);
});

app.delete('/api/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
// Monthly totals for the bar chart
app.get('/api/summary/daily', (req, res) => {
  const rows = db.prepare(`
    SELECT date, SUM(amount) as total
    FROM expenses
    GROUP BY date
    ORDER BY date ASC
  `).all();
  res.json(rows);
});

// Category totals for the pie chart
app.get('/api/summary/category', (req, res) => {
  const rows = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM expenses
    GROUP BY category
  `).all();
  res.json(rows);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});