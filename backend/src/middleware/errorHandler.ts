import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

/** Converts every error into the same safe JSON shape: { success: false, error: { code, message, details? } } */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: fields[0]?.message ?? 'Invalid input', details: fields },
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id' } });
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } });
  }
  const anyErr = err as { code?: number; hasErrorLabel?: (l: string) => boolean };
  if (anyErr?.code === 112 || anyErr?.hasErrorLabel?.('TransientTransactionError')) {
    return res.status(409).json({
      success: false,
      error: { code: 'BUSY', message: 'Another change was saved at the same time. Please try again.' },
    });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}
