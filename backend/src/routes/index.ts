import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  auth,
  customerCtrl,
  customerPaymentCtrl,
  dashboardCtrl,
  driverPaymentCtrl,
  expenseCtrl,
  historyCtrl,
  settingsCtrl,
  userCtrl,
  workCtrl,
} from '../controllers';
import { adminOnly, canCorrect, canCreate, requireAuth } from '../middleware/auth';

const isTest = process.env.NODE_ENV === 'test';

/** Slows down password guessing: 10 attempts per 15 minutes per IP. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again after 15 minutes.' } },
});

export function buildRouter(): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  // ---- auth
  r.post('/auth/login', loginLimiter, auth.login);
  r.get('/auth/me', requireAuth, auth.me);
  r.post('/auth/logout', requireAuth, auth.logout);

  // Every route below needs a logged-in, active user.
  r.use(requireAuth);

  // ---- users (admin only)
  r.get('/users', adminOnly, userCtrl.list);
  r.post('/users', adminOnly, userCtrl.create);
  r.patch('/users/:id', adminOnly, userCtrl.update);
  r.delete('/users/:id', adminOnly, userCtrl.deactivate);

  // ---- customers
  r.get('/customers', customerCtrl.list);
  r.post('/customers', canCreate, customerCtrl.create);
  r.get('/customers/:id', customerCtrl.get);
  r.patch('/customers/:id', canCorrect, customerCtrl.update);

  // ---- works
  r.get('/works', workCtrl.list);
  r.post('/works', canCreate, workCtrl.create);
  r.get('/works/:id', workCtrl.get);
  r.patch('/works/:id', canCorrect, workCtrl.update);
  r.delete('/works/:id', canCorrect, workCtrl.remove);

  // ---- customer payments
  r.get('/customer-payments', customerPaymentCtrl.list);
  r.post('/customer-payments', canCreate, customerPaymentCtrl.create);
  r.get('/customer-payments/:id', customerPaymentCtrl.get);
  r.post('/customer-payments/:id/void', canCorrect, customerPaymentCtrl.void);

  // ---- driver payments (cycles route must come before :id)
  r.get('/driver-payments', driverPaymentCtrl.list);
  r.get('/driver-payments/cycles', driverPaymentCtrl.cycles);
  r.get('/driver-payments/cycles/:startDate', driverPaymentCtrl.cycle);
  r.post('/driver-payments', canCreate, driverPaymentCtrl.create);
  r.get('/driver-payments/:id', driverPaymentCtrl.get);
  r.post('/driver-payments/:id/void', canCorrect, driverPaymentCtrl.void);

  // ---- expenses
  r.get('/expenses', expenseCtrl.list);
  r.post('/expenses', canCreate, expenseCtrl.create);
  r.get('/expenses/:id', expenseCtrl.get);
  r.patch('/expenses/:id', canCorrect, expenseCtrl.update);
  r.delete('/expenses/:id', canCorrect, expenseCtrl.remove);

  // ---- dashboard & history
  r.get('/dashboard/summary', dashboardCtrl.summary);
  r.get('/dashboard/driver-summary', dashboardCtrl.driverSummary);
  r.get('/history', historyCtrl.list);

  // ---- settings
  r.get('/settings', settingsCtrl.get);
  r.patch('/settings', adminOnly, settingsCtrl.update);

  return r;
}
