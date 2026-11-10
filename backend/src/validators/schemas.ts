import { z } from 'zod';
import { EXPENSE_CATEGORIES, ROLES } from '../models';
import {
  dateRangeQuery,
  dateStr,
  monthStr,
  objectId,
  pageQuery,
  paymentMethod,
  requestId,
  rupeesNonNegative,
  rupeesPositive,
  shortText,
  timeStr,
} from './common';

// ---------- Auth & users ----------
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Enter username'),
  password: z.string().min(1, 'Enter password'),
});

const password = z.string().min(6, 'Password must be at least 6 characters').max(100);
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(50)
  .regex(/^[a-z0-9._@-]+$/, 'Use only letters, numbers, dot, dash, underscore or @');

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Enter name').max(80),
  username,
  password,
  role: z.enum(ROLES),
  canEdit: z.boolean().optional().default(false),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    role: z.enum(ROLES),
    canEdit: z.boolean(),
    isActive: z.boolean(),
    password,
  })
  .partial();

// ---------- Customers ----------
export const phoneStr = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+\-\s]*$/, 'Phone number can contain only digits')
  .optional()
  .default('');

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Enter farmer name').max(80),
  phone: phoneStr,
  address: shortText(200),
});
export const updateCustomerSchema = createCustomerSchema.partial();
export const customerListQuery = pageQuery.extend({ search: z.string().trim().max(80).optional() });

// ---------- Works ----------
const workCore = {
  workDate: dateStr,
  description: shortText(300),
  fromTime: timeStr,
  toTime: timeStr,
  /** Tractor rate in rupees per hour. Optional: defaults to the rate saved in Settings. */
  tractorHourlyRate: rupeesNonNegative.optional(),
};

export const createWorkSchema = z
  .object({
    customerId: objectId.optional(),
    customerName: z.string().trim().max(80).optional(),
    phone: phoneStr,
    ...workCore,
    requestId,
  })
  .refine((v) => v.customerId || (v.customerName && v.customerName.length > 0), {
    message: 'Enter farmer name',
    path: ['customerName'],
  })
  .refine((v) => v.fromTime !== v.toTime, { message: 'From time and To time cannot be the same', path: ['toTime'] });

export const updateWorkSchema = z
  .object({
    customerId: objectId.optional(),
    customerName: z.string().trim().min(1).max(80).optional(),
    phone: phoneStr.optional(),
    workDate: dateStr.optional(),
    description: z.string().trim().max(300).optional(),
    fromTime: timeStr.optional(),
    toTime: timeStr.optional(),
    tractorHourlyRate: rupeesNonNegative.optional(),
    reason: z.string().trim().max(300).optional(),
  });

const statusFilter = z.enum(['paid', 'partial', 'pending', 'due']).optional();

export const workListQuery = pageQuery.extend({
  ...dateRangeQuery.shape,
  search: z.string().trim().max(80).optional(),
  status: statusFilter,
  customerId: objectId.optional(),
});

// ---------- Customer payments ----------
export const createCustomerPaymentSchema = z.object({
  workId: objectId,
  amount: rupeesPositive,
  paymentDate: dateStr,
  paymentMethod,
  note: shortText(300),
  requestId,
});

export const customerPaymentListQuery = pageQuery.extend({
  ...dateRangeQuery.shape,
  search: z.string().trim().max(80).optional(),
  workId: objectId.optional(),
  method: paymentMethod.optional(),
});

// ---------- Driver payments ----------
export const createDriverPaymentSchema = z.object({
  cycleStartDate: dateStr,
  amount: rupeesPositive,
  paymentDate: dateStr,
  paymentMethod,
  note: shortText(300),
  requestId,
});

export const driverPaymentListQuery = pageQuery.extend({
  ...dateRangeQuery.shape,
  cycleStartDate: dateStr.optional(),
});

export const cycleListQuery = pageQuery.extend({
  status: z.enum(['paid', 'pending']).optional(),
});

// ---------- Expenses ----------
export const createExpenseSchema = z.object({
  expenseDate: dateStr,
  category: z.enum(EXPENSE_CATEGORIES),
  amount: rupeesPositive,
  description: shortText(300),
  relatedWorkId: objectId.optional().nullable(),
  requestId,
});

export const updateExpenseSchema = z.object({
  expenseDate: dateStr.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: rupeesPositive.optional(),
  description: z.string().trim().max(300).optional(),
  relatedWorkId: objectId.optional().nullable(),
  reason: z.string().trim().max(300).optional(),
});

export const expenseListQuery = pageQuery.extend({
  ...dateRangeQuery.shape,
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  search: z.string().trim().max(80).optional(),
});

// ---------- Dashboard & history ----------
export const summaryQuery = z
  .object({ date: dateStr.optional(), month: monthStr.optional(), from: dateStr.optional(), to: dateStr.optional() })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, { message: 'From date must be before To date', path: ['to'] });

export const historyQuery = pageQuery.extend({
  ...dateRangeQuery.shape,
  type: z.enum(['all', 'work', 'payments', 'expenses']).default('all'),
  search: z.string().trim().max(80).optional(),
});

// ---------- Settings ----------
export const updateSettingsSchema = z
  .object({
    businessName: z.string().trim().min(1).max(80),
    tractorHourlyRate: rupeesNonNegative,
    driverHourlyRate: rupeesNonNegative,
    driverName: z.string().trim().min(1).max(80),
    paymentCycleStartDate: dateStr,
    language: z.enum(['en', 'kn']),
  })
  .partial();
