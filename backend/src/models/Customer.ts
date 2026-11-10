import { Schema, model, type InferSchemaType } from 'mongoose';

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Lower-case copy of the name for case-insensitive search and duplicate detection. */
    nameLower: { type: String, required: true, index: true },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);
customerSchema.index({ nameLower: 1, phone: 1 });

export type CustomerShape = InferSchemaType<typeof customerSchema>;
export const Customer = model('Customer', customerSchema);
