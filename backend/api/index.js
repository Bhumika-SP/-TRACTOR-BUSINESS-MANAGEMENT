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
    res.end(JSON.stringify({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Server is starting or the database is unreachable. Please try again.' } }));
    return;
  }
  return app(req, res);
};
