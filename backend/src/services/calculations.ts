/**
 * ALL business formulas live here, as pure functions working in integer paise.
 * Every API, dashboard figure and test goes through these functions.
 */
import { amountForMinutes, sum } from '../utils/money';
import { addDays, daysBetween, timeToMinutes } from '../utils/dates';

export const MINUTES_PER_DAY = 24 * 60;
export const DRIVER_CYCLE_DAYS = 10;

/**
 * Working Minutes = To Time - From Time.
 * If To Time is earlier than From Time the work crossed midnight, so 24 hours are added.
 * Equal times are treated as zero (invalid) work.
 */
export function calcWorkingMinutes(fromTime: string, toTime: string): number {
  const diff = timeToMinutes(toTime) - timeToMinutes(fromTime);
  if (diff === 0) return 0;
  return diff > 0 ? diff : diff + MINUTES_PER_DAY;
}

/** Work Amount = Working Hours × Tractor Hourly Rate. */
export function calcWorkAmount(workingMinutes: number, tractorRatePaise: number): number {
  return amountForMinutes(workingMinutes, tractorRatePaise);
}

/** Driver Salary = Driver Working Minutes / 60 × Driver Hourly Rate. */
export function calcDriverSalary(driverMinutes: number, driverRatePaise: number): number {
  return amountForMinutes(driverMinutes, driverRatePaise);
}

/** Customer Pending = Total Work Amount - Total Payments Received (never below zero). */
export function calcPending(workAmount: number, payments: number[]): number {
  return Math.max(0, workAmount - sum(payments));
}

export type PaymentStatus = 'paid' | 'partial' | 'pending';

export function paymentStatus(total: number, paid: number): PaymentStatus {
  if (total <= 0 || paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'pending';
}

/** Total Expenses = Driver Salary Earned + Diesel + Other Expenses. */
export function calcTotalExpenses(driverSalary: number, diesel: number, otherExpenses: number): number {
  return driverSalary + diesel + otherExpenses;
}

/** Profit = Total Work Income - Total Expenses (based on work done, NOT on money received). */
export function calcProfit(workIncome: number, totalExpenses: number): number {
  return workIncome - totalExpenses;
}

/**
 * Cash Balance = Customer Payments Received - Cash Expenses Paid - Driver Payments Made.
 * Driver salary appears here only when actually paid, and in profit only when earned,
 * so it is never subtracted twice.
 */
export function calcCashBalance(received: number, cashExpensesPaid: number, driverPaymentsMade: number): number {
  return received - cashExpensesPaid - driverPaymentsMade;
}

export interface Cycle {
  index: number;
  startDate: string;
  endDate: string;
}

/**
 * Driver payment cycles are consecutive 10-day periods counted from the configured
 * start date (not tied to calendar months). Dates before the start date belong to
 * earlier (negative-index) cycles, so no work is ever left out.
 */
export function cycleForDate(date: string, cycleStartDate: string): Cycle {
  const index = Math.floor(daysBetween(cycleStartDate, date) / DRIVER_CYCLE_DAYS);
  return cycleByIndex(index, cycleStartDate);
}

export function cycleByIndex(index: number, cycleStartDate: string): Cycle {
  const startDate = addDays(cycleStartDate, index * DRIVER_CYCLE_DAYS);
  return { index, startDate, endDate: addDays(startDate, DRIVER_CYCLE_DAYS - 1) };
}

export interface WorkLike {
  totalWorkAmount: number;
  workingMinutes: number;
  driverWorkingMinutes: number;
  driverHourlyRateSnapshot: number;
}

export interface ExpenseLike {
  category: string;
  amount: number;
}

export interface PeriodSummary {
  workCount: number;
  workingMinutes: number;
  workAmount: number;
  driverSalary: number;
  dieselExpenses: number;
  otherExpenses: number;
  totalExpenses: number;
  profit: number;
}

/** Combines work and expense records of a period into the profit figures shown on the dashboard. */
export function summarisePeriod(works: WorkLike[], expenses: ExpenseLike[]): PeriodSummary {
  const workAmount = sum(works.map((w) => w.totalWorkAmount));
  const workingMinutes = sum(works.map((w) => w.workingMinutes));
  const driverSalary = sum(works.map((w) => calcDriverSalary(w.driverWorkingMinutes, w.driverHourlyRateSnapshot)));
  const dieselExpenses = sum(expenses.filter((e) => e.category === 'diesel').map((e) => e.amount));
  const otherExpenses = sum(expenses.filter((e) => e.category !== 'diesel').map((e) => e.amount));
  const totalExpenses = calcTotalExpenses(driverSalary, dieselExpenses, otherExpenses);
  return {
    workCount: works.length,
    workingMinutes,
    workAmount,
    driverSalary,
    dieselExpenses,
    otherExpenses,
    totalExpenses,
    profit: calcProfit(workAmount, totalExpenses),
  };
}
