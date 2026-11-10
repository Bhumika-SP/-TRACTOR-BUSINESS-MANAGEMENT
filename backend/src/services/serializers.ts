/**
 * Converts database records (paise) into API objects (rupees) and adds derived values.
 * Derived values (received, pending, status) are computed from payment records, never stored.
 */
import { calcDriverSalary, paymentStatus } from './calculations';
import { paiseToRupees } from '../utils/money';

type Id = { toString(): string };

interface CustomerRef {
  _id: Id;
  name: string;
  phone?: string | null;
}

function customerOf(value: unknown): { id: string; name: string; phone: string } | null {
  if (value && typeof value === 'object' && 'name' in value) {
    const c = value as CustomerRef;
    return { id: c._id.toString(), name: c.name, phone: c.phone ?? '' };
  }
  return null;
}

export interface WorkRecord {
  _id: Id;
  customerId: unknown;
  workDate: string;
  description?: string | null;
  fromTime: string;
  toTime: string;
  workingMinutes: number;
  tractorHourlyRate: number;
  totalWorkAmount: number;
  driverHourlyRateSnapshot: number;
  driverWorkingMinutes: number;
  createdAt?: Date;
  updatedAt?: Date;
  customer?: unknown;
}

export function serializeWork(w: WorkRecord, paidPaise: number) {
  const customer = customerOf(w.customer) ?? customerOf(w.customerId);
  const pending = Math.max(0, w.totalWorkAmount - paidPaise);
  return {
    id: w._id.toString(),
    customerId: customer?.id ?? String(w.customerId),
    customerName: customer?.name ?? '',
    customerPhone: customer?.phone ?? '',
    workDate: w.workDate,
    description: w.description ?? '',
    fromTime: w.fromTime,
    toTime: w.toTime,
    workingMinutes: w.workingMinutes,
    workingHours: Math.round((w.workingMinutes / 60) * 100) / 100,
    tractorHourlyRate: paiseToRupees(w.tractorHourlyRate),
    totalWorkAmount: paiseToRupees(w.totalWorkAmount),
    driverHourlyRate: paiseToRupees(w.driverHourlyRateSnapshot),
    driverWorkingMinutes: w.driverWorkingMinutes,
    driverSalary: paiseToRupees(calcDriverSalary(w.driverWorkingMinutes, w.driverHourlyRateSnapshot)),
    amountReceived: paiseToRupees(paidPaise),
    pendingAmount: paiseToRupees(pending),
    paymentStatus: paymentStatus(w.totalWorkAmount, paidPaise),
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

export interface CustomerPaymentRecord {
  _id: Id;
  workId: unknown;
  customerId: unknown;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  note?: string | null;
  isVoided?: boolean | null;
  voidReason?: string | null;
  createdAt?: Date;
  work?: { workDate: string; fromTime: string; toTime: string; totalWorkAmount: number } | null;
  customer?: unknown;
}

export function serializeCustomerPayment(p: CustomerPaymentRecord) {
  const customer = customerOf(p.customer) ?? customerOf(p.customerId);
  const work = p.work ?? (p.workId && typeof p.workId === 'object' && 'workDate' in p.workId ? (p.workId as CustomerPaymentRecord['work']) : null);
  const workId = work && '_id' in work ? String((work as { _id: Id })._id) : String(p.workId);
  return {
    id: p._id.toString(),
    workId,
    customerId: customer?.id ?? String(p.customerId),
    customerName: customer?.name ?? '',
    amount: paiseToRupees(p.amount),
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    note: p.note ?? '',
    isVoided: Boolean(p.isVoided),
    voidReason: p.voidReason ?? '',
    work: work
      ? { workDate: work.workDate, fromTime: work.fromTime, toTime: work.toTime, totalWorkAmount: paiseToRupees(work.totalWorkAmount) }
      : null,
    createdAt: p.createdAt,
  };
}

export interface ExpenseRecord {
  _id: Id;
  expenseDate: string;
  category: string;
  amount: number;
  description?: string | null;
  relatedWorkId?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export function serializeExpense(e: ExpenseRecord) {
  return {
    id: e._id.toString(),
    expenseDate: e.expenseDate,
    category: e.category,
    amount: paiseToRupees(e.amount),
    description: e.description ?? '',
    relatedWorkId: e.relatedWorkId ? String(e.relatedWorkId) : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export interface DriverPaymentRecord {
  _id: Id;
  cycleStartDate: string;
  cycleEndDate: string;
  totalWorkingMinutes: number;
  hourlyRate: number;
  totalSalary: number;
  amountPaid: number;
  paymentDate: string;
  paymentMethod: string;
  note?: string | null;
  isVoided?: boolean | null;
  voidReason?: string | null;
  createdAt?: Date;
}

/** balanceAfter (paise): salary still unpaid for the cycle right after this payment was made. */
export function serializeDriverPayment(p: DriverPaymentRecord, balanceAfterPaise?: number) {
  return {
    id: p._id.toString(),
    cycleStartDate: p.cycleStartDate,
    cycleEndDate: p.cycleEndDate,
    totalWorkingMinutes: p.totalWorkingMinutes,
    hourlyRate: paiseToRupees(p.hourlyRate),
    totalSalary: paiseToRupees(p.totalSalary),
    amountPaid: paiseToRupees(p.amountPaid),
    balanceAfter: balanceAfterPaise === undefined ? null : paiseToRupees(balanceAfterPaise),
    paymentDate: p.paymentDate,
    paymentMethod: p.paymentMethod,
    note: p.note ?? '',
    isVoided: Boolean(p.isVoided),
    voidReason: p.voidReason ?? '',
    createdAt: p.createdAt,
  };
}
