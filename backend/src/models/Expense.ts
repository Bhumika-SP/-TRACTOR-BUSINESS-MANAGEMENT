import { Schema, model, Types, type InferSchemaType } from 'mongoose';

export const EXPENSE_CATEGORIES = ['diesel', 'maintenance', 'repair', 'engine_oil', 'other'] as const;

const expenseSchema = new Schema(
  {
    expenseDate: { type: String, required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    amount: { type: Number, required: true, min: 1 },
    description: { type: String, trim: true, default: '' },
    relatedWorkId: { type: Schema.Types.ObjectId, ref: 'Work' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    requestId: { type: String },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deleteReason: { type: String },
  },
  { timestamps: true },
);
expenseSchema.index({ isDeleted: 1, expenseDate: -1 });
expenseSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export type ExpenseShape = InferSchemaType<typeof expenseSchema> & { _id: Types.ObjectId };
export const Expense = model('Expense', expenseSchema);
