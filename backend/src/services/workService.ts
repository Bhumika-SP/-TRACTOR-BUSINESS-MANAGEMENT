import { Types, type ClientSession, type PipelineStage } from 'mongoose';
import { Customer, CustomerPayment, Expense, Work } from '../models';
import type { AuthUser } from '../middleware/auth';
import { badRequest, conflict, notFound } from '../utils/errors';
import { paiseToRupees } from '../utils/money';
import { audit, escapeRegex, isDuplicateKeyError, runInTransaction, snapshot } from '../utils/tx';
import { calcWorkAmount, calcWorkingMinutes } from './calculations';
import { serializeCustomerPayment, serializeWork, type WorkRecord } from './serializers';
import { getSettings } from './settingsService';

// ---------------------------------------------------------------- customers

export async function findOrCreateCustomer(
  input: { customerId?: string; customerName?: string; phone?: string },
  session: ClientSession,
) {
  if (input.customerId) {
    const c = await Customer.findById(input.customerId).session(session);
    if (!c) throw notFound('Farmer');
    if (input.phone && !c.phone) {
      c.phone = input.phone;
      await c.save({ session });
    }
    return c;
  }
  const name = (input.customerName ?? '').trim().replace(/\s+/g, ' ');
  const nameLower = name.toLowerCase();
  const phone = (input.phone ?? '').trim();
  // Reuse an existing farmer with the same name (and same phone, if both have one).
  const candidates = await Customer.find({ nameLower }).session(session);
  const match =
    candidates.find((c) => phone && c.phone === phone) ??
    candidates.find((c) => !phone || !c.phone) ??
    null;
  if (match) {
    if (phone && !match.phone) {
      match.phone = phone;
      await match.save({ session });
    }
    return match;
  }
  const [created] = await Customer.create([{ name, nameLower, phone }], { session });
  return created;
}

export async function searchCustomerIds(search: string): Promise<Types.ObjectId[]> {
  const rx = new RegExp(escapeRegex(search.trim().toLowerCase()));
  const found = await Customer.find({ $or: [{ nameLower: rx }, { phone: rx }] }, { _id: 1 }).limit(500).lean();
  return found.map((c) => c._id);
}

// ---------------------------------------------------------------- payment totals

/** Sum of non-cancelled customer payments for each work id (paise). */
export async function paidByWork(workIds: Types.ObjectId[], session?: ClientSession): Promise<Map<string, number>> {
  if (workIds.length === 0) return new Map();
  const rows = await CustomerPayment.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { workId: { $in: workIds }, isVoided: false } },
    { $group: { _id: '$workId', total: { $sum: '$amount' } } },
  ]).session(session ?? null);
  return new Map(rows.map((r) => [String(r._id), r.total]));
}

// ---------------------------------------------------------------- list / get

export interface WorkFilters {
  from?: string;
  to?: string;
  search?: string;
  status?: 'paid' | 'partial' | 'pending' | 'due';
  customerId?: string;
  page: number;
  limit: number;
  skip: number;
}

/** One aggregation returns the page of works with received/pending computed from payments, plus totals. */
export async function listWorks(f: WorkFilters) {
  const match: Record<string, unknown> = { isDeleted: false };
  if (f.from || f.to) {
    match.workDate = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  }
  if (f.customerId) match.customerId = new Types.ObjectId(f.customerId);
  if (f.search) {
    const ids = await searchCustomerIds(f.search);
    match.customerId = f.customerId ? match.customerId : { $in: ids };
  }

  const statusMatch: Record<string, unknown> | null =
    f.status === 'paid'
      ? { pendingAmount: 0 }
      : f.status === 'partial'
        ? { pendingAmount: { $gt: 0 }, paidAmount: { $gt: 0 } }
        : f.status === 'pending'
          ? { pendingAmount: { $gt: 0 }, paidAmount: 0 }
          : f.status === 'due'
            ? { pendingAmount: { $gt: 0 } }
            : null;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: CustomerPayment.collection.name,
        let: { wid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$workId', '$$wid'] }, isVoided: false } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ],
        as: 'paidAgg',
      },
    },
    { $addFields: { paidAmount: { $ifNull: [{ $first: '$paidAgg.total' }, 0] } } },
    { $addFields: { pendingAmount: { $max: [0, { $subtract: ['$totalWorkAmount', '$paidAmount'] }] } } },
    ...(statusMatch ? [{ $match: statusMatch } as PipelineStage] : []),
    { $sort: { workDate: -1, fromTime: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: f.skip },
          { $limit: f.limit },
          { $lookup: { from: Customer.collection.name, localField: 'customerId', foreignField: '_id', as: 'customerArr' } },
          { $addFields: { customer: { $first: '$customerArr' } } },
          { $project: { customerArr: 0, paidAgg: 0 } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              workAmount: { $sum: '$totalWorkAmount' },
              received: { $sum: '$paidAmount' },
              pending: { $sum: '$pendingAmount' },
              minutes: { $sum: '$workingMinutes' },
            },
          },
        ],
      },
    },
  ];

  const [result] = await Work.aggregate<{
    items: (WorkRecord & { paidAmount: number })[];
    totals: { count: number; workAmount: number; received: number; pending: number; minutes: number }[];
  }>(pipeline);
  const t = result.totals[0] ?? { count: 0, workAmount: 0, received: 0, pending: 0, minutes: 0 };
  return {
    items: result.items.map((w) => serializeWork(w, w.paidAmount)),
    total: t.count,
    totals: {
      workAmount: paiseToRupees(t.workAmount),
      received: paiseToRupees(t.received),
      pending: paiseToRupees(t.pending),
      workingMinutes: t.minutes,
    },
  };
}

export async function getWorkWithPayments(id: string) {
  const work = await Work.findOne({ _id: id, isDeleted: false }).populate('customerId').lean();
  if (!work) throw notFound('Work');
  const payments = await CustomerPayment.find({ workId: work._id }).sort({ paymentDate: 1, createdAt: 1 }).lean();
  const paid = payments.filter((p) => !p.isVoided).reduce((a, p) => a + p.amount, 0);
  const expenses = await Expense.find({ relatedWorkId: work._id, isDeleted: false }).sort({ expenseDate: 1 }).lean();
  return {
    ...serializeWork(work as unknown as WorkRecord, paid),
    payments: payments.map((p) => serializeCustomerPayment({ ...p, customer: work.customerId })),
    relatedExpenses: expenses.map((e) => ({ id: String(e._id), category: e.category, amount: paiseToRupees(e.amount), expenseDate: e.expenseDate })),
  };
}

// ---------------------------------------------------------------- create / update / delete

export interface CreateWorkInput {
  customerId?: string;
  customerName?: string;
  phone?: string;
  workDate: string;
  description: string;
  fromTime: string;
  toTime: string;
  tractorHourlyRate?: number; // paise
  requestId?: string;
}

export async function createWork(input: CreateWorkInput, user: AuthUser) {
  if (input.requestId) {
    const existing = await Work.findOne({ requestId: input.requestId });
    if (existing) return { id: String(existing._id), duplicate: true };
  }
  const workingMinutes = calcWorkingMinutes(input.fromTime, input.toTime);
  if (workingMinutes <= 0) throw badRequest('From time and To time cannot be the same');

  try {
    const id = await runInTransaction(async (session) => {
      const settings = await getSettings(session);
      const tractorRate = input.tractorHourlyRate ?? settings.tractorHourlyRate;
      const customer = await findOrCreateCustomer(input, session);
      const [work] = await Work.create(
        [
          {
            customerId: customer._id,
            workDate: input.workDate,
            description: input.description,
            fromTime: input.fromTime,
            toTime: input.toTime,
            workingMinutes,
            tractorHourlyRate: tractorRate,
            totalWorkAmount: calcWorkAmount(workingMinutes, tractorRate),
            driverHourlyRateSnapshot: settings.driverHourlyRate,
            driverWorkingMinutes: workingMinutes,
            createdBy: user.id,
            requestId: input.requestId,
          },
        ],
        { session },
      );
      await audit(session, { entityType: 'Work', entityId: work._id, action: 'create', after: snapshot(work), userId: user.id });
      return String(work._id);
    });
    return { id, duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err) && input.requestId) {
      const existing = await Work.findOne({ requestId: input.requestId });
      if (existing) return { id: String(existing._id), duplicate: true };
    }
    throw err;
  }
}

export interface UpdateWorkInput {
  customerId?: string;
  customerName?: string;
  phone?: string;
  workDate?: string;
  description?: string;
  fromTime?: string;
  toTime?: string;
  tractorHourlyRate?: number; // paise
  reason?: string;
}

/**
 * Corrects a job. Payments are never touched: if the corrected amount would be lower than what
 * the farmer already paid, the edit is refused so payment history cannot be corrupted.
 * The driver rate saved with the job is kept; driver minutes follow the corrected working time.
 */
export async function updateWork(id: string, input: UpdateWorkInput, user: AuthUser) {
  await runInTransaction(async (session) => {
    const work = await Work.findOne({ _id: id, isDeleted: false }).session(session);
    if (!work) throw notFound('Work');
    const before = snapshot(work);

    if (input.customerId || input.customerName) {
      const customer = await findOrCreateCustomer(
        { customerId: input.customerId, customerName: input.customerName, phone: input.phone },
        session,
      );
      if (String(customer._id) !== String(work.customerId)) {
        work.customerId = customer._id;
        await CustomerPayment.updateMany({ workId: work._id }, { $set: { customerId: customer._id } }, { session });
      }
    }
    if (input.workDate !== undefined) work.workDate = input.workDate;
    if (input.description !== undefined) work.description = input.description;
    if (input.fromTime !== undefined) work.fromTime = input.fromTime;
    if (input.toTime !== undefined) work.toTime = input.toTime;
    if (input.tractorHourlyRate !== undefined) work.tractorHourlyRate = input.tractorHourlyRate;

    const minutes = calcWorkingMinutes(work.fromTime, work.toTime);
    if (minutes <= 0) throw badRequest('From time and To time cannot be the same');
    work.workingMinutes = minutes;
    work.driverWorkingMinutes = minutes;
    work.totalWorkAmount = calcWorkAmount(minutes, work.tractorHourlyRate);
    work.updatedBy = new Types.ObjectId(user.id);
    work.lockVersion += 1; // conflicts with concurrent payments on this job

    const paid = (await paidByWork([work._id], session)).get(String(work._id)) ?? 0;
    if (work.totalWorkAmount < paid) {
      throw conflict(
        `New work amount (₹${paiseToRupees(work.totalWorkAmount)}) is less than money already received (₹${paiseToRupees(paid)}). Cancel the extra payment first.`,
      );
    }
    await work.save({ session });
    await audit(session, { entityType: 'Work', entityId: work._id, action: 'update', before, after: snapshot(work), reason: input.reason, userId: user.id });
  });
  return getWorkWithPayments(id);
}

/** Soft delete. A job with active payments cannot be deleted until those payments are cancelled. */
export async function deleteWork(id: string, reason: string, user: AuthUser) {
  await runInTransaction(async (session) => {
    const work = await Work.findOne({ _id: id, isDeleted: false }).session(session);
    if (!work) throw notFound('Work');
    const paid = (await paidByWork([work._id], session)).get(String(work._id)) ?? 0;
    if (paid > 0) throw conflict('This work has payments. Cancel its payments before deleting the work.');
    const before = snapshot(work);
    work.isDeleted = true;
    work.deletedAt = new Date();
    work.deletedBy = new Types.ObjectId(user.id);
    work.deleteReason = reason;
    work.lockVersion += 1;
    await work.save({ session });
    await audit(session, { entityType: 'Work', entityId: work._id, action: 'delete', before, reason, userId: user.id });
  });
}
