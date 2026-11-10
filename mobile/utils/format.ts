/**
 * Display helpers. The API sends dates as "YYYY-MM-DD" and times as "HH:mm" (24h);
 * the app shows Indian formats: DD-MM-YYYY, 12-hour time and ₹ with Indian digit grouping.
 */

/** Groups digits the Indian way: 12,34,567 */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** ₹2,500 — shows paise only when there are any (₹933.33). */
export function formatINR(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  const negative = value < 0;
  const abs = Math.abs(Math.round(value * 100) / 100);
  const [intPart, dec] = abs.toFixed(2).split('.');
  const text = `₹${groupIndian(intPart)}${dec === '00' ? '' : `.${dec}`}`;
  return negative ? `-${text}` : text;
}

/** "2026-11-09" → "09-11-2026" */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d}-${m}-${y}`;
}

/** "14:30" → "2:30 PM" */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, m] = time.split(':');
  const h = Number(hStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** Same rule as the server: if To is earlier than From, the work crossed midnight. */
export function minutesBetween(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const diff = th * 60 + tm - (fh * 60 + fm);
  if (diff === 0) return 0;
  return diff > 0 ? diff : diff + 24 * 60;
}

/** Preview only — the server recalculates and saves the real amount. */
export function previewAmount(minutes: number, ratePerHour: number): number {
  return Math.round((minutes * ratePerHour * 100) / 60) / 100;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeString(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

export function currentMonth(): string {
  return todayString().slice(0, 7);
}

export function dateFromString(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Parses a rupee amount typed by the user. Returns NaN when invalid. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}
