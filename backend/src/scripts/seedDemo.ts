/**
 * Fills a SEPARATE demo database with realistic sample data for trying the app.
 *
 *   DEMO_MONGODB_URI="mongodb+srv://.../tractor_tracker_demo" npm run seed:demo
 *
 * Safety: it only runs against DEMO_MONGODB_URI (never MONGODB_URI), the database name
 * must contain "demo", and it wipes that demo database first.
 * All records are created through the same services the API uses, so every amount
 * is calculated by the real business logic.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { toAuthUser } from '../middleware/auth';
import { User } from '../models';
import { allCycles, createDriverPayment } from '../services/driverService';
import { createCustomerPayment } from '../services/customerPaymentService';
import { createExpense } from '../services/expenseService';
import { getSettings } from '../services/settingsService';
import { createWork } from '../services/workService';
import { getWorkWithPayments } from '../services/workService';
import { hashPassword } from '../services/userService';
import { addDays, todayInZone } from '../utils/dates';
import { rupeesToPaise } from '../utils/money';

const FARMERS = [
  { name: 'Ramesh Gowda', phone: '9845012345' },
  { name: 'Suresh Patil', phone: '9900123456' },
  { name: 'Manjunath K', phone: '9731234567' },
  { name: 'Lakshmamma', phone: '' },
  { name: 'Basavaraj H', phone: '9611122233' },
  { name: 'Nagaraj S', phone: '9886677889' },
];
const JOBS = ['Ploughing', 'Rotavator', 'Cultivator', 'Sugarcane field levelling', 'Trailer transport', ''];
const SLOTS: [string, string][] = [
  ['07:00', '10:30'],
  ['08:00', '12:00'],
  ['11:00', '13:15'],
  ['14:00', '17:45'],
  ['15:30', '18:00'],
  ['19:00', '22:30'],
  ['22:00', '01:30'], // crosses midnight
];

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

async function main() {
  const uri = process.env.DEMO_MONGODB_URI;
  if (!uri) throw new Error('Set DEMO_MONGODB_URI to a separate demo database (its name must contain "demo").');
  const dbName = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace('/', '');
  if (!/demo/i.test(dbName)) throw new Error(`Refusing to seed: database name "${dbName}" does not contain "demo".`);
  if (uri === process.env.MONGODB_URI) throw new Error('DEMO_MONGODB_URI must be different from MONGODB_URI.');

  await connectDatabase(uri);
  console.log(`Seeding demo database "${dbName}" (existing data will be removed)...`);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  const today = todayInZone(env().BUSINESS_TIMEZONE);
  const start = addDays(today, -34);

  const settings = await getSettings();
  settings.set({
    businessName: 'Tractor Tracker (DEMO)',
    tractorHourlyRate: rupeesToPaise(800),
    driverHourlyRate: rupeesToPaise(200),
    driverName: 'Ravi (demo driver)',
    paymentCycleStartDate: start,
  });
  await settings.save();

  const pw = await hashPassword('demo1234');
  const [admin] = await User.create([
    { name: 'Owner (Demo)', username: 'owner', passwordHash: pw, role: 'admin', canEdit: true },
    { name: 'Entry (Demo)', username: 'entry', passwordHash: pw, role: 'entry', canEdit: true },
    { name: 'Viewer (Demo)', username: 'viewer', passwordHash: pw, role: 'viewer' },
  ]);
  const actor = toAuthUser(admin);

  let workCount = 0;
  for (let day = 0; day <= 34; day++) {
    const date = addDays(start, day);
    if (day === 20) {
      // Rate increase part-way through: old jobs keep their old rates.
      settings.set({ tractorHourlyRate: rupeesToPaise(850), driverHourlyRate: rupeesToPaise(220) });
      await settings.save();
    }
    if (rand() < 0.15) continue; // some days without work
    const slots = [...SLOTS].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2));
    for (const [fromTime, toTime] of slots) {
      const farmer = pick(FARMERS);
      const { id } = await createWork(
        { customerName: farmer.name, phone: farmer.phone, workDate: date, description: pick(JOBS), fromTime, toTime },
        actor,
      );
      workCount++;
      // Payments: some paid fully, some partly, some still pending.
      const work = await getWorkWithPayments(id);
      const roll = rand();
      const total = rupeesToPaise(work.totalWorkAmount);
      const payDate = day === 34 ? date : addDays(date, Math.floor(rand() * 3));
      if (roll < 0.45) {
        await createCustomerPayment({ workId: id, amount: total, paymentDate: payDate > today ? today : payDate, paymentMethod: pick(['cash', 'upi', 'bank'] as const), note: '' }, actor);
      } else if (roll < 0.75) {
        const first = Math.round(total * 0.4 / 100) * 100;
        await createCustomerPayment({ workId: id, amount: first, paymentDate: date, paymentMethod: 'cash', note: 'Advance' }, actor);
        if (rand() < 0.5) {
          await createCustomerPayment({ workId: id, amount: Math.round((total - first) / 2 / 100) * 100, paymentDate: payDate > today ? today : payDate, paymentMethod: 'upi', note: '' }, actor);
        }
      }
    }
    if (day % 3 === 0) {
      await createExpense({ expenseDate: date, category: 'diesel', amount: rupeesToPaise(1500 + Math.floor(rand() * 8) * 100), description: 'Diesel refill' }, actor);
    }
    if (day === 12) await createExpense({ expenseDate: date, category: 'engine_oil', amount: rupeesToPaise(1850), description: 'Engine oil change' }, actor);
    if (day === 18) await createExpense({ expenseDate: date, category: 'repair', amount: rupeesToPaise(3200), description: 'Hydraulic pipe repair' }, actor);
    if (day === 27) await createExpense({ expenseDate: date, category: 'other', amount: rupeesToPaise(250), description: 'Tea & snacks for helpers' }, actor);
  }

  // Driver payments: older cycles fully paid, the previous one partly paid, current one unpaid.
  const cycles = (await allCycles()).filter((c) => c.totalSalary > 0 && !c.isCurrent);
  for (const [i, c] of cycles.entries()) {
    const salary = rupeesToPaise(c.totalSalary);
    const payDate = addDays(c.endDate, 1) > today ? today : addDays(c.endDate, 1);
    if (i === 0) {
      await createDriverPayment({ cycleStartDate: c.startDate, amount: Math.min(salary, rupeesToPaise(5000)), paymentDate: payDate, paymentMethod: 'cash', note: 'Part payment' }, actor);
    } else {
      await createDriverPayment({ cycleStartDate: c.startDate, amount: salary, paymentDate: payDate, paymentMethod: 'cash', note: '' }, actor);
    }
  }

  console.log(`Done: ${workCount} jobs, ${FARMERS.length} farmers, ${cycles.length} driver cycles.`);
  console.log('Demo logins (password demo1234): owner (Admin), entry (Work Entry), viewer (Viewer)');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
