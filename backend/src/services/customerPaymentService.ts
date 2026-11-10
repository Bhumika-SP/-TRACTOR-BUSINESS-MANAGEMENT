import { Types } from 'mongoose';
import { CustomerPayment, Work } from '../models';
import type { AuthUser } from '../middleware/auth';
import { badRequest, conflict, notFound } from '../utils/errors';
import { paiseToRupees } from '../utils/money';
import { audit, isDuplicateKeyError, runInTransaction, snapshot } from '../utils/tx';
import { serializeCustomerPayment, type CustomerPaymentRecord } from './serializers';
import { paidByWork, searchCustomerIds } from './workService';

export interface CreateCustomerPaymentInput {
  workId: string;
  amount: number; // paise
  paymentDate: string;
  paymentMethod: 'cash' | 'upi' | 'bank';
  note: string;
  requestId?: string;
}

/**
 * Records one payment for one job. Runs in a transaction that also bumps the job's lockVersion,
 * so two payments sent at the same moment cannot together exceed the pending amount.
 */
export async function createCustomerPayment(input: CreateCustomerPaymentInput, user: AuthUser) {
  if (input.requestId) {
    const existing = await CustomerPayment.findOne({ requestId: input.requestId });
    if (existing) return { id: String(existing._id), duplicate: true };
  }
  try {
    const id = await runInTransaction(async (session) => {
      const work = await Work.findOneAndUpdate(
        { _id: input.workId, isDeleted: false },
        { $inc: { lockVersion: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!work) throw notFound('Work');
      if (input.paymentDate < work.workDate) throw badRequest('Payment date cannot be before the work date');
      const paid = (await paidByWork([work._id], session)).get(String(work._id)) ?? 0;
      const pending = work.totalWorkAmount - paid;
      if (pending <= 0) throw conflict('This work is already fully paid');
      if (input.amount > pending) {
        throw badRequest(`Amount is more than the pending amount (₹${paiseToRupees(pending)})`, {
          pendingAmount: paiseToRupees(pending),
        });
      }
      const [payment] = await CustomerPayment.create(
        [
          {
            workId: work._id,
            customerId: work.customerId,
            amount: input.amount,
            paymentDate: input.paymentDate,
            paymentMethod: input.paymentMethod,
            note: input.note,
            createdBy: user.id,
            requestId: input.requestId,
          },
        ],
        { session },
      );
      await audit(session, { entityType: 'CustomerPayment', entityId: payment._id, action: 'create', after: snapshot(payment), userId: user.id });
      return String(payment._id);
    });
    return { id, duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err) && input.requestId) {
      const existing = await CustomerPayment.findOne({ requestId: input.requestId });
      if (existing) return { id: String(existing._id), duplicate: true };
    }
    throw err;
  }
}

/** Cancels a wrong payment (correction/refund). The record stays in history, marked as cancelled. */
export async function voidCustomerPayment(id: string, reason: string, user: AuthUser) {
  await runInTransaction(async (session) => {
    const payment = await CustomerPayment.findById(id).session(session);
    if (!payment) throw notFound('Payment');
    if (payment.isVoided) throw conflict('This payment is already cancelled');
    await Work.updateOne({ _id: payment.workId }, { $inc: { lockVersion: 1 } }, { session });
    const before = snapshot(payment);
    payment.isVoided = true;
    payment.voidedAt = new Date();
    payment.voidedBy = new Types.ObjectId(user.id);
    payment.voidReason = reason;
    await payment.save({ session });
    await audit(session, { entityType: 'CustomerPayment', entityId: payment._id, action: 'void', before, after: snapshot(payment), reason, userId: user.id });
  });
  return getCustomerPayment(id);
}

export async function getCustomerPayment(id: string) {
  const p = await CustomerPayment.findById(id).populate('customerId').populate('workId').lean();
  if (!p) throw notFound('Payment');
  return serializeCustomerPayment(p as unknown as CustomerPaymentRecord);
}

export async function listCustomerPayments(f: {
  from?: string;
  to?: string;
  search?: string;
  workId?: string;
  method?: string;
  includeVoided?: boolean;
  page: number;
  limit: number;
  skip: number;
}) {
  const match: Record<string, unknown> = {};
  if (!f.includeVoided) match.isVoided = false;
  if (f.from || f.to) match.paymentDate = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  if (f.workId) match.workId = new Types.ObjectId(f.workId);
  if (f.method) match.paymentMethod = f.method;
  if (f.search) match.customerId = { $in: await searchCustomerIds(f.search) };

  const [items, total, sumAgg] = await Promise.all([
    CustomerPayment.find(match)
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(f.skip)
      .limit(f.limit)
      .populate('customerId')
      .populate('workId')
      .lean(),
    CustomerPayment.countDocuments(match),
    CustomerPayment.aggregate<{ total: number }>([
      { $match: { ...match, isVoided: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  return {
    items: items.map((p) => serializeCustomerPayment(p as unknown as CustomerPaymentRecord)),
    total,
    totalAmount: paiseToRupees(sumAgg[0]?.total ?? 0),
  };
}
