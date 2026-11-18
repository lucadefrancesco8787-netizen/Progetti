import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carica .env se esiste (in produzione le variabili arrivano dal server)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

export const config = {
  port: Number(process.env.PORT) || 3000,
  databasePath: fromRoot(process.env.DATABASE_PATH || './data/zetaclub.db'),
  uploadDir: fromRoot(process.env.UPLOAD_DIR || './data/uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 5,
  adminToken: process.env.ADMIN_TOKEN || '',
  // Crea gli account e i dati dimostrativi al primo avvio (da disattivare in produzione)
  seedDemo: process.env.SEED_DEMO === 'true',
  // In produzione (HTTPS) il cookie di sessione va marcato Secure
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
  // Di quali proxy fidarsi per conoscere l'IP vero del visitatore (limite ai tentativi di accesso).
  // "loopback" = Nginx/Caddy sullo stesso server; un numero = quanti proxy davanti (es. 1 su Render)
  trustProxy: /^\d+$/.test(process.env.TRUST_PROXY || '') ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY || 'loopback',
  // Se impostata, tutto il sito chiede utente e password (per anteprime pubbliche)
  siteUser: process.env.SITE_USER || 'zetaclub',
  sitePassword: process.env.SITE_PASSWORD || '',
};
