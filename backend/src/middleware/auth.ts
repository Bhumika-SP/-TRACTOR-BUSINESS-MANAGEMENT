import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, type Role, type UserDoc } from '../models';
import { forbidden, unauthorized } from '../utils/errors';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  canEdit: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  tv: number;
}

export function signToken(user: UserDoc): string {
  const payload: TokenPayload = { sub: String(user._id), tv: user.tokenVersion };
  return jwt.sign(payload, env().JWT_SECRET, {
    expiresIn: env().JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export function toAuthUser(user: UserDoc): AuthUser {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role as Role,
    canEdit: user.role === 'admin' || (user.role === 'entry' && Boolean(user.canEdit)),
  };
}

/** Verifies the Bearer token AND re-checks the user in the database on every request,
 *  so deactivated users or logged-out tokens stop working immediately. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env().JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload;
  } catch {
    return next(unauthorized());
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) return next(unauthorized());
  req.user = toAuthUser(user);
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Only these roles may call the route. */
export const allowRoles =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = currentUser(req);
    if (!roles.includes(user.role)) return next(forbidden());
    next();
  };

/** Admin + Work Entry users can ADD new records. Viewers cannot. */
export const canCreate = allowRoles('admin', 'entry');

/** Editing, deleting or cancelling existing financial records: Admin, or Work Entry users with edit permission. */
export function canCorrect(req: Request, _res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user.canEdit) return next(forbidden('Only authorised users can edit or correct records'));
  next();
}

export const adminOnly = allowRoles('admin');
