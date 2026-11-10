import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';
import { resetEnvCache } from '../src/config/env';
import { User } from '../src/models';
import { hashPassword } from '../src/services/userService';

let replSet: MongoMemoryReplSet | null = null;

/** Starts an in-memory MongoDB replica set (needed for transactions) and the Express app. */
export async function startTestApp(): Promise<Express> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = replSet.getUri('tractor_test');
  process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
  resetEnvCache();
  await connectDatabase(process.env.MONGODB_URI);
  return createApp();
}

export async function stopTestApp() {
  await mongoose.disconnect();
  await replSet?.stop();
}

export async function createUser(
  username: string,
  role: 'admin' | 'entry' | 'viewer',
  canEdit = false,
  password = 'password123',
) {
  return User.create({ name: username, username, passwordHash: await hashPassword(password), role, canEdit });
}

export async function loginAs(app: Express, username: string, password = 'password123'): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

/** Small wrapper so tests read like: api.post('/works', body) */
export function client(app: Express, token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string, query?: Record<string, unknown>) => request(app).get(`/api${url}`).query(query ?? {}).set(auth),
    post: (url: string, body?: unknown) => request(app).post(`/api${url}`).set(auth).send(body as object),
    patch: (url: string, body?: unknown) => request(app).patch(`/api${url}`).set(auth).send(body as object),
    delete: (url: string, body?: unknown) => request(app).delete(`/api${url}`).set(auth).send(body as object),
  };
}
