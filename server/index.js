import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config, ROOT } from './config.js';
import { db, migrate } from './db.js';
import { visbody } from './visbody.js';
import { auth, utenteDaRichiesta } from './auth.js';
import { area } from './area.js';
import { seedDemo } from './seed.js';

migrate();
if (config.seedDemo && seedDemo()) console.log('Account e dati dimostrativi creati (npm run seed per vederli).');
fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // dietro Nginx/Caddy sul server, req.ip resta quello vero

// Area riservata: senza login si va alla pagina di accesso, e viceversa
app.get(['/area', '/area.html'], (req, res, next) => (utenteDaRichiesta(req) ? next() : res.redirect('/accedi')));
app.get(['/accedi', '/accedi.html'], (req, res, next) => (utenteDaRichiesta(req) ? res.redirect('/area') : next()));
app.use(['/area', '/accedi'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// File statici del sito + librerie front-end da node_modules
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use('/vendor/gsap', express.static(path.join(ROOT, 'node_modules', 'gsap', 'dist')));
app.use('/vendor/lenis', express.static(path.join(ROOT, 'node_modules', 'lenis', 'dist')));

// ---- Upload curriculum ----
const ESTENSIONI = new Set(['.pdf', '.doc', '.docx']);
const RUOLI = new Set(['personal-trainer', 'consulente-commerciale', 'segreteria']);

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = ESTENSIONI.has(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('FORMATO'), ok);
  },
});

const pulisci = (v, max = 200) => String(v ?? '').trim().slice(0, max);

app.post('/api/candidature', (req, res) => {
  upload.single('cv')(req, res, (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? `Il CV supera i ${config.maxUploadMb} MB.`
        : err.message === 'FORMATO' ? 'Carica il CV in formato PDF, DOC o DOCX.'
        : 'Errore durante il caricamento del file.';
      return res.status(400).json({ ok: false, errore: msg });
    }
    const b = req.body ?? {};
    const dati = {
      nome: pulisci(b.nome, 80),
      cognome: pulisci(b.cognome, 80),
      email: pulisci(b.email, 160),
      telefono: pulisci(b.telefono, 40),
      ruolo: pulisci(b.ruolo, 40),
      messaggio: pulisci(b.messaggio, 2000),
    };
    const scarta = (errore) => {
      if (req.file) fs.rm(req.file.path, { force: true }, () => {});
      res.status(400).json({ ok: false, errore });
    };
    if (!dati.nome || !dati.cognome) return scarta('Inserisci nome e cognome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dati.email)) return scarta('Inserisci un indirizzo email valido.');
    if (!RUOLI.has(dati.ruolo)) return scarta('Scegli la posizione per cui ti candidi.');
    if (b.privacy !== 'on') return scarta('Devi accettare il trattamento dei dati personali.');
    if (!req.file) return scarta('Allega il tuo curriculum.');

    db.prepare(
      `INSERT INTO candidature (nome, cognome, email, telefono, ruolo, messaggio, cv_file, cv_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(dati.nome, dati.cognome, dati.email, dati.telefono, dati.ruolo, dati.messaggio, req.file.filename, pulisci(req.file.originalname, 200));

    res.json({ ok: true });
  });
});

// Elenco candidature (protetto da token: /api/candidature?token=...)
app.get('/api/candidature', (req, res) => {
  if (!config.adminToken || req.query.token !== config.adminToken) return res.status(401).json({ ok: false });
  res.json(db.prepare('SELECT * FROM candidature ORDER BY creato_il DESC').all());
});

app.use('/api/visbody', visbody);
app.use('/api/auth', auth);
app.use('/api/area', area);

app.use('/api', (_req, res) => res.status(404).json({ ok: false, errore: 'Risorsa non trovata.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, errore: 'Errore interno, riprova tra poco.' });
});
app.use((_req, res) => res.status(404).sendFile(path.join(ROOT, 'public', '404.html')));

app.listen(config.port, () => {
  console.log(`Zeta Club online su http://localhost:${config.port}`);
});
