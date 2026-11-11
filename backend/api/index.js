/**
 * Vercel entry point. Vercel runs `npm run build` first (TypeScript -> dist/), then serves
 * every request through this one serverless function (see vercel.json rewrites).
 * The database connection is opened once per warm instance and reused.
 */
const mongoose = require('mongoose');
require('../dist/models');
const { createApp } = require('../dist/app');
const { connectDatabase } = require('../dist/config/db');
const { env } = require('../dist/config/env');

let app;
let ready;

module.exports = async function handler(req, res) {
  try {
    app ??= createApp();
    // CORS preflight needs no database: let the app's cors middleware answer it.
    if (req.method === 'OPTIONS') return app(req, res);
    if (mongoose.connection.readyState !== 1) {
      ready ??= connectDatabase(env().MONGODB_URI).catch((err) => {
        ready = undefined; // try again on the next request
        throw err;
      });
      await ready;
    }
  } catch (err) {
    console.error('Startup failed:', err instanceof Error ? err.message : err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    // Without CORS headers the browser hides this reply and the app wrongly says "No internet".
    const origin = req.headers.origin;
    const allowed = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim());
    if (origin && allowed.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
    }
    res.end(JSON.stringify({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Server is starting or the database is unreachable. Please try again.' } }));
    return;
  }
  return app(req, res);
};
