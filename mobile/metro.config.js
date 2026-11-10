const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

/**
 * DEVELOPMENT ONLY: forwards /api/* from the Expo dev server to the local backend.
 * The browser version of the app then calls the API on its own address, so it works the same
 * through localhost, the Wi-Fi IP, or a tunnel (e.g. VS Code dev tunnels), with no CORS or
 * http/https mixing. Phones (Expo Go / builds) call EXPO_PUBLIC_API_URL directly instead.
 */
const API_TARGET = new URL(process.env.DEV_API_PROXY_TARGET || 'http://127.0.0.1:4100');

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) return middleware(req, res, next);
    const headers = { ...req.headers, host: API_TARGET.host };
    delete headers.origin; // same-origin from the browser's point of view
    delete headers.referer;
    const upstream = http.request(
      { hostname: API_TARGET.hostname, port: API_TARGET.port, path: req.url, method: req.method, headers },
      (apiRes) => {
        res.writeHead(apiRes.statusCode || 502, apiRes.headers);
        apiRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { code: 'API_UNAVAILABLE', message: 'Backend API is not running' } }));
    });
    req.pipe(upstream);
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
