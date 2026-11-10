import { Schema, model, type InferSchemaType } from 'mongoose';

/** Single settings document (key = "main"). Rates are paise/hour. */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    businessName: { type: String, default: 'Tractor Tracker', trim: true },
    tractorHourlyRate: { type: Number, default: 80000, min: 0 },
    driverHourlyRate: { type: Number, default: 20000, min: 0 },
    driverName: { type: String, default: 'Driver', trim: true },
    paymentCycleStartDate: { type: String, required: true },
    language: { type: String, enum: ['en', 'kn'], default: 'en' },
  },
  { timestamps: true },
);

export type SettingsShape = InferSchemaType<typeof settingsSchema>;
export const Settings = model('Settings', settingsSchema);
