import { Schema, model, Types, type InferSchemaType } from 'mongoose';
import { PAYMENT_METHODS } from './CustomerPayment';

/**
 * A cash payment to the driver against one 10-day cycle. Partial payments are separate records.
 * totalWorkingMinutes / hourlyRate / totalSalary are a snapshot of the cycle when the payment was made
 * (for the history screen); live cycle totals are always recalculated from Work records.
 */
const driverPaymentSchema = new Schema(
  {
    cycleStartDate: { type: String, required: true, index: true },
    cycleEndDate: { type: String, required: true },
    totalWorkingMinutes: { type: Number, required: true, min: 0 },
    hourlyRate: { type: Number, required: true, min: 0 },
    totalSalary: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 1 },
    paymentDate: { type: String, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    note: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestId: { type: String },
    isVoided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String },
  },
  { timestamps: true },
);
driverPaymentSchema.index({ isVoided: 1, paymentDate: -1 });
driverPaymentSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export type DriverPaymentShape = InferSchemaType<typeof driverPaymentSchema> & { _id: Types.ObjectId };
export const DriverPayment = model('DriverPayment', driverPaymentSchema);
