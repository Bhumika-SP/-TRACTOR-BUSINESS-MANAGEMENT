# Tractor Tracker API

Base URL: `https://<your-service>.onrender.com/api` (local: `http://localhost:4000/api`)

## Conventions

- **Auth**: every route except `POST /auth/login` and `GET /health` needs `Authorization: Bearer <token>`.
- **Money**: rupees as numbers with up to 2 decimals (for example `3200` or `933.33`). The server stores paise internally.
- **Dates**: `YYYY-MM-DD`. **Times**: `HH:mm` (24-hour). **Months**: `YYYY-MM`.
- **Success**: `{ "success": true, "data": …, "meta"?: … }`
- **Error**: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details"?: … } }`

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` / `BAD_REQUEST` | Invalid input, or a business rule was broken (for example, amount more than pending) |
| 401 | `UNAUTHORIZED` | Missing or expired token, logged out, or user deactivated |
| 403 | `FORBIDDEN` | The role is not allowed to do this |
| 404 | `NOT_FOUND` | Record not found |
| 409 | `CONFLICT` / `BUSY` | Already fully paid, has payments, simultaneous change; try again |
| 429 | `TOO_MANY_REQUESTS` | Rate limit (login: 10 per 15 minutes per IP) |

- **Lists** take `page` (default 1) and `limit` (default 20, max 100). `meta` = `{ page, limit, total, totalPages, … }`.
- **Duplicate protection**: create endpoints accept an optional `requestId` (8–100 chars, for example a UUID made once per form). Repeating a request with the same `requestId` returns the existing record with status `200` and `meta.duplicate: true` instead of creating a second one.

Roles: **admin**, **entry** (Work Entry), **viewer**. "Correct" means admin, or an entry user with `canEdit: true`.

---

## Auth

| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/auth/login` | anyone | `{ username, password }` → `{ token, user }` |
| GET | `/auth/me` | any user | → `{ user, permissions }` |
| POST | `/auth/logout` | any user | Invalidates all of the user's tokens |

## Users (admin only)

| Method | Path | Body |
|---|---|---|
| GET | `/users` | — |
| POST | `/users` | `{ name, username, password (≥6), role, canEdit? }` |
| PATCH | `/users/:id` | any of `{ name, role, canEdit, isActive, password }` |
| DELETE | `/users/:id` | Deactivates the user (never deleted) |

The last active admin cannot be demoted or deactivated, and an admin cannot remove their own admin access.

## Customers (farmers)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/customers?search=` | any | Search by name or phone |
| POST | `/customers` | admin, entry | `{ name, phone?, address? }` |
| GET | `/customers/:id` | any | Includes the farmer's work and totals |
| PATCH | `/customers/:id` | correct | `{ name?, phone?, address? }` |

## Work

| Method | Path | Who |
|---|---|---|
| GET | `/works` | any |
| POST | `/works` | admin, entry |
| GET | `/works/:id` | any |
| PATCH | `/works/:id` | correct |
| DELETE | `/works/:id` | correct, body `{ reason }` (soft delete) |

**GET /works** filters: `from`, `to`, `search` (farmer name/phone), `status` = `paid` \| `partial` \| `pending` \| `due` (anything unpaid), `customerId`. `meta.totals` = `{ workAmount, received, pending, workingMinutes }` for all matching work.

**POST /works**

```json
{
  "customerName": "Ramesh",            // or "customerId": "<existing id>"
  "phone": "9845012345",
  "workDate": "2026-11-09",
  "description": "Ploughing",
  "fromTime": "08:00",
  "toTime": "12:00",
  "tractorHourlyRate": 800,            // optional, defaults to Settings
  "requestId": "6f1c…"
}
```

An existing farmer with the same name (case-insensitive) and phone is reused. The response is a work object:

```json
{
  "id": "…", "customerId": "…", "customerName": "Ramesh", "customerPhone": "9845012345",
  "workDate": "2026-11-09", "fromTime": "08:00", "toTime": "12:00",
  "workingMinutes": 240, "workingHours": 4,
  "tractorHourlyRate": 800, "totalWorkAmount": 3200,
  "driverHourlyRate": 200, "driverWorkingMinutes": 240, "driverSalary": 800,
  "amountReceived": 0, "pendingAmount": 3200, "paymentStatus": "pending",
  "payments": [], "relatedExpenses": []
}
```

**PATCH /works/:id** takes any of `customerId | customerName, phone, workDate, description, fromTime, toTime, tractorHourlyRate, reason`. The amount is recalculated from the job's saved rate unless a new rate is given. The saved driver rate is kept. It returns `409` if the new amount would be less than the money already received.

**DELETE /works/:id** returns `409` while the work has active payments.

## Customer payments

| Method | Path | Who |
|---|---|---|
| GET | `/customer-payments` | any. Filters: `from`, `to`, `search`, `workId`, `method`. `meta.totalAmount` |
| POST | `/customer-payments` | admin, entry |
| GET | `/customer-payments/:id` | any |
| POST | `/customer-payments/:id/void` | correct, body `{ reason }`. Cancels the payment; it stays in history |

```json
{ "workId": "…", "amount": 1000, "paymentDate": "2026-11-09", "paymentMethod": "cash", "note": "", "requestId": "…" }
```

`paymentMethod`: `cash` \| `upi` \| `bank`. The server returns `400` if the amount is more than the pending amount (`error.details.pendingAmount`), `409` if the work is already fully paid, and `400` if the payment date is before the work date.

## Driver payments and 10-day cycles

| Method | Path | Who |
|---|---|---|
| GET | `/driver-payments` | any. Filters: `from`, `to`, `cycleStartDate` |
| GET | `/driver-payments/cycles` | any. `status` = `paid` \| `pending`; newest first |
| GET | `/driver-payments/cycles/:startDate` | any. One cycle with its payments |
| POST | `/driver-payments` | admin, entry |
| GET | `/driver-payments/:id` | any |
| POST | `/driver-payments/:id/void` | correct, body `{ reason }` |

Cycle object:

```json
{
  "startDate": "2026-11-11", "endDate": "2026-11-20", "isCurrent": false,
  "workCount": 10, "workingMinutes": 2400, "workingHours": 40,
  "hourlyRate": 200, "hourlyRates": [200],
  "totalSalary": 8000, "amountPaid": 5000, "remaining": 3000, "overpaid": 0,
  "status": "partial", "paymentCount": 1
}
```

`status`: `paid` \| `partial` \| `pending` \| `no_work`.

**POST /driver-payments**

```json
{ "cycleStartDate": "2026-11-11", "amount": 5000, "paymentDate": "2026-11-21", "paymentMethod": "cash", "note": "", "requestId": "…" }
```

`cycleStartDate` must be the start of a cycle. The amount cannot be more than the remaining salary. Each payment record stores a snapshot of the cycle (`totalWorkingMinutes`, `hourlyRate`, `totalSalary`) and returns `balanceAfter`.

## Expenses

| Method | Path | Who |
|---|---|---|
| GET | `/expenses` | any. Filters: `from`, `to`, `category`, `search` (description). `meta.totalAmount` |
| POST | `/expenses` | admin, entry |
| GET | `/expenses/:id` | any |
| PATCH | `/expenses/:id` | correct, may include `reason` |
| DELETE | `/expenses/:id` | correct, body `{ reason }` (soft delete) |

```json
{ "expenseDate": "2026-11-09", "category": "diesel", "amount": 600, "description": "", "relatedWorkId": null, "requestId": "…" }
```

`category`: `diesel` \| `maintenance` \| `repair` \| `engine_oil` \| `other`.

## Dashboard

`GET /dashboard/summary` takes **one** of:

- `?date=2026-11-09` for one day (no parameters = today in `BUSINESS_TIMEZONE`)
- `?month=2026-11` for one calendar month
- `?from=2026-11-01&to=2026-11-15` for a custom range

```json
{
  "period": { "type": "day", "from": "2026-11-09", "to": "2026-11-09" },
  "workCount": 1, "workingMinutes": 240,
  "workAmount": 3200,
  "moneyReceived": 1000,
  "moneyPending": 2200,
  "driverSalary": 800, "dieselExpenses": 600, "otherExpenses": 100,
  "totalExpenses": 1500,
  "profit": 1700,
  "driverPaymentsMade": 0,
  "cashBalance": 300,
  "works": [ /* work objects in the period, newest first (max 50) */ ]
}
```

`GET /dashboard/driver-summary` returns `{ driverName, driverHourlyRate, currentCycle, olderUnpaid, olderUnpaidCycles }`.

## History

`GET /history?type=all|work|payments|expenses&from=&to=&search=&page=&limit=` returns one newest-first timeline:

```json
{ "type": "work | customer_payment | driver_payment | expense", "id": "…", "date": "2026-11-09",
  "title": "Ramesh", "subtitle": "08:00-12:00", "amount": 3200, "status": "partial", "data": { /* full record */ } }
```

## Settings

| Method | Path | Who |
|---|---|---|
| GET | `/settings` | any |
| PATCH | `/settings` | admin |

```json
{ "businessName": "Tractor Tracker", "tractorHourlyRate": 800, "driverHourlyRate": 200,
  "driverName": "Ravi", "paymentCycleStartDate": "2026-11-01", "language": "en" }
```

A new `paymentCycleStartDate` is refused (`400`) if it would misalign cycles that already have driver payments. It must be a multiple of 10 days from them.

## Health

`GET /health` → `{ "success": true, "data": { "status": "ok" } }` (no auth)
