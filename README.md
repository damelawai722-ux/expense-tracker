# Expense Tracker

A mobile-friendly expense tracker for recording spending, setting budgets, reviewing trends, and splitting shared costs with a group. It is built with Node.js, Express, and PostgreSQL, with a browser-based frontend.

> **Project demo:** https://expense-tracker-3-9kwp.onrender.com/

## Features

- Record, edit, search, filter, rate, and export expenses.
- Set separate monthly and category budgets, and review spending with charts and insights.
- Scan a receipt with Gemini AI; the browser can use Tesseract.js OCR as a fallback.
- Create groups for shared expenses, calculate settlements, and follow group updates.
- Create an account, verify an email address, and manage account recovery.
- Use light or dark themes, install the app as a PWA, and receive optional group push notifications.

## Technology

- Node.js and Express
- PostgreSQL for application data and sessions
- HTML, CSS, and JavaScript
- Chart.js for analytics
- Gemini API and Tesseract.js for receipt scanning
- Web Push for optional notifications

## Run locally

You will need Node.js and a PostgreSQL database.

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Create a PostgreSQL database and add a `.env` file in the project root:

   ```dotenv
   DATABASE_URL=postgresql://username:password@localhost:5432/expense_tracker
   SESSION_SECRET=replace-with-a-long-random-secret
   ```

   Do not commit `.env` or real credentials to GitHub. The server requires `DATABASE_URL`; use a unique, long `SESSION_SECRET` outside local development.

3. Start the server, loading the `.env` file:

   ```sh
   node -r dotenv/config server.js
   ```

4. Open [http://localhost:3000](http://localhost:3000) and create an account.

The app creates and updates its PostgreSQL tables when it starts. The `expense.db` file in this repository is not the database used by the current server.

### Optional integrations

Add these variables to `.env` only if you want to enable the related features:

| Variables | Used for |
| --- | --- |
| `GEMINI_API_KEY` | AI receipt scanning. The browser OCR fallback does not need this key. |
| `MAIL_FROM` and either `BREVO_API_KEY` or `RESEND_API_KEY` | Sending verification and password-recovery emails. |
| `MAIL_FROM_NAME` | Optional sender display name for email. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and optionally `VAPID_SUBJECT` | Group push notifications. |

Keep all API keys and private keys out of source control. For deployment, configure them in the hosting provider's environment-variable settings.

## Deploy

Deploy the Node.js app with a reachable PostgreSQL database. Set `DATABASE_URL` and a strong `SESSION_SECRET` in the hosting provider, then use `npm start` as the start command. Configure optional integration variables there as needed. The server uses the provider's `PORT` environment variable when available.

## Project files

```text
.
├── server.js          Express server, PostgreSQL setup, and expense routes
├── authRoutes.js      Email verification, password reset, and password changes
├── splitsRoutes.js    Shared groups, settlements, live updates, and push
├── mailer.js          Email delivery through Brevo or Resend
├── package.json       Dependencies and start command
└── public/
    ├── index.html     Main tracker interface
    ├── login.html     Sign-in and account creation
    ├── reset.html     Password recovery
    ├── app.js         Expense tracking, budgets, analytics, and exports
    ├── splits.js      Shared-expense interface
    ├── account.js     Email and password settings
    ├── profile.js     Profile and avatar features
    ├── guide.js       Welcome tour and in-app guides
    ├── style.css      App styles and themes
    ├── sw.js          Service worker and push notifications
    └── manifest.json  Progressive Web App metadata
```

---

Academic project by **Damepynjanai Lawai**.
