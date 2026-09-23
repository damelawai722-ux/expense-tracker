const Database = require('better-sqlite3');
const db = new Database('expense.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL
    );
`);

module.exports = db;