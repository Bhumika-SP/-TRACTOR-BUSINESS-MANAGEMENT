import { Schema, model, Types, type InferSchemaType } from 'mongoose';

export const PAYMENT_METHODS = ['cash', 'upi', 'bank'] as const;

/** Every payment is its own record. Records are never overwritten; mistakes are cancelled (voided) with a reason. */
const customerPaymentSchema = new Schema(
  {
    workId: { type: Schema.Types.ObjectId, ref: 'Work', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
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
customerPaymentSchema.index({ isVoided: 1, paymentDate: -1 });
customerPaymentSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export type CustomerPaymentShape = InferSchemaType<typeof customerPaymentSchema> & { _id: Types.ObjectId };
export const CustomerPayment = model('CustomerPayment', customerPaymentSchema);
