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
};
