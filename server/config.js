import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carica .env se esiste (in produzione le variabili arrivano dal server)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// Su Render (che imposta RENDER=true da solo) valgono già le impostazioni dell'anteprima:
// dati dimostrativi, cookie Secure (HTTPS) e un proxy davanti. Le variabili, se impostate, vincono.
const suRender = process.env.RENDER === 'true';
const vero = (nome, predefinito) => (process.env[nome] ?? String(predefinito)) === 'true';

const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

export const config = {
  port: Number(process.env.PORT) || 3000,
  databasePath: fromRoot(process.env.DATABASE_PATH || './data/zetaclub.db'),
  uploadDir: fromRoot(process.env.UPLOAD_DIR || './data/uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 5,
  adminToken: process.env.ADMIN_TOKEN || '',
  // Crea gli account e i dati dimostrativi al primo avvio (da disattivare in produzione)
  seedDemo: vero('SEED_DEMO', suRender),
  // In produzione (HTTPS) il cookie di sessione va marcato Secure
  cookieSecure: vero('COOKIE_SECURE', suRender),
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
  // Di quali proxy fidarsi per conoscere l'IP vero del visitatore (limite ai tentativi di accesso).
  // "loopback" = Nginx/Caddy sullo stesso server; un numero = quanti proxy davanti (es. 1 su Render)
  trustProxy: /^\d+$/.test(process.env.TRUST_PROXY || '') ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY || (suRender ? 1 : 'loopback'),
  // Se impostata, tutto il sito chiede utente e password (per anteprime pubbliche)
  siteUser: process.env.SITE_USER || 'zetaclub',
  sitePassword: process.env.SITE_PASSWORD || '',
};
