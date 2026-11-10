import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { buildRouter } from './routes';

export function createApp() {
  const app = express();
  const config = env();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render / other hosts run behind one proxy.
  app.use(helmet());

  const allowed = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      // Native apps send no Origin header and are always allowed; browsers must be listed.
      origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => config.NODE_ENV === 'test',
      message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Please wait a little.' } },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', buildRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
