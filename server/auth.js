import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { config } from './config.js';

const COOKIE = 'zc_sess';

/* ---------- Password (scrypt, con sale casuale) ---------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verificaPassword(password, salvata) {
  const [alg, salt, hash] = String(salvata).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const atteso = Buffer.from(hash, 'base64');
  const calcolato = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), atteso.length);
  return crypto.timingSafeEqual(atteso, calcolato);
}
// Usata quando l'email non esiste, così la risposta impiega lo stesso tempo
const HASH_FINTO = hashPassword(crypto.randomBytes(12).toString('hex'));

/* ---------- Cookie e sessioni ---------- */
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

function leggiCookie(req) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === COOKIE) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}
function scriviCookie(res, valore, maxAgeSec) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${valore}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`);
}

export function utenteDaRichiesta(req) {
  const token = leggiCookie(req);
  if (!token) return null;
  return db.prepare(
    `SELECT u.id, u.email, u.nome, u.cognome, u.ruolo, u.trainer_id
       FROM sessioni s JOIN utenti u ON u.id = s.utente_id
      WHERE s.token_hash = ? AND s.scade_il > datetime('now') AND u.attivo = 1`
  ).get(sha256(token)) || null;
}

export function richiediLogin(req, res, next) {
  const u = utenteDaRichiesta(req);
  if (!u) return res.status(401).json({ ok: false, errore: 'Sessione scaduta, accedi di nuovo.' });
  req.utente = u;
  next();
}

/* ---------- Limite tentativi (in memoria, per IP + email) ---------- */
const tentativi = new Map();
const FINESTRA = 15 * 60 * 1000;
const MAX_TENTATIVI = 8;
function troppiTentativi(chiave) {
  const ora = Date.now();
  const lista = (tentativi.get(chiave) || []).filter((t) => ora - t < FINESTRA);
  tentativi.set(chiave, lista);
  return lista.length >= MAX_TENTATIVI;
}
const segnaTentativo = (chiave) => tentativi.get(chiave)?.push(Date.now());

/* ---------- Route /api/auth ---------- */
export const auth = express.Router();
auth.use(express.json({ limit: '10kb' }));

const ETICHETTE = { cliente: 'Cliente', receptionist: 'Reception', consulente: 'Consulente commerciale', trainer: 'Personal Trainer', istruttore: 'Istruttore corsi' };
const pubblico = (u) => ({ nome: u.nome, cognome: u.cognome, email: u.email, ruolo: u.ruolo, ruoloEtichetta: ETICHETTE[u.ruolo] });

auth.post('/login', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 160);
  const password = String(req.body?.password ?? '').slice(0, 200);
  const chiave = `${req.ip}|${email}`;
  if (troppiTentativi(chiave)) {
    return res.status(429).json({ ok: false, errore: 'Troppi tentativi. Riprova tra qualche minuto.' });
  }
  const u = email ? db.prepare('SELECT * FROM utenti WHERE email = ?').get(email) : null;
  const ok = verificaPassword(password, u ? u.password_hash : HASH_FINTO) && u && u.attivo === 1;
  if (!ok) {
    segnaTentativo(chiave);
    return res.status(401).json({ ok: false, errore: 'Email o password non corretti.' });
  }
  tentativi.delete(chiave);

  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare(`DELETE FROM sessioni WHERE scade_il <= datetime('now')`).run();
  db.prepare(`INSERT INTO sessioni (token_hash, utente_id, scade_il) VALUES (?, ?, datetime('now', ?))`)
    .run(sha256(token), u.id, `+${config.sessionDays} days`);
  scriviCookie(res, token, config.sessionDays * 86400);
  res.json({ ok: true, utente: pubblico(u) });
});

auth.post('/logout', (req, res) => {
  const token = leggiCookie(req);
  if (token) db.prepare('DELETE FROM sessioni WHERE token_hash = ?').run(sha256(token));
  scriviCookie(res, '', 0);
  res.json({ ok: true });
});

auth.get('/me', (req, res) => {
  const u = utenteDaRichiesta(req);
  if (!u) return res.status(401).json({ ok: false });
  res.json({ ok: true, utente: pubblico(u) });
});
