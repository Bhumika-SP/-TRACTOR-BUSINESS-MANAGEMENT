import axios, { AxiosError } from 'axios';
import { API_URL } from '@/constants/config';
import type {
  Customer,
  CustomerPayment,
  Cycle,
  CycleDetail,
  DashboardSummary,
  DriverPayment,
  DriverSummary,
  Expense,
  ExpenseCategory,
  HistoryItem,
  PageMeta,
  Paged,
  PaymentMethod,
  Role,
  Settings,
  User,
  Work,
  WorkDetail,
} from '@/types/api';
import { storage } from './storage';

/** Error with a message that can be shown to the user directly. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string,
    public readonly isNetwork = false,
  ) {
    super(message);
  }
}

const http = axios.create({ baseURL: API_URL, timeout: 20000 });

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

http.interceptors.request.use(async (config) => {
  const token = await storage.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: { code: string; message: string } }>) => {
    if (!err.response) {
      return Promise.reject(new ApiError('NETWORK', null, 'NETWORK', true));
    }
    const { status, data } = err.response;
    if (status === 401 && !err.config?.url?.includes('/auth/login')) onUnauthorized?.();
    return Promise.reject(new ApiError(data?.error?.message ?? 'SERVER', status, data?.error?.code ?? 'SERVER'));
  },
);

async function get<T>(url: string, params?: object): Promise<T> {
  const res = await http.get<{ data: T }>(url, { params });
  return res.data.data;
}
async function getPaged<T>(url: string, params?: object): Promise<Paged<T>> {
  const res = await http.get<{ data: T[]; meta: PageMeta }>(url, { params });
  return { data: res.data.data, meta: res.data.meta };
}
async function send<T>(method: 'post' | 'patch' | 'delete', url: string, body?: object): Promise<T> {
  const res = await http.request<{ data: T }>({ method, url, data: body });
  return res.data.data;
}

export interface ListParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  search?: string;
}

export const api = {
  // auth
  login: (username: string, password: string) =>
    send<{ token: string; user: User }>('post', '/auth/login', { username, password }),
  me: () => get<{ user: User }>('/auth/me'),
  logout: () => send('post', '/auth/logout'),

  // users
  users: () => get<User[]>('/users'),
  createUser: (body: { name: string; username: string; password: string; role: Role; canEdit: boolean }) =>
    send<User>('post', '/users', body),
  updateUser: (id: string, body: Partial<{ name: string; role: Role; canEdit: boolean; isActive: boolean; password: string }>) =>
    send<User>('patch', `/users/${id}`, body),

  // customers
  customers: (search: string) => getPaged<Customer>('/customers', { search, limit: 8 }),

  // works
  works: (p: ListParams & { status?: string; customerId?: string }) => getPaged<Work>('/works', p),
  work: (id: string) => get<WorkDetail>(`/works/${id}`),
  createWork: (body: object) => send<WorkDetail>('post', '/works', body),
  updateWork: (id: string, body: object) => send<WorkDetail>('patch', `/works/${id}`, body),
  deleteWork: (id: string, reason: string) => send('delete', `/works/${id}`, { reason }),

  // customer payments
  customerPayments: (p: ListParams & { workId?: string }) => getPaged<CustomerPayment>('/customer-payments', p),
  createCustomerPayment: (body: {
    workId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
    requestId: string;
  }) => send<CustomerPayment>('post', '/customer-payments', body),
  voidCustomerPayment: (id: string, reason: string) => send<CustomerPayment>('post', `/customer-payments/${id}/void`, { reason }),

  // driver
  cycles: (p: { page?: number; limit?: number; status?: 'paid' | 'pending' }) => getPaged<Cycle>('/driver-payments/cycles', p),
  cycle: (startDate: string) => get<CycleDetail>(`/driver-payments/cycles/${startDate}`),
  driverPayments: (p: ListParams) => getPaged<DriverPayment>('/driver-payments', p),
  createDriverPayment: (body: {
    cycleStartDate: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
    requestId: string;
  }) => send<DriverPayment>('post', '/driver-payments', body),
  voidDriverPayment: (id: string, reason: string) => send<DriverPayment>('post', `/driver-payments/${id}/void`, { reason }),

  // expenses
  expenses: (p: ListParams & { category?: ExpenseCategory }) => getPaged<Expense>('/expenses', p),
  expense: (id: string) => get<Expense>(`/expenses/${id}`),
  createExpense: (body: object) => send<Expense>('post', '/expenses', body),
  updateExpense: (id: string, body: object) => send<Expense>('patch', `/expenses/${id}`, body),
  deleteExpense: (id: string, reason: string) => send('delete', `/expenses/${id}`, { reason }),

  // dashboard, history, settings
  summary: (p: { date?: string; month?: string; from?: string; to?: string }) => get<DashboardSummary>('/dashboard/summary', p),
  driverSummary: () => get<DriverSummary>('/dashboard/driver-summary'),
  history: (p: ListParams & { type: string }) => getPaged<HistoryItem>('/history', p),
  settings: () => get<Settings>('/settings'),
  updateSettings: (body: Partial<Settings>) => send<Settings>('patch', '/settings', body),
};
