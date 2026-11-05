import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { ROOT, config } from './config.js';
import { db } from './db.js';
import { toMin, toHHMM, oraItaliana, isData, giornoSettimana, aggiungiGiorni } from './tempo.js';

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'trainer.json'), 'utf8'));
const trainerById = new Map(cfg.trainer.map((t) => [t.id, t]));
const DURATA = cfg.durataVisitaMin;
const OBIETTIVI = new Set(['dimagrimento', 'massa', 'tonificazione', 'performance', 'benessere']);
export const trainerVisbody = trainerById;
export const durataVisbody = DURATA;

/* Tutti gli slot teorici di un trainer in una data */
function slotTeorici(trainer, data) {
  const fasce = trainer.turni[String(giornoSettimana(data))] || [];
  const out = [];
  for (const [inizio, fine] of fasce) {
    for (let m = toMin(inizio); m + DURATA <= toMin(fine); m += DURATA) out.push(toHHMM(m));
  }
  return out;
}

function dataPrenotabile(data) {
  const { data: oggi } = oraItaliana();
  return data >= oggi && data <= aggiungiGiorni(oggi, cfg.giorniPrenotabili);
}

/* Slot con stato libero/occupato */
function disponibilita(trainer, data) {
  if (!dataPrenotabile(data)) return [];
  const { data: oggi, minuti } = oraItaliana();
  const occupati = new Set(
    db.prepare(`SELECT ora FROM prenotazioni_visbody WHERE trainer_id = ? AND data = ? AND stato = 'confermata'`)
      .all(trainer.id, data).map((r) => r.ora)
  );
  return slotTeorici(trainer, data).map((ora) => ({
    ora,
    libero: !occupati.has(ora) && !(data === oggi && toMin(ora) < minuti + cfg.preavvisoMinimoMin),
  }));
}

const generaCodice = () => {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'VB-' + Array.from(crypto.randomBytes(6), (b) => alfabeto[b % alfabeto.length]).join('');
};
const pulisci = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const pubblico = ({ turni, ...t }) => ({ ...t, giorniLavoro: Object.keys(turni).map(Number) });

/* ---------- Router ---------- */
export const visbody = express.Router();
visbody.use(express.json({ limit: '20kb' }));

// Elenco trainer + regole di prenotazione
visbody.get('/trainer', (_req, res) => {
  res.json({
    durataVisitaMin: DURATA,
    giorniPrenotabili: cfg.giorniPrenotabili,
    oggi: oraItaliana().data,
    trainer: cfg.trainer.map(pubblico),
  });
});

// Calendario: per ogni giorno prenotabile quanti slot liberi ha il trainer
visbody.get('/trainer/:id/calendario', (req, res) => {
  const t = trainerById.get(req.params.id);
  if (!t) return res.status(404).json({ ok: false, errore: 'Trainer non trovato.' });
  const { data: oggi } = oraItaliana();
  const giorni = [];
  for (let i = 0; i <= cfg.giorniPrenotabili; i++) {
    const data = aggiungiGiorni(oggi, i);
    const slot = disponibilita(t, data);
    giorni.push({ data, totali: slot.length, liberi: slot.filter((s) => s.libero).length });
  }
  res.json({ ok: true, giorni });
});

// Slot di un giorno
visbody.get('/trainer/:id/slot', (req, res) => {
  const t = trainerById.get(req.params.id);
  const data = String(req.query.data || '');
  if (!t) return res.status(404).json({ ok: false, errore: 'Trainer non trovato.' });
  if (!isData(data)) return res.status(400).json({ ok: false, errore: 'Data non valida.' });
  res.json({ ok: true, data, slot: disponibilita(t, data) });
});

// Nuova prenotazione
visbody.post('/prenotazioni', (req, res) => {
  const b = req.body ?? {};
  const t = trainerById.get(pulisci(b.trainer, 40));
  const data = pulisci(b.data, 10);
  const ora = pulisci(b.ora, 5);
  const p = {
    nome: pulisci(b.nome, 80),
    cognome: pulisci(b.cognome, 80),
    email: pulisci(b.email, 160).toLowerCase(),
    telefono: pulisci(b.telefono, 40),
    iscritto: b.iscritto === true || b.iscritto === 'si' ? 1 : 0,
    obiettivo: pulisci(b.obiettivo, 30),
    note: pulisci(b.note, 1000),
  };
  const errore = (msg, code = 400) => res.status(code).json({ ok: false, errore: msg });

  if (!t) return errore('Scegli un trainer.');
  if (!isData(data) || !dataPrenotabile(data)) return errore('La data scelta non è prenotabile.');
  if (!p.nome || !p.cognome) return errore('Inserisci nome e cognome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return errore('Inserisci un indirizzo email valido.');
  if (p.telefono.replace(/\D/g, '').length < 8) return errore('Inserisci un numero di telefono valido.');
  if (p.obiettivo && !OBIETTIVI.has(p.obiettivo)) return errore('Obiettivo non valido.');
  if (b.privacy !== true) return errore('Devi accettare il trattamento dei dati personali.');

  const slot = disponibilita(t, data).find((s) => s.ora === ora);
  if (!slot) return errore('Orario non valido per questo trainer.');
  if (!slot.libero) return errore('Questo orario è appena stato prenotato. Scegline un altro.', 409);

  const codice = generaCodice();
  try {
    db.prepare(
      `INSERT INTO prenotazioni_visbody (codice, trainer_id, data, ora, nome, cognome, email, telefono, iscritto, obiettivo, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(codice, t.id, data, ora, p.nome, p.cognome, p.email, p.telefono, p.iscritto, p.obiettivo || null, p.note || null);
  } catch (err) {
    // L'indice univoco blocca due prenotazioni contemporanee sullo stesso slot
    if (String(err.message).includes('UNIQUE')) return errore('Questo orario è appena stato prenotato. Scegline un altro.', 409);
    throw err;
  }
  res.status(201).json({
    ok: true,
    prenotazione: { codice, data, ora, durataMin: DURATA, trainer: { id: t.id, nome: t.nome, cognome: t.cognome, foto: t.foto } },
  });
});

// Annullamento con codice + email
visbody.post('/prenotazioni/annulla', (req, res) => {
  const codice = pulisci(req.body?.codice, 12).toUpperCase();
  const email = pulisci(req.body?.email, 160).toLowerCase();
  const r = db.prepare(
    `UPDATE prenotazioni_visbody SET stato = 'annullata', annullato_il = datetime('now')
     WHERE codice = ? AND email = ? AND stato = 'confermata'`
  ).run(codice, email);
  if (!r.changes) return res.status(404).json({ ok: false, errore: 'Nessuna prenotazione attiva con questo codice ed email.' });
  res.json({ ok: true });
});

// Agenda per lo staff (protetta da token): /api/visbody/prenotazioni?token=...&da=YYYY-MM-DD
visbody.get('/prenotazioni', (req, res) => {
  if (!config.adminToken || req.query.token !== config.adminToken) return res.status(401).json({ ok: false });
  const da = isData(String(req.query.da || '')) ? req.query.da : oraItaliana().data;
  res.json(db.prepare(`SELECT * FROM prenotazioni_visbody WHERE data >= ? ORDER BY data, ora`).all(da));
});
