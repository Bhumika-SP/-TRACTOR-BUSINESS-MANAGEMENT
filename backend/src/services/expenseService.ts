import { Types } from 'mongoose';
import { Expense, Work } from '../models';
import type { AuthUser } from '../middleware/auth';
import { notFound } from '../utils/errors';
import { paiseToRupees } from '../utils/money';
import { audit, escapeRegex, isDuplicateKeyError, runInTransaction, snapshot } from '../utils/tx';
import { serializeExpense } from './serializers';

type Category = 'diesel' | 'maintenance' | 'repair' | 'engine_oil' | 'other';

export interface CreateExpenseInput {
  expenseDate: string;
  category: Category;
  amount: number; // paise
  description: string;
  relatedWorkId?: string | null;
  requestId?: string;
}

async function assertWorkExists(id?: string | null) {
  if (!id) return;
  const exists = await Work.exists({ _id: id, isDeleted: false });
  if (!exists) throw notFound('Related work');
}

export async function createExpense(input: CreateExpenseInput, user: AuthUser) {
  if (input.requestId) {
    const existing = await Expense.findOne({ requestId: input.requestId });
    if (existing) return { id: String(existing._id), duplicate: true };
  }
  await assertWorkExists(input.relatedWorkId);
  try {
    const id = await runInTransaction(async (session) => {
      const [expense] = await Expense.create(
        [
          {
            expenseDate: input.expenseDate,
            category: input.category,
            amount: input.amount,
            description: input.description,
            relatedWorkId: input.relatedWorkId || undefined,
            createdBy: user.id,
            requestId: input.requestId,
          },
        ],
        { session },
      );
      await audit(session, { entityType: 'Expense', entityId: expense._id, action: 'create', after: snapshot(expense), userId: user.id });
      return String(expense._id);
    });
    return { id, duplicate: false };
  } catch (err) {
    if (isDuplicateKeyError(err) && input.requestId) {
      const existing = await Expense.findOne({ requestId: input.requestId });
      if (existing) return { id: String(existing._id), duplicate: true };
    }
    throw err;
  }
}

export async function updateExpense(
  id: string,
  input: Partial<Omit<CreateExpenseInput, 'requestId'>> & { reason?: string },
  user: AuthUser,
) {
  await assertWorkExists(input.relatedWorkId);
  await runInTransaction(async (session) => {
    const expense = await Expense.findOne({ _id: id, isDeleted: false }).session(session);
    if (!expense) throw notFound('Expense');
    const before = snapshot(expense);
    if (input.expenseDate !== undefined) expense.expenseDate = input.expenseDate;
    if (input.category !== undefined) expense.category = input.category;
    if (input.amount !== undefined) expense.amount = input.amount;
    if (input.description !== undefined) expense.description = input.description;
    if (input.relatedWorkId !== undefined) {
      expense.relatedWorkId = input.relatedWorkId ? new Types.ObjectId(input.relatedWorkId) : undefined;
    }
    expense.updatedBy = new Types.ObjectId(user.id);
    await expense.save({ session });
    await audit(session, { entityType: 'Expense', entityId: expense._id, action: 'update', before, after: snapshot(expense), reason: input.reason, userId: user.id });
  });
  return getExpense(id);
}

export async function deleteExpense(id: string, reason: string, user: AuthUser) {
  await runInTransaction(async (session) => {
    const expense = await Expense.findOne({ _id: id, isDeleted: false }).session(session);
    if (!expense) throw notFound('Expense');
    const before = snapshot(expense);
    expense.isDeleted = true;
    expense.deletedAt = new Date();
    expense.deletedBy = new Types.ObjectId(user.id);
    expense.deleteReason = reason;
    await expense.save({ session });
    await audit(session, { entityType: 'Expense', entityId: expense._id, action: 'delete', before, reason, userId: user.id });
  });
}

export async function getExpense(id: string) {
  const e = await Expense.findOne({ _id: id, isDeleted: false }).lean();
  if (!e) throw notFound('Expense');
  return serializeExpense(e);
}

export async function listExpenses(f: {
  from?: string;
  to?: string;
  category?: Category;
  search?: string;
  page: number;
  limit: number;
  skip: number;
}) {
  const match: Record<string, unknown> = { isDeleted: false };
  if (f.from || f.to) match.expenseDate = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  if (f.category) match.category = f.category;
  if (f.search) match.description = new RegExp(escapeRegex(f.search), 'i');
  const [items, total, sumAgg] = await Promise.all([
    Expense.find(match).sort({ expenseDate: -1, createdAt: -1 }).skip(f.skip).limit(f.limit).lean(),
    Expense.countDocuments(match),
    Expense.aggregate<{ total: number }>([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  return { items: items.map(serializeExpense), total, totalAmount: paiseToRupees(sumAgg[0]?.total ?? 0) };
}
