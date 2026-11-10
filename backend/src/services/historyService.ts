import { listCustomerPayments } from './customerPaymentService';
import { listDriverPayments } from './driverService';
import { listExpenses } from './expenseService';
import { listWorks } from './workService';

export interface HistoryItem {
  type: 'work' | 'customer_payment' | 'driver_payment' | 'expense';
  id: string;
  date: string;
  sortKey: string;
  title: string;
  subtitle: string;
  amount: number;
  status?: string;
  data: unknown;
}

/**
 * One combined, newest-first timeline for the "All" filter. Each source is asked for enough
 * rows to fill the requested page, then the lists are merged by date.
 */
export async function history(f: {
  type: 'all' | 'work' | 'payments' | 'expenses';
  from?: string;
  to?: string;
  search?: string;
  page: number;
  limit: number;
  skip: number;
}) {
  const window = { page: 1, limit: f.skip + f.limit, skip: 0 };
  const base = { from: f.from, to: f.to, search: f.search };
  const want = (t: string) => f.type === 'all' || f.type === t;

  const [works, cpays, dpays, expenses] = await Promise.all([
    want('work') ? listWorks({ ...base, ...window }) : null,
    want('payments') ? listCustomerPayments({ ...base, ...window }) : null,
    want('payments') && !f.search ? listDriverPayments({ from: f.from, to: f.to, ...window }) : null,
    want('expenses') ? listExpenses({ ...base, ...window }) : null,
  ]);

  const items: HistoryItem[] = [
    ...(works?.items ?? []).map((w) => ({
      type: 'work' as const,
      id: w.id,
      date: w.workDate,
      sortKey: `${w.workDate}|${w.createdAt ? new Date(w.createdAt).toISOString() : ""}`,
      title: w.customerName,
      subtitle: `${w.fromTime}-${w.toTime}`,
      amount: w.totalWorkAmount,
      status: w.paymentStatus,
      data: w,
    })),
    ...(cpays?.items ?? []).map((p) => ({
      type: 'customer_payment' as const,
      id: p.id,
      date: p.paymentDate,
      sortKey: `${p.paymentDate}|${p.createdAt ? new Date(p.createdAt).toISOString() : ''}`,
      title: p.customerName,
      subtitle: p.paymentMethod,
      amount: p.amount,
      data: p,
    })),
    ...(dpays?.items ?? []).map((p) => ({
      type: 'driver_payment' as const,
      id: p.id,
      date: p.paymentDate,
      sortKey: `${p.paymentDate}|${p.createdAt ? new Date(p.createdAt).toISOString() : ''}`,
      title: `${p.cycleStartDate} - ${p.cycleEndDate}`,
      subtitle: p.paymentMethod,
      amount: p.amountPaid,
      data: p,
    })),
    ...(expenses?.items ?? []).map((e) => ({
      type: 'expense' as const,
      id: e.id,
      date: e.expenseDate,
      sortKey: `${e.expenseDate}|${e.createdAt ? new Date(e.createdAt).toISOString() : ''}`,
      title: e.category,
      subtitle: e.description,
      amount: e.amount,
      data: e,
    })),
  ];
  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  const total = (works?.total ?? 0) + (cpays?.total ?? 0) + (dpays?.total ?? 0) + (expenses?.total ?? 0);
  return { items: items.slice(f.skip, f.skip + f.limit), total };
}
