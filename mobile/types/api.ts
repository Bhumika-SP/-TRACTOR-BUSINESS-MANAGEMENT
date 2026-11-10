/** Shapes returned by the Tractor Tracker API. Money is in rupees. */

export type Role = 'admin' | 'entry' | 'viewer';
export type PaymentMethod = 'cash' | 'upi' | 'bank';
export type PaymentStatus = 'paid' | 'partial' | 'pending';
export type CycleStatus = 'paid' | 'partial' | 'pending' | 'no_work';
export type ExpenseCategory = 'diesel' | 'maintenance' | 'repair' | 'engine_oil' | 'other';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['diesel', 'maintenance', 'repair', 'engine_oil', 'other'];
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'bank'];

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  canEdit: boolean;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
}

export interface CustomerPayment {
  id: string;
  workId: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  isVoided: boolean;
  voidReason: string;
  work: { workDate: string; fromTime: string; toTime: string; totalWorkAmount: number } | null;
}

export interface Work {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  workDate: string;
  description: string;
  fromTime: string;
  toTime: string;
  workingMinutes: number;
  workingHours: number;
  tractorHourlyRate: number;
  totalWorkAmount: number;
  driverHourlyRate: number;
  driverSalary: number;
  amountReceived: number;
  pendingAmount: number;
  paymentStatus: PaymentStatus;
}

export interface WorkDetail extends Work {
  payments: CustomerPayment[];
  relatedExpenses: { id: string; category: ExpenseCategory; amount: number; expenseDate: string }[];
}

export interface Expense {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  relatedWorkId: string | null;
}

export interface DriverPayment {
  id: string;
  cycleStartDate: string;
  cycleEndDate: string;
  totalWorkingMinutes: number;
  hourlyRate: number;
  totalSalary: number;
  amountPaid: number;
  balanceAfter: number | null;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  isVoided: boolean;
  voidReason: string;
}

export interface Cycle {
  index: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  workCount: number;
  workingMinutes: number;
  workingHours: number;
  hourlyRate: number;
  hourlyRates: number[];
  totalSalary: number;
  amountPaid: number;
  remaining: number;
  overpaid: number;
  status: CycleStatus;
  paymentCount: number;
}

export interface CycleDetail extends Cycle {
  driverName: string;
  payments: DriverPayment[];
}

export interface DashboardSummary {
  period: { type: 'day' | 'month' | 'range'; from: string; to: string };
  workCount: number;
  workingMinutes: number;
  workAmount: number;
  moneyReceived: number;
  moneyPending: number;
  driverSalary: number;
  dieselExpenses: number;
  otherExpenses: number;
  totalExpenses: number;
  profit: number;
  driverPaymentsMade: number;
  cashBalance: number;
  works: Work[];
}

export interface DriverSummary {
  driverName: string;
  driverHourlyRate: number;
  currentCycle: Cycle;
  olderUnpaid: number;
  olderUnpaidCycles: number;
}

export interface Settings {
  businessName: string;
  tractorHourlyRate: number;
  driverHourlyRate: number;
  driverName: string;
  paymentCycleStartDate: string;
  language: 'en' | 'kn';
}

export interface HistoryItem {
  type: 'work' | 'customer_payment' | 'driver_payment' | 'expense';
  id: string;
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  status?: PaymentStatus;
  data: Work | CustomerPayment | DriverPayment | Expense;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  totals?: { workAmount: number; received: number; pending: number; workingMinutes: number };
  totalAmount?: number;
  duplicate?: boolean;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}
