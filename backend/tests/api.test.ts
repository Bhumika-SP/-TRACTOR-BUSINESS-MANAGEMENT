import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../src/models';
import { client, createUser, loginAs, startTestApp, stopTestApp } from './helpers';

let app: Express;
let admin: ReturnType<typeof client>;
let entry: ReturnType<typeof client>; // Work Entry user WITHOUT edit permission
let viewer: ReturnType<typeof client>;

const work = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Ramesh',
  phone: '9845012345',
  workDate: '2026-11-09',
  fromTime: '08:00',
  toTime: '12:00',
  description: 'Ploughing',
  ...overrides,
});

beforeAll(async () => {
  app = await startTestApp();
  await createUser('owner', 'admin', true);
  await createUser('entry', 'entry', false);
  await createUser('viewer', 'viewer');
  admin = client(app, await loginAs(app, 'owner'));
  entry = client(app, await loginAs(app, 'entry'));
  viewer = client(app, await loginAs(app, 'viewer'));
  const s = await admin.patch('/settings', {
    tractorHourlyRate: 800,
    driverHourlyRate: 200,
    driverName: 'Ravi',
    paymentCycleStartDate: '2026-11-01',
  });
  expect(s.status).toBe(200);
});

afterAll(async () => {
  await stopTestApp();
});

describe('authentication', () => {
  it('rejects wrong passwords and missing tokens', async () => {
    const bad = await request(app).post('/api/auth/login').send({ username: 'owner', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.success).toBe(false);
    expect((await request(app).get('/api/works')).status).toBe(401);
  });

  it('returns the current user', async () => {
    const res = await admin.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ username: 'owner', role: 'admin', canEdit: true });
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('deactivated users are signed out immediately', async () => {
    const u = await createUser('temp', 'viewer');
    const temp = client(app, await loginAs(app, 'temp'));
    expect((await temp.get('/works')).status).toBe(200);
    expect((await admin.delete(`/users/${u._id}`)).status).toBe(200);
    expect((await temp.get('/works')).status).toBe(401);
  });

  it('logout invalidates the token', async () => {
    await createUser('temp2', 'viewer');
    const temp = client(app, await loginAs(app, 'temp2'));
    expect((await temp.post('/auth/logout')).status).toBe(200);
    expect((await temp.get('/works')).status).toBe(401);
  });
});

describe('specification example: Ramesh', () => {
  let workId: string;

  it('calculates 4 hours × ₹800 = ₹3,200', async () => {
    const res = await entry.post('/works', work({ requestId: 'req-ramesh-0001' }));
    expect(res.status).toBe(201);
    workId = res.body.data.id;
    expect(res.body.data).toMatchObject({
      customerName: 'Ramesh',
      workingMinutes: 240,
      workingHours: 4,
      tractorHourlyRate: 800,
      totalWorkAmount: 3200,
      driverHourlyRate: 200,
      driverSalary: 800,
      amountReceived: 0,
      pendingAmount: 3200,
      paymentStatus: 'pending',
    });
  });

  it('ignores a duplicate submission of the same work form', async () => {
    const again = await entry.post('/works', work({ requestId: 'req-ramesh-0001' }));
    expect(again.status).toBe(200);
    expect(again.body.meta.duplicate).toBe(true);
    expect(again.body.data.id).toBe(workId);
    const list = await admin.get('/works', { from: '2026-11-09', to: '2026-11-09' });
    expect(list.body.meta.total).toBe(1);
  });

  it('dashboard: income ₹3,200, expenses ₹1,500, profit ₹1,700', async () => {
    expect((await entry.post('/expenses', { expenseDate: '2026-11-09', category: 'diesel', amount: 600 })).status).toBe(201);
    expect((await entry.post('/expenses', { expenseDate: '2026-11-09', category: 'other', amount: 100, description: 'Tea' })).status).toBe(201);
    const res = await viewer.get('/dashboard/summary', { date: '2026-11-09' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      workAmount: 3200,
      driverSalary: 800,
      dieselExpenses: 600,
      otherExpenses: 100,
      totalExpenses: 1500,
      profit: 1700,
      moneyReceived: 0,
      moneyPending: 3200,
    });
    expect(res.body.data.works).toHaveLength(1);
  });

  it('records multiple payments without overwriting: ₹1,000 + ₹1,000 → ₹1,200 pending', async () => {
    const p1 = await entry.post('/customer-payments', { workId, amount: 1000, paymentDate: '2026-11-09', paymentMethod: 'cash', requestId: 'pay-0000001' });
    expect(p1.status).toBe(201);
    const p2 = await entry.post('/customer-payments', { workId, amount: 1000, paymentDate: '2026-11-10', paymentMethod: 'upi' });
    expect(p2.status).toBe(201);
    const w = await viewer.get(`/works/${workId}`);
    expect(w.body.data).toMatchObject({ amountReceived: 2000, pendingAmount: 1200, paymentStatus: 'partial' });
    expect(w.body.data.payments).toHaveLength(2);
    expect(w.body.data.payments.map((p: { amount: number }) => p.amount)).toEqual([1000, 1000]);
  });

  it('a duplicate payment request is processed only once', async () => {
    const dup = await entry.post('/customer-payments', { workId, amount: 1000, paymentDate: '2026-11-09', paymentMethod: 'cash', requestId: 'pay-0000001' });
    expect(dup.status).toBe(200);
    expect(dup.body.meta.duplicate).toBe(true);
    const w = await viewer.get(`/works/${workId}`);
    expect(w.body.data.pendingAmount).toBe(1200);
  });

  it('prevents paying more than the pending amount', async () => {
    const res = await entry.post('/customer-payments', { workId, amount: 1200.01, paymentDate: '2026-11-10', paymentMethod: 'cash' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.pendingAmount).toBe(1200);
  });

  it('dashboard money received only counts payments dated in the period', async () => {
    const d9 = await viewer.get('/dashboard/summary', { date: '2026-11-09' });
    expect(d9.body.data).toMatchObject({ moneyReceived: 1000, moneyPending: 1200, profit: 1700 });
    const d10 = await viewer.get('/dashboard/summary', { date: '2026-11-10' });
    expect(d10.body.data).toMatchObject({ moneyReceived: 1000, workAmount: 0, profit: 0 });
  });

  it('the final ₹1,200 marks the work as Paid', async () => {
    const res = await entry.post('/customer-payments', { workId, amount: 1200, paymentDate: '2026-11-10', paymentMethod: 'bank' });
    expect(res.status).toBe(201);
    const w = await viewer.get(`/works/${workId}`);
    expect(w.body.data).toMatchObject({ amountReceived: 3200, pendingAmount: 0, paymentStatus: 'paid' });
    const more = await entry.post('/customer-payments', { workId, amount: 1, paymentDate: '2026-11-10', paymentMethod: 'cash' });
    expect(more.status).toBe(409);
  });

  it('reuses the existing farmer instead of creating a duplicate', async () => {
    await entry.post('/works', work({ customerName: '  ramesh ', workDate: '2026-11-08', fromTime: '14:00', toTime: '15:00' }));
    const customers = await viewer.get('/customers', { search: 'ramesh' });
    expect(customers.body.data).toHaveLength(1);
  });
});

describe('work time rules', () => {
  it('work crossing midnight', async () => {
    const res = await entry.post('/works', work({ customerName: 'Night Farmer', workDate: '2026-11-05', fromTime: '22:00', toTime: '01:30' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ workingMinutes: 210, totalWorkAmount: 2800, driverSalary: 700 });
  });

  it('partial hours with a custom rate', async () => {
    const res = await entry.post('/works', work({ customerName: 'Partial', workDate: '2026-11-05', fromTime: '08:00', toTime: '10:20', tractorHourlyRate: 750 }));
    expect(res.body.data).toMatchObject({ workingMinutes: 140, tractorHourlyRate: 750, totalWorkAmount: 1750 });
  });

  it('rejects equal from/to times and invalid input', async () => {
    expect((await entry.post('/works', work({ fromTime: '09:00', toTime: '09:00' }))).status).toBe(400);
    expect((await entry.post('/works', work({ workDate: '2026-02-30' }))).status).toBe(400);
    expect((await entry.post('/works', work({ fromTime: '25:00' }))).status).toBe(400);
    expect((await entry.post('/works', work({ customerName: '' }))).status).toBe(400);
  });

  it('multiple jobs on the same day with different rates add up', async () => {
    const day = '2026-11-04';
    await entry.post('/works', work({ customerName: 'A', workDate: day, fromTime: '07:00', toTime: '09:00', tractorHourlyRate: 800 }));
    await entry.post('/works', work({ customerName: 'B', workDate: day, fromTime: '10:00', toTime: '11:30', tractorHourlyRate: 900 }));
    const res = await viewer.get('/dashboard/summary', { date: day });
    expect(res.body.data).toMatchObject({
      workCount: 2,
      workAmount: 1600 + 1350,
      driverSalary: 400 + 300,
      totalExpenses: 700,
      profit: 2250,
    });
  });
});

describe('permissions', () => {
  it('viewer cannot add, edit or delete anything', async () => {
    expect((await viewer.post('/works', work())).status).toBe(403);
    expect((await viewer.post('/expenses', { expenseDate: '2026-11-09', category: 'diesel', amount: 100 })).status).toBe(403);
    expect((await viewer.patch('/settings', { tractorHourlyRate: 1 })).status).toBe(403);
    expect((await viewer.get('/users')).status).toBe(403);
  });

  it('work entry user without edit permission cannot change existing records', async () => {
    const created = await entry.post('/works', work({ customerName: 'Perm', workDate: '2026-11-03' }));
    const id = created.body.data.id;
    expect((await entry.patch(`/works/${id}`, { toTime: '13:00' })).status).toBe(403);
    expect((await entry.delete(`/works/${id}`, { reason: 'mistake' })).status).toBe(403);
    expect((await entry.patch('/settings', { tractorHourlyRate: 1 })).status).toBe(403);
  });

  it('work entry user WITH edit permission can correct records', async () => {
    await createUser('editor', 'entry', true);
    const editor = client(app, await loginAs(app, 'editor'));
    const created = await editor.post('/works', work({ customerName: 'Editable', workDate: '2026-11-03' }));
    const res = await editor.patch(`/works/${created.body.data.id}`, { toTime: '13:00', reason: 'Wrong end time' });
    expect(res.status).toBe(200);
    expect(res.body.data.totalWorkAmount).toBe(4000);
  });
});

describe('editing and deleting history safely', () => {
  it('editing keeps payments and the saved rates; refuses edits below money received', async () => {
    const created = await admin.post('/works', work({ customerName: 'Edit Test', workDate: '2026-11-02' }));
    const id = created.body.data.id;
    await admin.post('/customer-payments', { workId: id, amount: 2000, paymentDate: '2026-11-02', paymentMethod: 'cash' });

    // Change default rates: the saved job must not change.
    await admin.patch('/settings', { tractorHourlyRate: 1000, driverHourlyRate: 300 });
    const unchanged = await viewer.get(`/works/${id}`);
    expect(unchanged.body.data).toMatchObject({ totalWorkAmount: 3200, tractorHourlyRate: 800, driverHourlyRate: 200 });

    // 08:00–10:00 = ₹1,600 < ₹2,000 already received → refused.
    const tooLow = await admin.patch(`/works/${id}`, { toTime: '10:00' });
    expect(tooLow.status).toBe(409);

    // 08:00–11:00 = ₹2,400: allowed, uses the job's saved ₹800 rate, payments untouched.
    const ok = await admin.patch(`/works/${id}`, { toTime: '11:00', reason: 'Correct end time' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ workingMinutes: 180, totalWorkAmount: 2400, driverSalary: 600, amountReceived: 2000, pendingAmount: 400 });
    expect(ok.body.data.payments).toHaveLength(1);

    // New jobs use the new default rates.
    const fresh = await admin.post('/works', work({ customerName: 'New Rate', workDate: '2026-11-02', fromTime: '13:00', toTime: '14:00' }));
    expect(fresh.body.data).toMatchObject({ tractorHourlyRate: 1000, totalWorkAmount: 1000, driverSalary: 300 });
    await admin.patch('/settings', { tractorHourlyRate: 800, driverHourlyRate: 200 });

    // Audit trail exists for the edit.
    const logs = await AuditLog.find({ entityId: id, action: 'update' });
    expect(logs).toHaveLength(1);
    expect(logs[0].reason).toBe('Correct end time');
  });

  it('cannot delete work with payments; cancelling a payment restores the pending amount', async () => {
    const created = await admin.post('/works', work({ customerName: 'Delete Test', workDate: '2026-11-02', fromTime: '15:00', toTime: '16:00' }));
    const id = created.body.data.id;
    const pay = await admin.post('/customer-payments', { workId: id, amount: 500, paymentDate: '2026-11-02', paymentMethod: 'cash' });
    expect((await admin.delete(`/works/${id}`, { reason: 'Entered twice' })).status).toBe(409);

    const voided = await admin.post(`/customer-payments/${pay.body.data.id}/void`, { reason: 'Wrong farmer' });
    expect(voided.status).toBe(200);
    expect(voided.body.data.isVoided).toBe(true);
    expect((await viewer.get(`/works/${id}`)).body.data.pendingAmount).toBe(800);

    expect((await admin.delete(`/works/${id}`)).status).toBe(400); // reason required
    expect((await admin.delete(`/works/${id}`, { reason: 'Entered twice' })).status).toBe(200);
    expect((await viewer.get(`/works/${id}`)).status).toBe(404);
  });

  it('concurrent payments cannot exceed the pending amount', async () => {
    const created = await admin.post('/works', work({ customerName: 'Race', workDate: '2026-11-01', fromTime: '06:00', toTime: '07:00' }));
    const id = created.body.data.id; // ₹800
    const results = await Promise.all(
      [1, 2, 3].map(() => entry.post('/customer-payments', { workId: id, amount: 500, paymentDate: '2026-11-01', paymentMethod: 'cash' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await viewer.get(`/works/${id}`)).body.data.amountReceived).toBe(500);
  });
});

describe('driver salary — 10-day cycles', () => {
  // Cycle 2026-11-11 … 2026-11-20: ten 4-hour jobs = 40 hours.
  it('40 hours at ₹200 = ₹8,000; pay ₹5,000 → ₹3,000 remaining; then fully paid', async () => {
    for (let d = 11; d <= 20; d++) {
      const r = await entry.post('/works', work({ customerName: `Cycle ${d}`, workDate: `2026-11-${d}` }));
      expect(r.status).toBe(201);
    }
    const cycles = await viewer.get('/driver-payments/cycles', { limit: 50 });
    const c = cycles.body.data.find((x: { startDate: string }) => x.startDate === '2026-11-11');
    expect(c).toMatchObject({ endDate: '2026-11-20', workingHours: 40, hourlyRate: 200, totalSalary: 8000, amountPaid: 0, remaining: 8000, status: 'pending' });

    const pay = await entry.post('/driver-payments', { cycleStartDate: '2026-11-11', amount: 5000, paymentDate: '2026-11-21', paymentMethod: 'cash', requestId: 'drv-pay-0001' });
    expect(pay.status).toBe(201);
    expect(pay.body.data).toMatchObject({ totalSalary: 8000, amountPaid: 5000, balanceAfter: 3000 });

    const dup = await entry.post('/driver-payments', { cycleStartDate: '2026-11-11', amount: 5000, paymentDate: '2026-11-21', paymentMethod: 'cash', requestId: 'drv-pay-0001' });
    expect(dup.status).toBe(200);

    const detail = await viewer.get('/driver-payments/cycles/2026-11-11');
    expect(detail.body.data).toMatchObject({ totalSalary: 8000, amountPaid: 5000, remaining: 3000, status: 'partial' });

    expect((await entry.post('/driver-payments', { cycleStartDate: '2026-11-11', amount: 3001, paymentDate: '2026-11-22', paymentMethod: 'cash' })).status).toBe(400);
    expect((await entry.post('/driver-payments', { cycleStartDate: '2026-11-12', amount: 10, paymentDate: '2026-11-22', paymentMethod: 'cash' })).status).toBe(400);

    const rest = await entry.post('/driver-payments', { cycleStartDate: '2026-11-11', amount: 3000, paymentDate: '2026-11-22', paymentMethod: 'upi' });
    expect(rest.body.data.balanceAfter).toBe(0);
    const after = await viewer.get('/driver-payments/cycles/2026-11-11');
    expect(after.body.data).toMatchObject({ remaining: 0, status: 'paid' });
    expect(after.body.data.payments).toHaveLength(2);
  });

  it('salary is spread over multiple cycles and paying the driver does not reduce profit', async () => {
    const cycles = await viewer.get('/driver-payments/cycles', { limit: 50 });
    const first = cycles.body.data.find((x: { startDate: string }) => x.startDate === '2026-11-01');
    expect(first.totalSalary).toBeGreaterThan(0);
    expect(first.status).toBe('pending');

    const before = await viewer.get('/dashboard/summary', { from: '2026-11-11', to: '2026-11-22' });
    // Work income ₹32,000; driver salary ₹8,000 earned; no other expenses; ₹8,000 paid as cash.
    expect(before.body.data).toMatchObject({ workAmount: 32000, driverSalary: 8000, totalExpenses: 8000, profit: 24000, driverPaymentsMade: 8000 });
    // Cash: nothing received from these farmers, ₹8,000 paid to driver.
    expect(before.body.data.cashBalance).toBe(-8000);

    const summary = await viewer.get('/dashboard/driver-summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.currentCycle).toHaveProperty('totalSalary');
  });

  it('settings refuses a cycle start date that would break existing driver payments', async () => {
    expect((await admin.patch('/settings', { paymentCycleStartDate: '2026-11-05' })).status).toBe(400);
    expect((await admin.patch('/settings', { paymentCycleStartDate: '2026-10-22' })).status).toBe(200);
    await admin.patch('/settings', { paymentCycleStartDate: '2026-11-01' });
  });
});

describe('filters, monthly profit, negative profit and history', () => {
  it('monthly profit and negative profit', async () => {
    await entry.post('/expenses', { expenseDate: '2026-10-15', category: 'repair', amount: 5000, description: 'Clutch repair' });
    const oct = await viewer.get('/dashboard/summary', { month: '2026-10' });
    expect(oct.body.data).toMatchObject({ workAmount: 0, totalExpenses: 5000, profit: -5000 });
    expect(oct.body.data.period).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });

    const nov = await viewer.get('/dashboard/summary', { month: '2026-11' });
    expect(nov.body.data.workAmount).toBeGreaterThan(32000);
    expect(nov.body.data.profit).toBe(nov.body.data.workAmount - nov.body.data.totalExpenses);
  });

  it('date range, farmer search and status filters', async () => {
    const range = await viewer.get('/works', { from: '2026-11-11', to: '2026-11-15' });
    expect(range.body.meta.total).toBe(5);
    expect(range.body.meta.totals.workAmount).toBe(16000);

    const search = await viewer.get('/works', { search: 'rames' });
    expect(search.body.data.every((w: { customerName: string }) => w.customerName === 'Ramesh')).toBe(true);

    const paid = await viewer.get('/works', { status: 'paid', search: 'ramesh' });
    expect(paid.body.data).toHaveLength(1);
    const due = await viewer.get('/works', { status: 'due', from: '2026-11-11', to: '2026-11-20' });
    expect(due.body.meta.total).toBe(10);
  });

  it('pagination', async () => {
    const p1 = await viewer.get('/works', { limit: 3, page: 1 });
    const p2 = await viewer.get('/works', { limit: 3, page: 2 });
    expect(p1.body.data).toHaveLength(3);
    expect(p1.body.meta.totalPages).toBeGreaterThan(1);
    expect(p1.body.data[0].id).not.toBe(p2.body.data[0].id);
  });

  it('combined history timeline and expense edits', async () => {
    const all = await viewer.get('/history', { type: 'all', from: '2026-11-09', to: '2026-11-10' });
    const types = new Set(all.body.data.map((i: { type: string }) => i.type));
    expect(types).toEqual(new Set(['work', 'customer_payment', 'expense']));

    const ex = await entry.post('/expenses', { expenseDate: '2026-11-09', category: 'diesel', amount: 50 });
    expect((await entry.patch(`/expenses/${ex.body.data.id}`, { amount: 60 })).status).toBe(403);
    const edited = await admin.patch(`/expenses/${ex.body.data.id}`, { amount: 60, reason: 'Typo' });
    expect(edited.body.data.amount).toBe(60);
    expect((await admin.delete(`/expenses/${ex.body.data.id}`, { reason: 'Duplicate' })).status).toBe(200);
    const d = await viewer.get('/dashboard/summary', { date: '2026-11-09' });
    expect(d.body.data.dieselExpenses).toBe(600);
  });
});

describe('user management', () => {
  it('admin creates users; usernames are unique; last admin is protected', async () => {
    const res = await admin.post('/users', { name: 'Son', username: 'son', password: 'secret123', role: 'entry', canEdit: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ username: 'son', role: 'entry', canEdit: true });
    expect((await admin.post('/users', { name: 'X', username: 'son', password: 'secret123', role: 'viewer' })).status).toBe(409);
    const me = await admin.get('/auth/me');
    expect((await admin.patch(`/users/${me.body.data.user.id}`, { role: 'viewer' })).status).toBe(400);
  });
});
