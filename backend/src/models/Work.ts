import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/** Money fields are integer paise. Dates are "YYYY-MM-DD", times "HH:mm". */
const workSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    workDate: { type: String, required: true },
    description: { type: String, trim: true, default: '' },
    fromTime: { type: String, required: true },
    toTime: { type: String, required: true },
    workingMinutes: { type: Number, required: true, min: 1 },
    /** Tractor rate used for THIS job (paise/hour). Changing Settings later never changes old jobs. */
    tractorHourlyRate: { type: Number, required: true, min: 0 },
    totalWorkAmount: { type: Number, required: true, min: 0 },
    /** Driver rate at the time of this job (paise/hour). */
    driverHourlyRateSnapshot: { type: Number, required: true, min: 0 },
    /** V1: equals workingMinutes. Kept separate so it can differ in future. */
    driverWorkingMinutes: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Client-generated id that makes repeated submissions of the same form harmless. */
    requestId: { type: String },
    /** Bumped inside payment transactions so concurrent payments on one job conflict instead of over-paying. */
    lockVersion: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deleteReason: { type: String },
  },
  { timestamps: true },
);
workSchema.index({ isDeleted: 1, workDate: -1, fromTime: -1 });
workSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export type WorkShape = InferSchemaType<typeof workSchema> & { _id: Types.ObjectId };
export const Work = model('Work', workSchema);
