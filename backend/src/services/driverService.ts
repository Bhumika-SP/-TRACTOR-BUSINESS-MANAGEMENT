import { Types, type ClientSession } from 'mongoose';
import { env } from '../config/env';
import { DriverPayment, Work } from '../models';
import type { AuthUser } from '../middleware/auth';
import { todayInZone } from '../utils/dates';
import { badRequest, conflict, notFound } from '../utils/errors';
import { paiseToRupees, sum } from '../utils/money';
import { audit, isDuplicateKeyError, runInTransaction, snapshot, takeLock } from '../utils/tx';
import { calcDriverSalary, cycleByIndex, cycleForDate, type Cycle } from './calculations';
import { serializeDriverPayment, type DriverPaymentRecord } from './serializers';
import { getSettings } from './settingsService';

export type CycleStatus = 'paid' | 'partial' | 'pending' | 'no_work';

export interface CycleTotals {
  workCount: number;
  workingMinutes: number;
  totalSalary: number; // paise
  rates: number[]; // distinct driver rates used (paise/hour)
}

interface WorkMini {
  workDate: string;
  driverWorkingMinutes: number;
  driverHourlyRateSnapshot: number;
}

function totalsOf(works: WorkMini[]): CycleTotals {
  return {
    workCount: works.length,
    workingMinutes: sum(works.map((w) => w.driverWorkingMinutes)),
    totalSalary: sum(works.map((w) => calcDriverSalary(w.driverWorkingMinutes, w.driverHourlyRateSnapshot))),
    rates: [...new Set(works.map((w) => w.driverHourlyRateSnapshot))].sort((a, b) => a - b),
  };
}

async function worksBetween(from: string, to: string, session?: ClientSession): Promise<WorkMini[]> {
  return Work.find(
    { isDeleted: false, workDate: { $gte: from, $lte: to } },
    { workDate: 1, driverWorkingMinutes: 1, driverHourlyRateSnapshot: 1 },
  )
    .session(session ?? null)
    .lean();
}

export async function cycleTotals(cycle: Cycle, session?: ClientSession): Promise<CycleTotals> {
  return totalsOf(await worksBetween(cycle.startDate, cycle.endDate, session));
}

async function paidForCycle(cycleStartDate: string, session?: ClientSession): Promise<number> {
  const rows = await DriverPayment.aggregate<{ total: number }>([
    { $match: { cycleStartDate, isVoided: false } },
    { $group: { _id: null, total: { $sum: '$amountPaid' } } },
  ]).session(session ?? null);
  return rows[0]?.total ?? 0;
}

function statusOf(salary: number, paid: number): CycleStatus {
  if (salary === 0 && paid === 0) return 'no_work';
  if (paid >= salary) return 'paid';
  return paid > 0 ? 'partial' : 'pending';
}

/** Average rate for display when several rates were used in one cycle. */
function effectiveRate(t: CycleTotals, fallback: number): number {
  if (t.rates.length === 1) return t.rates[0];
  if (t.workingMinutes > 0) return Math.round((t.totalSalary * 60) / t.workingMinutes);
  return fallback;
}

function serializeCycle(cycle: Cycle, t: CycleTotals, paid: number, today: string, fallbackRate: number, paymentCount = 0) {
  return {
    index: cycle.index,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    isCurrent: cycle.startDate <= today && today <= cycle.endDate,
    workCount: t.workCount,
    workingMinutes: t.workingMinutes,
    workingHours: Math.round((t.workingMinutes / 60) * 100) / 100,
    hourlyRate: paiseToRupees(effectiveRate(t, fallbackRate)),
    hourlyRates: t.rates.map(paiseToRupees),
    totalSalary: paiseToRupees(t.totalSalary),
    amountPaid: paiseToRupees(paid),
    remaining: paiseToRupees(Math.max(0, t.totalSalary - paid)),
    overpaid: paiseToRupees(Math.max(0, paid - t.totalSalary)),
    status: statusOf(t.totalSalary, paid),
    paymentCount,
  };
}

export type SerializedCycle = ReturnType<typeof serializeCycle>;

/** Every cycle from the first recorded work (or payment) up to the current cycle, newest first. */
export async function allCycles(): Promise<SerializedCycle[]> {
  const settings = await getSettings();
  const start = settings.paymentCycleStartDate;
  const today = todayInZone(env().BUSINESS_TIMEZONE);
  const current = cycleForDate(today, start);

  const [firstWork, lastWork, firstPayment] = await Promise.all([
    Work.findOne({ isDeleted: false }, { workDate: 1 }).sort({ workDate: 1 }).lean(),
    Work.findOne({ isDeleted: false }, { workDate: 1 }).sort({ workDate: -1 }).lean(),
    DriverPayment.findOne({ isVoided: false }, { cycleStartDate: 1 }).sort({ cycleStartDate: 1 }).lean(),
  ]);
  const minIdx = Math.min(
    current.index,
    firstWork ? cycleForDate(firstWork.workDate, start).index : current.index,
    firstPayment ? cycleForDate(firstPayment.cycleStartDate, start).index : current.index,
  );
  const maxIdx = Math.max(current.index, lastWork ? cycleForDate(lastWork.workDate, start).index : current.index);

  const first = cycleByIndex(minIdx, start);
  const last = cycleByIndex(maxIdx, start);
  const works = await worksBetween(first.startDate, last.endDate);
  const payments = await DriverPayment.aggregate<{ _id: string; total: number; count: number }>([
    { $match: { isVoided: false } },
    { $group: { _id: '$cycleStartDate', total: { $sum: '$amountPaid' }, count: { $sum: 1 } } },
  ]);
  const paidMap = new Map(payments.map((p) => [p._id, p]));

  const buckets = new Map<number, WorkMini[]>();
  for (const w of works) {
    const idx = cycleForDate(w.workDate, start).index;
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx)!.push(w);
  }

  const cycles: SerializedCycle[] = [];
  for (let i = maxIdx; i >= minIdx; i--) {
    const c = cycleByIndex(i, start);
    const p = paidMap.get(c.startDate);
    cycles.push(serializeCycle(c, totalsOf(buckets.get(i) ?? []), p?.total ?? 0, today, settings.driverHourlyRate, p?.count ?? 0));
  }
  return cycles;
}

export async function listCycles(f: { status?: 'paid' | 'pending'; page: number; limit: number; skip: number }) {
  let cycles = await allCycles();
  if (f.status === 'paid') cycles = cycles.filter((c) => c.status === 'paid');
  if (f.status === 'pending') cycles = cycles.filter((c) => c.status === 'pending' || c.status === 'partial');
  return { items: cycles.slice(f.skip, f.skip + f.limit), total: cycles.length };
}

export async function getCycle(cycleStartDate: string) {
  const settings = await getSettings();
  const cycle = cycleForDate(cycleStartDate, settings.paymentCycleStartDate);
  if (cycle.startDate !== cycleStartDate) throw badRequest('This date is not the start of a driver payment cycle');
  const today = todayInZone(env().BUSINESS_TIMEZONE);
  const [totals, payments] = await Promise.all([
    cycleTotals(cycle),
    DriverPayment.find({ cycleStartDate }).sort({ paymentDate: 1, createdAt: 1 }).lean(),
  ]);
  const active = payments.filter((p) => !p.isVoided);
  const paid = sum(active.map((p) => p.amountPaid));
  return {
    ...serializeCycle(cycle, totals, paid, today, settings.driverHourlyRate, active.length),
    driverName: settings.driverName,
    payments: withBalances(payments as DriverPaymentRecord[]),
  };
}

/** Driver card on the Home screen: the current 10-day cycle plus any older salary still unpaid. */
export async function driverSummary() {
  const settings = await getSettings();
  const cycles = await allCycles();
  const current = cycles.find((c) => c.isCurrent)!;
  const olderUnpaid = cycles.filter((c) => c.startDate < current.startDate).reduce((a, c) => a + c.remaining, 0);
  return {
    driverName: settings.driverName,
    driverHourlyRate: paiseToRupees(settings.driverHourlyRate),
    currentCycle: current,
    olderUnpaid: Math.round(olderUnpaid * 100) / 100,
    olderUnpaidCycles: cycles.filter((c) => c.startDate < current.startDate && c.remaining > 0).length,
  };
}

export interface CreateDriverPaymentInput {
  cycleStartDate: string;
  amount: number; // paise
  paymentDate: string;
  paymentMethod: 'cash' | 'upi' | 'bank';
  note: string;
  requestId?: string;
}

export async function createDriverPayment(input: CreateDriverPaymentInput, user: AuthUser) {
  if (input.requestId) {
    const existing = await DriverPayment.findOne({ requestId: input.requestId });
    if (existing) return { id: String(existing._id), duplicate: true };
  }
  const settings = await getSettings();
  const cycle = cycleForDate(input.cycleStartDate, settings.paymentCycleStartDate);
  if (cycle.startDate !== input.cycleStartDate) throw badRequest('This date is not the start of a driver payment cycle');

  try {
    const id = await runInTransaction(async (session) => {
      await takeLock(`driver-cycle:${cycle.startDate}`, session);
      const totals = await cycleTotals(cycle, session);
      const paid = await paidForCycle(cycle.startDate, session);
      const remaining = totals.totalSalary - paid;
      if (totals.totalSalary === 0) throw badRequest('No driver salary in this cycle yet');
      if (remaining <= 0) throw conflict('Driver salary for this cycle is already fully paid');
      if (input.amount > remaining) {
        throw badRequest(`Amount is more than the remaining salary (₹${paiseToRupees(remaining)})`, {
          remaining: paiseToRupees(remaining),
        });
      }
      const [payment] = await DriverPayment.create(
        [
          {
            cycleStartDate: cycle.startDate,
            cycleEndDate: cycle.endDate,
            totalWorkingMinutes: totals.workingMinutes,
            hourlyRate: effectiveRate(totals, settings.driverHourlyRate),
            totalSalary: totals.totalSalary,
            amountPaid: input.amount,
            paymentDate: input.paymentDate,
            paymentMethod: input.paymentMethod,
            note: input.note,
            createdBy: user.id,
            requestId: input.requestId,
          },
        ],
        { session },
      );
      await audit(session, { entityType: 'DriverPayment', entityId: payment._id, action: 'create', after: snapshot(payment), userId: user.id });
      return String(payment._id);
    });
    return { id, duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err) && input.requestId) {
      const existing = await DriverPayment.findOne({ requestId: input.requestId });
      if (existing) return { id: String(existing._id), duplicate: true };
    }
    throw err;
  }
}

export async function voidDriverPayment(id: string, reason: string, user: AuthUser) {
  await runInTransaction(async (session) => {
    const payment = await DriverPayment.findById(id).session(session);
    if (!payment) throw notFound('Driver payment');
    if (payment.isVoided) throw conflict('This payment is already cancelled');
    await takeLock(`driver-cycle:${payment.cycleStartDate}`, session);
    const before = snapshot(payment);
    payment.isVoided = true;
    payment.voidedAt = new Date();
    payment.voidedBy = new Types.ObjectId(user.id);
    payment.voidReason = reason;
    await payment.save({ session });
    await audit(session, { entityType: 'DriverPayment', entityId: payment._id, action: 'void', before, after: snapshot(payment), reason, userId: user.id });
  });
  return getDriverPayment(id);
}

/** Adds "balance after this payment" using the salary snapshot and payments made up to that point. */
function withBalances(payments: DriverPaymentRecord[], allForCycles?: DriverPaymentRecord[]) {
  const pool = allForCycles ?? payments;
  return payments.map((p) => {
    if (p.isVoided) return serializeDriverPayment(p);
    const paidSoFar = sum(
      pool
        .filter(
          (q) =>
            !q.isVoided &&
            q.cycleStartDate === p.cycleStartDate &&
            (q.createdAt && p.createdAt ? q.createdAt.getTime() <= p.createdAt.getTime() : true),
        )
        .map((q) => q.amountPaid),
    );
    return serializeDriverPayment(p, Math.max(0, p.totalSalary - paidSoFar));
  });
}

export async function getDriverPayment(id: string) {
  const p = await DriverPayment.findById(id).lean();
  if (!p) throw notFound('Driver payment');
  const sameCycle = await DriverPayment.find({ cycleStartDate: p.cycleStartDate }).lean();
  return withBalances([p as DriverPaymentRecord], sameCycle as DriverPaymentRecord[])[0];
}

export async function listDriverPayments(f: {
  from?: string;
  to?: string;
  cycleStartDate?: string;
  page: number;
  limit: number;
  skip: number;
}) {
  const match: Record<string, unknown> = { isVoided: false };
  if (f.from || f.to) match.paymentDate = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  if (f.cycleStartDate) match.cycleStartDate = f.cycleStartDate;
  const [items, total, sumAgg] = await Promise.all([
    DriverPayment.find(match).sort({ paymentDate: -1, createdAt: -1 }).skip(f.skip).limit(f.limit).lean(),
    DriverPayment.countDocuments(match),
    DriverPayment.aggregate<{ total: number }>([{ $match: match }, { $group: { _id: null, total: { $sum: '$amountPaid' } } }]),
  ]);
  const cycleStarts = [...new Set(items.map((p) => p.cycleStartDate))];
  const pool = await DriverPayment.find({ cycleStartDate: { $in: cycleStarts } }).lean();
  return {
    items: withBalances(items as DriverPaymentRecord[], pool as DriverPaymentRecord[]),
    total,
    totalAmount: paiseToRupees(sumAgg[0]?.total ?? 0),
  };
}
