import type { ClientSession } from 'mongoose';
import { env } from '../config/env';
import { DriverPayment, Settings } from '../models';
import { daysBetween, todayInZone } from '../utils/dates';
import { badRequest } from '../utils/errors';
import { paiseToRupees } from '../utils/money';
import { audit } from '../utils/tx';
import { DRIVER_CYCLE_DAYS } from './calculations';

export async function getSettings(session?: ClientSession) {
  const existing = await Settings.findOne({ key: 'main' }).session(session ?? null);
  if (existing) return existing;
  const today = todayInZone(env().BUSINESS_TIMEZONE);
  // Default cycle start: first day of the current month.
  try {
    return await Settings.create({ key: 'main', paymentCycleStartDate: `${today.slice(0, 7)}-01` });
  } catch {
    // Created concurrently by another request.
    return (await Settings.findOne({ key: 'main' }))!;
  }
}

export type SettingsDoc = Awaited<ReturnType<typeof getSettings>>;

export function serializeSettings(s: SettingsDoc) {
  return {
    businessName: s.businessName,
    tractorHourlyRate: paiseToRupees(s.tractorHourlyRate),
    driverHourlyRate: paiseToRupees(s.driverHourlyRate),
    driverName: s.driverName,
    paymentCycleStartDate: s.paymentCycleStartDate,
    language: s.language,
    updatedAt: s.updatedAt,
  };
}

export async function updateSettings(
  input: Partial<{
    businessName: string;
    tractorHourlyRate: number;
    driverHourlyRate: number;
    driverName: string;
    paymentCycleStartDate: string;
    language: 'en' | 'kn';
  }>,
  userId: string,
) {
  const settings = await getSettings();
  const before = settings.toObject();

  if (input.paymentCycleStartDate && input.paymentCycleStartDate !== settings.paymentCycleStartDate) {
    // Existing driver payments are attached to cycle start dates; a new start date must keep them aligned.
    const payments = await DriverPayment.find({ isVoided: false }).distinct('cycleStartDate');
    const misaligned = payments.filter(
      (d: string) => ((daysBetween(input.paymentCycleStartDate!, d) % DRIVER_CYCLE_DAYS) + DRIVER_CYCLE_DAYS) % DRIVER_CYCLE_DAYS !== 0,
    );
    if (misaligned.length > 0) {
      throw badRequest(
        'This start date does not match cycles that already have driver payments. Choose a date that is a multiple of 10 days from an existing cycle start.',
        { existingCycleStarts: misaligned.slice(0, 5) },
      );
    }
  }

  settings.set(input);
  await settings.save();
  await audit(null, { entityType: 'Settings', entityId: settings._id, action: 'update', before, after: settings.toObject(), userId });
  return settings;
}
