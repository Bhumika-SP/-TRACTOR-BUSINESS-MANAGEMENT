# Tractor Tracker

A simple mobile app for a one-tractor business with 3–4 users. One person enters the day's work, payments and expenses. Everyone else can open the app and see:

1. How much tractor work was done
2. How much money came in
3. How much farmers still owe
4. How much went on diesel and other expenses
5. How much driver salary has built up (the driver is paid every 10 days)
6. The actual profit

| Part | Technology |
|---|---|
| Mobile app (Android + iOS) | React Native, Expo SDK 58, TypeScript, Expo Router, NativeWind, React Hook Form + Zod, Axios, Expo SecureStore, Lucide icons |
| Backend API | Node.js 20+, Express 5, TypeScript, Zod, JWT, bcrypt (bcryptjs), Helmet, rate limiting |
| Database | MongoDB Atlas with Mongoose 9 |
| Hosting | Render for the API, Expo EAS for app builds |

---

## 1. Project structure

```
tractor-tracker/
├── backend/
│   ├── src/
│   │   ├── config/        env validation, database connection
│   │   ├── models/        Mongoose schemas (User, Customer, Work, CustomerPayment,
│   │   │                  Expense, DriverPayment, Settings, AuditLog, Lock)
│   │   ├── services/      business logic; calculations.ts holds every formula
│   │   ├── controllers/   request handlers
│   │   ├── routes/        REST routes with role checks
│   │   ├── middleware/    auth (JWT + roles), error handler
│   │   ├── validators/    Zod schemas for every input
│   │   ├── utils/         money (paise), dates, transactions, responses
│   │   ├── scripts/       createAdmin, seedDemo, devDatabase
│   │   ├── app.ts         Express app (helmet, CORS, rate limit)
│   │   └── server.ts      entry point
│   ├── tests/             calculation unit tests and API integration tests
│   └── .env.example
├── mobile/
│   ├── app/
│   │   ├── (auth)/login.tsx
│   │   ├── (tabs)/        index (Home), work, payments, history
│   │   ├── work/          new (add/edit), [id] (details)
│   │   ├── payments/      customer, driver, expense, cycle/[start]
│   │   ├── settings/      settings, users, user
│   │   └── _layout.tsx
│   ├── components/  hooks/  services/  constants/  types/  i18n/  utils/
│   ├── eas.json
│   └── .env.example
├── docs/API.md            API reference
├── render.yaml            Render deployment blueprint
└── package.json           convenience scripts
```

---

## 2. How the money is calculated

Every formula is in `backend/src/services/calculations.ts`. The server always recalculates; it never trusts a total sent by the app.

| Figure | Formula |
|---|---|
| Working minutes | To Time − From Time (if To is earlier than From, the work crossed midnight and 24 hours are added) |
| Work amount | Working minutes ÷ 60 × tractor rate per hour |
| Farmer pending | Work amount − all payments for that work |
| Driver salary | Driver minutes ÷ 60 × driver rate per hour (V1: driver minutes = tractor minutes) |
| Total expenses | Driver salary earned + Diesel + Other expenses |
| **Profit** | Work amount − Total expenses (based on work done, not on money received) |
| Cash in hand | Money received − expenses paid − driver payments made |

Rules the system enforces:

- **Money is stored as whole paise** (₹1 = 100 paise), so there are no rounding errors. The API takes and returns rupees.
- **Rates are saved on every job.** Changing the rate in Settings changes only new work. Old jobs keep their rate.
- **Driver salary counts as an expense once, when it is earned.** Paying the driver later lowers the unpaid salary and the cash in hand, but it does not lower profit again.
- **Unpaid farmer bills are never counted as money received.**
- **Payments are never overwritten.** Each payment is its own record. A wrong payment is *cancelled* with a reason and stays in history.
- **A farmer cannot be charged more than they owe.** Payments above the pending amount are refused, including two payments sent at the same moment (database transactions).
- **The same form cannot be saved twice.** Each form sends a unique `requestId`, so a double tap or a retry after a lost connection still creates one record.
- **Every edit, delete and cancellation is written to the `auditlogs` collection**, with before and after values, who made the change and why. Work and expenses are soft-deleted, never erased.
- A work entry cannot be edited down below the money already received for it. A work entry that has payments cannot be deleted until those payments are cancelled.

### Driver 10-day cycles

Cycles are consecutive 10-day periods counted from **Settings → Driver payment start date** (for example 1–10 Nov, 11–20 Nov, 21–30 Nov, 1–10 Dec, …). They do not reset each month, so a 31-day month does not break them. Each cycle shows hours, rate, salary earned, amount paid, remaining salary and status. Part payments are allowed. The start date can only be changed to a date that keeps cycles which already have payments aligned.

---

## 3. Users and permissions

There is no public sign-up. The Admin creates every account.

| | Owner / Admin | Work Entry | Work Entry + "can edit" | Viewer |
|---|---|---|---|---|
| View everything | ✅ | ✅ | ✅ | ✅ |
| Add work, payments, expenses | ✅ | ✅ | ✅ | ❌ |
| Edit, delete, cancel old records | ✅ | ❌ | ✅ | ❌ |
| Change rates and settings | ✅ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |

Users are deactivated, never deleted, so their old entries keep an author. Deactivating a user, changing their role or password, or logging out signs them out at once, because every request re-checks the user in the database.

---

## 4. Local development

### Requirements

- Node.js 20 or newer
- The **Expo Go** app on your phone (Android or iOS), or an Android emulator
- A MongoDB **replica set**, which the app needs for transactions. Use **either**:
  - a free MongoDB Atlas cluster (Atlas clusters are replica sets), **or**
  - the built-in local one: `npm run dev:db` (described below; nothing to install)

A plain stand-alone `mongod` service will **not** work, because it does not support transactions.

### Backend

```bash
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

Edit `.env`:

- `MONGODB_URI`: your Atlas connection string, or the local one printed by `npm run dev:db`
- `JWT_SECRET`: a long random string. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

**Optional local database** (keep it running in its own terminal; data is saved in `backend/.devdb`):

```bash
npm run dev:db
# prints MONGODB_URI=mongodb://127.0.0.1:27018/tractor_tracker?replicaSet=rs0
```

**Create the first Admin account:**

```bash
npm run create-admin -- --name "Owner Name" --username owner --password "ChooseAStrongPassword"
```

Running it again with the same username changes nothing. The Admin then adds the other users from the app (**Home → ⚙ Settings → Users**).

**Start the API:**

```bash
npm run dev        # http://localhost:4000/api/health should return {"success":true,...}
```

### Mobile app

```bash
cd mobile
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer's **Wi-Fi IP address**, not `localhost`, so the phone can reach the API. For example `http://192.168.1.10:4000/api`. On Windows, `ipconfig` shows the IP. Phone and computer must be on the same Wi-Fi.

```bash
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS), then log in with the Admin account.

---

## 5. Demo data (kept separate from real data)

The demo seed writes only to `DEMO_MONGODB_URI`. It refuses to run unless that database name contains `demo` and differs from `MONGODB_URI`. It **wipes the demo database first** and then creates about 5 weeks of realistic jobs, payments, expenses and driver payments through the same services the API uses.

```bash
cd backend
# add to .env (or set in the shell):
# DEMO_MONGODB_URI=mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/tractor_tracker_demo
npm run seed:demo
```

To try it, point the API at the demo database (`MONGODB_URI` = the demo URI) and log in with `owner`, `entry` or `viewer`. The password for all three is `demo1234`. Switch back to the real URI afterwards.

---

## 6. Testing

```bash
cd backend
npm test           # 46 tests: business formulas + full API with a real in-memory MongoDB replica set
npm run typecheck

cd ../mobile
npm run typecheck
npx expo lint
npx expo-doctor
```

The tests download a MongoDB binary the first time (about 100 MB). They cover every scenario in the specification: the Ramesh example (₹3,200 work, ₹800 driver, ₹1,500 expenses, ₹1,700 profit), partial and full payments, ₹1,000 + ₹1,000 → ₹1,200 pending, the 40-hour / ₹8,000 driver cycle with a ₹5,000 part payment, work across midnight, partial hours, several jobs and rates on one day, rate changes not touching old work, monthly and negative profit, date and status filters, duplicate and simultaneous payment requests, editing old work without damaging payments, permission checks for each role, user deactivation and logout.

---

## 7. Deploying (MongoDB Atlas + Vercel or Render)

### MongoDB Atlas

1. Create a free cluster at <https://cloud.mongodb.com>.
2. **Database Access**: add a database user with a strong password and only the *readWrite* role on the `tractor_tracker` database.
3. **Network Access**: allow Render's outbound IP addresses. They are listed in the Render dashboard under your service → *Connect → Outbound*. Use `0.0.0.0/0` only if you must, and keep the strong password.
4. Copy the connection string (`mongodb+srv://…/tractor_tracker?retryWrites=true&w=majority`).

### Render

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, pick the repository. `render.yaml` creates the `tractor-tracker-api` web service from `backend/`.
3. Set `MONGODB_URI` in the service's Environment tab. `JWT_SECRET` is generated automatically.
4. After the first deploy, open the service **Shell** and run:
   `npm run create-admin -- --name "Owner" --username owner --password "StrongPassword"`
5. Check `https://<your-service>.onrender.com/api/health`.

Without the blueprint, create a Web Service with: root directory `backend`, build `npm ci && npm run build`, start `npm start`, health check `/api/health`, and the variables from `backend/.env.example`.

> Render's free plan sleeps when idle, so the first request after a pause can take about a minute. The blueprint uses the low-cost *starter* plan so the owner never waits.

### Vercel (current live setup)

The app is deployed as two Vercel projects, both built from this repository:

| Project | Root directory | Live URL |
|---|---|---|
| `tractor-tracker-api` | `backend` | <https://tractor-tracker-api.vercel.app/api/health> |
| `tractor-tracker` (web app) | `mobile` | <https://tractor-tracker-orpin.vercel.app> |

- `backend/vercel.json` builds the TypeScript and sends every request to one serverless function, `backend/api/index.js`, which reuses the database connection between requests.
- `mobile/vercel.json` runs `expo export --platform web` and serves the result as a single-page app.
- **API environment variables** (Vercel → Settings → Environment Variables): `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `JWT_EXPIRES_IN`, `BUSINESS_TIMEZONE`, and `CORS_ORIGINS` (the web app's URLs, comma-separated).
- **Web app environment variable:** `EXPO_PUBLIC_API_URL=https://tractor-tracker-api.vercel.app/api`. It is baked in at build time, so redeploy after changing it.
- Atlas **Network Access** must allow `0.0.0.0/0`, because Vercel has no fixed outbound IPs. Use a strong database password.
- Pushing to `main` redeploys both projects. To create an admin against the live database, run `create-admin` locally with the production `MONGODB_URI` and `JWT_SECRET` set in your shell.

---

## 8. Building the Android APK (Expo EAS)

1. Put your Render URL in `mobile/eas.json` (both `preview` and `production` → `EXPO_PUBLIC_API_URL`), ending in `/api`.
2. Build:

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure      # first time only; links the project to your Expo account
npx eas-cli@latest build -p android --profile preview
```

3. When the build finishes, EAS shows a link and QR code. Open it on each phone, download the **.apk** and install it. Android may ask you to allow installs from the browser.

Other builds:

- Play Store bundle: `npx eas-cli@latest build -p android --profile production`
- iOS: `npx eas-cli@latest build -p ios --profile production` (needs an Apple Developer account)

> The APK must use an **https** API address (Render). Android release builds block plain `http://` addresses. Local `http://` addresses work only in development (Expo Go or a development build).

---

## 9. Using the app

- **Home**: today's (or this month's, or chosen dates') Work Amount, Money Received, Money Pending and Total Expenses, a large Profit card (red when it is a loss), the driver's current 10-day salary, and the day's work. Pull down to refresh. ⚙ opens Settings.
- **Work**: **Add New Work** has farmer (suggests existing farmers), phone, date, description, From and To time, and rate. Running time and amount are calculated before saving. Search by farmer and filter by payment status.
- **Payments**: three sections.
  - *Farmer Payments*: who still owes money, and **Record Customer Payment** (shows the pending amount; Cash / UPI / Bank; part payments allowed).
  - *Driver*: 10-day periods, and **Pay Driver** (part payments allowed).
  - *Expenses*: **Add Expense** (Diesel, Maintenance, Repair, Engine Oil, Other).
- **History**: All / Work / Payments (Farmer or Driver) / Expenses, with a date filter, farmer search and payment status. Tap a work entry to see all its payments.
- **Settings**: English / ಕನ್ನಡ, rates, driver name, cycle start date, users, log out.

Unsaved new entries are kept on the phone while typing. If the internet drops or the app closes, the form comes back as it was. Screens show the last loaded data when offline.

---

## 10. Decisions and assumptions

These choices were made where the specification left room:

- **Dates** are stored as `YYYY-MM-DD` text and times as `HH:mm`, so there are no timezone shifts. "Today" on the server uses `BUSINESS_TIMEZONE` (default `Asia/Kolkata`). The app sends its own date for the Home screen.
- **Work across midnight** belongs to the date it started.
- **Money Pending** on Home is what is still unpaid on the work done in the selected period. **Money Received** is payments dated in that period, which may be for older work.
- **The Home driver card** shows the current 10-day cycle and, separately, any unpaid salary from older cycles.
- **Corrections**: payments are cancelled (voided) with a reason rather than edited. Work and expense edits ask for confirmation and are recorded in the audit log. There is no automatic refund flow: cancel the wrong payment and record the right one.
- **Logout** signs the user out on all their devices. This keeps the token handling simple and secure.
- **Language** is chosen per phone, in Settings or on the login screen. English is the default.
- **bcryptjs** (a pure-JavaScript bcrypt) is used, so builds on Windows and Render need no native compiler.
- **NativeWind 4.2.7** officially lists Expo SDK 57. It was checked on SDK 58 with full Android and iOS production bundle exports and `expo-doctor` (20/20 checks).
