import type { Request, Response } from 'express';
import { currentUser, signToken, toAuthUser } from '../middleware/auth';
import { Customer, User } from '../models';
import * as customerPayments from '../services/customerPaymentService';
import { dashboardSummary } from '../services/dashboardService';
import * as driver from '../services/driverService';
import * as expenses from '../services/expenseService';
import { history } from '../services/historyService';
import { getSettings, serializeSettings, updateSettings } from '../services/settingsService';
import * as users from '../services/userService';
import * as works from '../services/workService';
import { escapeRegex, isDuplicateKeyError } from '../utils/tx';
import { conflict, notFound } from '../utils/errors';
import { created, ok, pageMeta } from '../utils/response';
import { objectId, parse, reasonSchema, toPage } from '../validators/common';
import * as s from '../validators/schemas';

const idParam = (req: Request) => parse(objectId, req.params.id);

// ------------------------------------------------------------------ auth
export const auth = {
  async login(req: Request, res: Response) {
    const body = parse(s.loginSchema, req.body);
    const user = await users.login(body.username, body.password);
    ok(res, { token: signToken(user), user: users.serializeUser(user) });
  },
  async me(req: Request, res: Response) {
    const user = await User.findById(currentUser(req).id);
    if (!user) throw notFound('User');
    ok(res, { user: users.serializeUser(user), permissions: toAuthUser(user) });
  },
  async logout(req: Request, res: Response) {
    await users.logoutEverywhere(currentUser(req).id);
    ok(res, { loggedOut: true });
  },
};

// ------------------------------------------------------------------ users (admin)
export const userCtrl = {
  async list(_req: Request, res: Response) {
    const all = await User.find().sort({ isActive: -1, name: 1 });
    ok(res, all.map(users.serializeUser));
  },
  async create(req: Request, res: Response) {
    const body = parse(s.createUserSchema, req.body);
    const user = await users.createUser(body, currentUser(req).id);
    created(res, users.serializeUser(user));
  },
  async update(req: Request, res: Response) {
    const body = parse(s.updateUserSchema, req.body);
    const user = await users.updateUser(idParam(req), body, currentUser(req).id);
    ok(res, users.serializeUser(user));
  },
  /** Users are deactivated, never deleted, so their past entries keep a valid author. */
  async deactivate(req: Request, res: Response) {
    const user = await users.updateUser(idParam(req), { isActive: false }, currentUser(req).id);
    ok(res, users.serializeUser(user));
  },
};

// ------------------------------------------------------------------ customers
export const customerCtrl = {
  async list(req: Request, res: Response) {
    const q = parse(s.customerListQuery, req.query);
    const p = toPage(q);
    const filter = q.search
      ? { $or: [{ nameLower: new RegExp(escapeRegex(q.search.toLowerCase())) }, { phone: new RegExp(escapeRegex(q.search)) }] }
      : {};
    const [items, total] = await Promise.all([
      Customer.find(filter).sort({ nameLower: 1 }).skip(p.skip).limit(p.limit).lean(),
      Customer.countDocuments(filter),
    ]);
    ok(
      res,
      items.map((c) => ({ id: String(c._id), name: c.name, phone: c.phone, address: c.address })),
      pageMeta(p, total),
    );
  },
  async create(req: Request, res: Response) {
    const body = parse(s.createCustomerSchema, req.body);
    const c = await Customer.create({ ...body, nameLower: body.name.toLowerCase() });
    created(res, { id: String(c._id), name: c.name, phone: c.phone, address: c.address });
  },
  async get(req: Request, res: Response) {
    const c = await Customer.findById(idParam(req)).lean();
    if (!c) throw notFound('Farmer');
    const workList = await works.listWorks({ customerId: String(c._id), page: 1, limit: 100, skip: 0 });
    ok(res, { id: String(c._id), name: c.name, phone: c.phone, address: c.address, works: workList.items, totals: workList.totals });
  },
  async update(req: Request, res: Response) {
    const body = parse(s.updateCustomerSchema, req.body);
    const c = await Customer.findById(idParam(req));
    if (!c) throw notFound('Farmer');
    if (body.name !== undefined) {
      c.name = body.name;
      c.nameLower = body.name.toLowerCase();
    }
    if (body.phone !== undefined) c.phone = body.phone;
    if (body.address !== undefined) c.address = body.address;
    await c.save();
    ok(res, { id: String(c._id), name: c.name, phone: c.phone, address: c.address });
  },
};

// ------------------------------------------------------------------ works
export const workCtrl = {
  async list(req: Request, res: Response) {
    const q = parse(s.workListQuery, req.query);
    const p = toPage(q);
    const r = await works.listWorks({ ...q, ...p });
    ok(res, r.items, { ...pageMeta(p, r.total), totals: r.totals });
  },
  async create(req: Request, res: Response) {
    const body = parse(s.createWorkSchema, req.body);
    const r = await works.createWork(body, currentUser(req));
    const data = await works.getWorkWithPayments(r.id);
    ok(res, data, { duplicate: r.duplicate }, r.duplicate ? 200 : 201);
  },
  async get(req: Request, res: Response) {
    ok(res, await works.getWorkWithPayments(idParam(req)));
  },
  async update(req: Request, res: Response) {
    const body = parse(s.updateWorkSchema, req.body);
    ok(res, await works.updateWork(idParam(req), body, currentUser(req)));
  },
  async remove(req: Request, res: Response) {
    const { reason } = parse(reasonSchema, req.body);
    await works.deleteWork(idParam(req), reason, currentUser(req));
    ok(res, { deleted: true });
  },
};

// ------------------------------------------------------------------ customer payments
export const customerPaymentCtrl = {
  async list(req: Request, res: Response) {
    const q = parse(s.customerPaymentListQuery, req.query);
    const p = toPage(q);
    const r = await customerPayments.listCustomerPayments({ ...q, ...p });
    ok(res, r.items, { ...pageMeta(p, r.total), totalAmount: r.totalAmount });
  },
  async create(req: Request, res: Response) {
    const body = parse(s.createCustomerPaymentSchema, req.body);
    const r = await customerPayments.createCustomerPayment(body, currentUser(req));
    const data = await customerPayments.getCustomerPayment(r.id);
    ok(res, data, { duplicate: r.duplicate }, r.duplicate ? 200 : 201);
  },
  async get(req: Request, res: Response) {
    ok(res, await customerPayments.getCustomerPayment(idParam(req)));
  },
  async void(req: Request, res: Response) {
    const { reason } = parse(reasonSchema, req.body);
    ok(res, await customerPayments.voidCustomerPayment(idParam(req), reason, currentUser(req)));
  },
};

// ------------------------------------------------------------------ driver payments
export const driverPaymentCtrl = {
  async list(req: Request, res: Response) {
    const q = parse(s.driverPaymentListQuery, req.query);
    const p = toPage(q);
    const r = await driver.listDriverPayments({ ...q, ...p });
    ok(res, r.items, { ...pageMeta(p, r.total), totalAmount: r.totalAmount });
  },
  async cycles(req: Request, res: Response) {
    const q = parse(s.cycleListQuery, req.query);
    const p = toPage(q);
    const r = await driver.listCycles({ status: q.status, ...p });
    ok(res, r.items, pageMeta(p, r.total));
  },
  async cycle(req: Request, res: Response) {
    const start = parse(s.createDriverPaymentSchema.shape.cycleStartDate, req.params.startDate);
    ok(res, await driver.getCycle(start));
  },
  async create(req: Request, res: Response) {
    const body = parse(s.createDriverPaymentSchema, req.body);
    const r = await driver.createDriverPayment(body, currentUser(req));
    const data = await driver.getDriverPayment(r.id);
    ok(res, data, { duplicate: r.duplicate }, r.duplicate ? 200 : 201);
  },
  async get(req: Request, res: Response) {
    ok(res, await driver.getDriverPayment(idParam(req)));
  },
  async void(req: Request, res: Response) {
    const { reason } = parse(reasonSchema, req.body);
    ok(res, await driver.voidDriverPayment(idParam(req), reason, currentUser(req)));
  },
};

// ------------------------------------------------------------------ expenses
export const expenseCtrl = {
  async list(req: Request, res: Response) {
    const q = parse(s.expenseListQuery, req.query);
    const p = toPage(q);
    const r = await expenses.listExpenses({ ...q, ...p });
    ok(res, r.items, { ...pageMeta(p, r.total), totalAmount: r.totalAmount });
  },
  async create(req: Request, res: Response) {
    const body = parse(s.createExpenseSchema, req.body);
    const r = await expenses.createExpense(body, currentUser(req));
    ok(res, await expenses.getExpense(r.id), { duplicate: r.duplicate }, r.duplicate ? 200 : 201);
  },
  async get(req: Request, res: Response) {
    ok(res, await expenses.getExpense(idParam(req)));
  },
  async update(req: Request, res: Response) {
    const body = parse(s.updateExpenseSchema, req.body);
    ok(res, await expenses.updateExpense(idParam(req), body, currentUser(req)));
  },
  async remove(req: Request, res: Response) {
    const { reason } = parse(reasonSchema, req.body);
    await expenses.deleteExpense(idParam(req), reason, currentUser(req));
    ok(res, { deleted: true });
  },
};

// ------------------------------------------------------------------ dashboard, history, settings
export const dashboardCtrl = {
  async summary(req: Request, res: Response) {
    ok(res, await dashboardSummary(parse(s.summaryQuery, req.query)));
  },
  async driverSummary(_req: Request, res: Response) {
    ok(res, await driver.driverSummary());
  },
};

export const historyCtrl = {
  async list(req: Request, res: Response) {
    const q = parse(s.historyQuery, req.query);
    const p = toPage(q);
    const r = await history({ ...q, ...p });
    ok(res, r.items, pageMeta(p, r.total));
  },
};

export const settingsCtrl = {
  async get(_req: Request, res: Response) {
    ok(res, serializeSettings(await getSettings()));
  },
  async update(req: Request, res: Response) {
    const body = parse(s.updateSettingsSchema, req.body);
    try {
      ok(res, serializeSettings(await updateSettings(body, currentUser(req).id)));
    } catch (err) {
      if (isDuplicateKeyError(err)) throw conflict('Settings were changed at the same time. Please try again.');
      throw err;
    }
  },
};
