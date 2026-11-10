import { env } from '../config/env';
import { CustomerPayment, DriverPayment, Expense, Work } from '../models';
import { monthRange, todayInZone } from '../utils/dates';
import { paiseToRupees, sum } from '../utils/money';
import { calcCashBalance, summarisePeriod } from './calculations';
import { serializeWork, type WorkRecord } from './serializers';
import { paidByWork } from './workService';

export function resolvePeriod(q: { date?: string; month?: string; from?: string; to?: string }) {
  if (q.from || q.to) {
    const from = q.from ?? q.to!;
    const to = q.to ?? q.from!;
    return { type: 'range' as const, from, to };
  }
  if (q.month) return { type: 'month' as const, ...monthRange(q.month) };
  const date = q.date ?? todayInZone(env().BUSINESS_TIMEZONE);
  return { type: 'day' as const, from: date, to: date };
}

/**
 * Every Home screen number, computed from saved records:
 *  - Work Amount     = value of work done in the period
 *  - Money Received  = customer payments dated in the period
 *  - Money Pending   = still unpaid on the work done in the period
 *  - Total Expenses  = driver salary earned on that work + diesel + other expenses
 *  - Profit          = Work Amount - Total Expenses
 *  - Cash Balance    = Money Received - expenses paid - driver payments made (in the period)
 */
export async function dashboardSummary(q: { date?: string; month?: string; from?: string; to?: string }) {
  const period = resolvePeriod(q);
  const dateRange = { $gte: period.from, $lte: period.to };

  const [works, expenses, receivedAgg, driverPaidAgg] = await Promise.all([
    Work.find({ isDeleted: false, workDate: dateRange }).sort({ workDate: -1, fromTime: -1 }).populate('customerId').lean(),
    Expense.find({ isDeleted: false, expenseDate: dateRange }, { category: 1, amount: 1 }).lean(),
    CustomerPayment.aggregate<{ total: number }>([
      { $match: { isVoided: false, paymentDate: dateRange } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    DriverPayment.aggregate<{ total: number }>([
      { $match: { isVoided: false, paymentDate: dateRange } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]),
  ]);

  const paidMap = await paidByWork(works.map((w) => w._id));
  const summary = summarisePeriod(works, expenses);
  const pending = sum(works.map((w) => Math.max(0, w.totalWorkAmount - (paidMap.get(String(w._id)) ?? 0))));
  const received = receivedAgg[0]?.total ?? 0;
  const driverPaid = driverPaidAgg[0]?.total ?? 0;
  const cashExpenses = summary.dieselExpenses + summary.otherExpenses;

  return {
    period,
    workCount: summary.workCount,
    workingMinutes: summary.workingMinutes,
    workAmount: paiseToRupees(summary.workAmount),
    moneyReceived: paiseToRupees(received),
    moneyPending: paiseToRupees(pending),
    driverSalary: paiseToRupees(summary.driverSalary),
    dieselExpenses: paiseToRupees(summary.dieselExpenses),
    otherExpenses: paiseToRupees(summary.otherExpenses),
    totalExpenses: paiseToRupees(summary.totalExpenses),
    profit: paiseToRupees(summary.profit),
    driverPaymentsMade: paiseToRupees(driverPaid),
    cashBalance: paiseToRupees(calcCashBalance(received, cashExpenses, driverPaid)),
    works: works.slice(0, 50).map((w) => serializeWork(w as unknown as WorkRecord, paidMap.get(String(w._id)) ?? 0)),
  };
}
