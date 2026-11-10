import type { Response } from 'express';

/** All successful responses use the shape { success: true, data, meta? }. */
export function ok(res: Response, data: unknown, meta?: Record<string, unknown>, status = 200) {
  return res.status(status).json(meta ? { success: true, data, meta } : { success: true, data });
}

export function created(res: Response, data: unknown) {
  return ok(res, data, undefined, 201);
}

export interface PageParams {
  page: number;
  limit: number;
  skip: number;
}

export function pageMeta(p: PageParams, total: number) {
  return { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) };
}
