import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ROLES = ['admin', 'entry', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    /** Work Entry users may only correct/edit existing records when this is true. Admins always can. */
    canEdit: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    /** Incremented on logout / password change / deactivation to invalidate old tokens. */
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
