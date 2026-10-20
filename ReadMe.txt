This project is being handled and completed by Damepynjanai Lawai. Where this project is for my college project to be submitted to his respectful teacher.
``
A simple web-based expense tracking application built with Node.js, Express, SQLite, and Chart.js.
``
Setup Instructions (Windows)

1. Make sure Node.js is installed (check with `node -v` in Command Prompt).
2. Open Command Prompt and navigate into this folder:
   ```
   cd path\to\expense-tracker
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Start the server:
   ```
   node server.js
   ```
5. Open your browser and go to:
   ```
   http://localhost:3000
   ```
Your data is saved permanently in the `expenses.db` file in this folder — it stays there even if you close the app.



# Expense Tracker

A full-stack expense tracking web app with budgets, receipt scanning, shared bill splitting and an installable mobile experience. Built with Node.js, Express, SQLite and Chart.js, and hosted on Render.

This project is being handled and completed by **Damepynjanai Lawai** as a college project, to be submitted to his respected teacher.

**Live app:** `https://expense-tracker-3-9kwp.onrender.com/`

---

## Features

### Tracking expenses
- Add, edit and delete expenses with an amount, category, note and date.
- Seven categories: Food, Travel, Bills, Entertainment, Shopping, Health and Other.
- The Recent list on Home, plus an All Expenses page grouped by day.
- Search across all months by note, category, amount or date, filter by category, and select several expenses to delete at once.
- Rate any expense as "worth it" or "regret".

### Budgets
- A separate monthly budget for every month.
- Per-category limits for each month.
- A progress bar that warns at 75%, 90% and 100%, and a confirmation before an expense takes you over a limit.
- "Safe to spend today", which turns your budget into a daily allowance and predicts whether you will finish the month over or under budget.

### Analytics and insights
- Daily outlay bar chart and a spending-by-category ring (Chart.js).
- Insights page showing how much you spent on things that were worth it versus regrets, and which categories you regret most.

### Receipt scanning
- Take a photo or upload a receipt and the app fills in the amount, date, category and shop name.
- Uses an AI model (Google Gemini) through the server, with an in-browser Tesseract.js OCR fallback when the AI is unavailable.
- Scanned fields are highlighted so you can check them before saving.

### Splits (shared expenses)
- Create groups and invite friends with a code.
- Split costs equally among chosen members and see who owes whom, simplified to the fewest payments.
- Mark payments as paid or received, and copy your share into your own expenses.
- Live updates for everyone in a group (server-sent events) and push notifications.

### Accounts and personalisation
- Sign up and log in with a username and password.
- Add a verified email for password recovery, and change your password.
- Profile picture (avatar or uploaded photo) and display name.
- Light and dark mode, plus five colour themes.

### Data tools
- Export to CSV (one month or everything) or to a printable PDF report.
- Delete all expenses, protected by a typed confirmation.

### App experience
- Installable as a Progressive Web App (web manifest and service worker).
- Mobile-first layout with a bottom navigation bar.
- Guided welcome tour for new users, a Help screen in Settings, and a Splits explainer.

---

## Tech stack

| Part | Technology |
| --- | --- |
| Backend | Node.js, Express |
| Database | SQLite (file-based) |
| Frontend | HTML, CSS and plain JavaScript |
| Charts | Chart.js |
| Receipt reading | Google Gemini API, Tesseract.js fallback |
| Email | `mailer.js` (verification and password recovery) |
| Notifications | Web Push |
| Hosting | Render |

## Project structure

```
expense-tracker/
├── server.js          Express server and main API routes
├── authRoutes.js      Sign up, login, profile and account routes
├── splitsRoutes.js    Splits groups, expenses, settlements and live updates
├── mailer.js          Sends verification and recovery emails
├── package.json
├── expense.db         SQLite database (created automatically)
└── public/            Frontend served to the browser
    ├── index.html     Main app
    ├── login.html     Login and sign-up page
    ├── reset.html     Password reset page
    ├── app.js         Main app logic
    ├── splits.js      Splits screens
    ├── profile.js     Profile picture and avatar
    ├── account.js     Email and password settings
    ├── guide.js       Welcome tour, Help screen and Splits explainer
    ├── style.css      Styles and themes
    ├── sw.js          Service worker (PWA and push notifications)
    └── manifest.json  PWA settings
```

---

## Running it locally (Windows)

1. Install [Node.js](https://nodejs.org) and check it with `node -v` in Command Prompt.
2. Open Command Prompt and go into the project folder:
   ```
   cd path\to\expense-tracker
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Set the environment variables (see below).
5. Start the server:
   ```
   node server.js
   ```
6. Open your browser and go to `http://localhost:3000`.

The app works without the optional settings, but receipt AI scanning, emails and push notifications need their keys to be set.

### Environment variables

Never commit real keys to GitHub. Set these in a local `.env` file or in your hosting dashboard:

| Variable | Used for |
| --- | --- |
| `<GEMINI_KEY_NAME>` | AI receipt scanning |
| `<EMAIL_SETTINGS>` | Sending verification and recovery emails |
| `<VAPID_KEY_NAMES>` | Push notifications |
| `<SESSION_SECRET_NAME>` | Keeping logins secure |

Replace the names in angle brackets with the exact variable names used in your `server.js` and `mailer.js`.

## Deploying on Render

1. Push the project to GitHub.
2. In Render, create a **Web Service** from the repository.
3. Set the build command to `npm install` and the start command to `node server.js`.
4. Add the environment variables above in the Render dashboard.
5. Every `git push` redeploys the app automatically.

**Important:** on Render's free plan the disk is erased on every redeploy, which would delete `expense.db`. To keep data permanently, attach a Render persistent disk and store the database file on it.

## Data storage

Expenses, budgets, accounts and split groups are stored in the SQLite database file `expense.db`. Locally it stays in the project folder even after you close the app.

---

Built by Damepynjanai Lawai.