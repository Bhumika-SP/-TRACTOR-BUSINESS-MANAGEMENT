import mongoose, { type ClientSession, type Types } from 'mongoose';
import { AuditLog, Lock } from '../models';

/**
 * Runs fn inside a MongoDB transaction (requires a replica set, e.g. MongoDB Atlas).
 * The driver retries automatically on transient write conflicts.
 */
export async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

/** Writes a lock document inside the transaction; concurrent transactions on the same key conflict and retry. */
export async function takeLock(key: string, session: ClientSession): Promise<void> {
  await Lock.updateOne({ key }, { $inc: { version: 1 } }, { upsert: true, session });
}

export async function audit(
  session: ClientSession | null,
  entry: {
    entityType: string;
    entityId: Types.ObjectId | string;
    action: 'create' | 'update' | 'delete' | 'void';
    userId: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
): Promise<void> {
  await AuditLog.create([entry], { session: session ?? undefined });
}

export function isDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Plain-object copy of a document for audit snapshots. */
export function snapshot(doc: { toObject?: () => unknown } | null | undefined): unknown {
  if (!doc) return undefined;
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}
