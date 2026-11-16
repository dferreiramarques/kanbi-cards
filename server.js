import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createAuth } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The server stores NOTHING. Boards live in the browser and, once signed in with Google, in the user's own
// Google Drive (private app folder). This process serves the pages and does the Google sign-in token exchange (auth.js).
export function createApp(opts = {}) {
  const env = opts.env || process.env;
  const auth = createAuth({ env: { APP_ID: 'kanbi', APP_PATH: '/app.html', ...env } });
  const app = express();
  app.set('trust proxy', 1);                 // behind Render's proxy: real client IP, https
  app.disable('x-powered-by');

  app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.get('/api/config', (req, res) => res.json({ signIn: auth.enabled }));
  app.use('/auth', auth.router);

  app.use(express.static(__dirname));
  app.get('*', (req, res) => res.sendFile(join(__dirname, 'index.html')));   // catch-all: product page
  if (!auth.enabled) console.warn('Drive sync is off: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and COOKIE_SECRET to enable it.');
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3000;
  createApp().listen(PORT, () => console.log(`kanbi.cards running on port ${PORT} (landing: index.html · app: app.html)`));
}
