import { Schema, model } from 'mongoose';

/** Permanent trail of every change to financial records, users and settings. */
const auditLogSchema = new Schema(
  {
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, enum: ['create', 'update', 'delete', 'void'], required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    reason: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const AuditLog = model('AuditLog', auditLogSchema);
