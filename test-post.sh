curl -X POST http://localhost:3000/api/expenses \
-H "Content-Type: application/json" \
-d '{"amount":150,"category":"Food","description":"Lunch","date":"2026-09-23"}'