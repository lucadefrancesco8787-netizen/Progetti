import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ROOT } from './config.js';
import { db } from './db.js';
import { richiediLogin } from './auth.js';
import { oraItaliana, aggiungiGiorni, aggiungiMinuti, toHHMM } from './tempo.js';
import { trainerVisbody, durataVisbody } from './visbody.js';

const corsi = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'corsi.json'), 'utf8')).corsi.map((c) => [c.id, c])
);
const GIORNI_AGENDA = 21;

const nomeCompleto = (u) => (u ? `${u.nome} ${u.cognome}` : null);
const nomeTrainerVisbody = (id) => nomeCompleto(trainerVisbody.get(id)) || 'Trainer';

// Un evento è "futuro" se non è ancora finito
function dividi(eventi, oggi, adesso) {
  const futuri = [], passati = [];
  for (const e of eventi) (e.data > oggi || (e.data === oggi && e.fine > adesso) ? futuri : passati).push(e);
  const ordina = (a, b) => (a.data + a.inizio).localeCompare(b.data + b.inizio);
  return { futuri: futuri.sort(ordina), passati: passati.sort(ordina).reverse() };
}

const visbodyDaRighe = (righe, conCliente) => righe.map((r) => ({
  tipo: 'visbody', id: `vb-${r.codice}`, data: r.data, inizio: r.ora, fine: aggiungiMinuti(r.ora, durataVisbody),
  titolo: 'Visbody · analisi corporea',
  con: conCliente ? `${r.nome} ${r.cognome}` : nomeTrainerVisbody(r.trainer_id),
  dettaglio: conCliente ? [r.obiettivo && `Obiettivo: ${r.obiettivo}`, r.iscritto ? 'Già iscritto' : 'Non ancora iscritto', r.note].filter(Boolean).join(' · ') : 'Arriva a digiuno da 2–3 ore, con abiti leggeri',
  telefono: conCliente ? r.telefono : null,
  codice: r.codice,
  luogo: 'Postazione Visbody',
}));

const TITOLI_APP = { 'visita-medica': 'Visita medica sportiva', consulenza: 'Consulenza', personal: 'Personal training' };
const appDaRighe = (righe, vista) => righe.map((r) => ({
  tipo: r.tipo, id: `app-${r.id}`, data: r.data, inizio: r.inizio, fine: r.fine,
  titolo: TITOLI_APP[r.tipo], stato: r.stato,
  con: vista === 'cliente' ? (r.staff_nome || r.staff) : (r.cliente || r.cliente_nome),
  telefono: vista === 'cliente' ? null : (r.cliente_tel || r.cliente_telefono),
  luogo: r.luogo, dettaglio: r.note,
}));

const SQL_APP = `
  SELECT a.*, s.nome || ' ' || s.cognome AS staff, c.nome || ' ' || c.cognome AS cliente, c.telefono AS cliente_tel
    FROM appuntamenti a
    LEFT JOIN utenti s ON s.id = a.staff_id
    LEFT JOIN utenti c ON c.id = a.cliente_id`;

// Appuntamenti del cliente (usata anche dall'app, server/app-cliente.js)
export function appuntamentiCliente(u, oggi, adesso) {
  const app = appDaRighe(db.prepare(`${SQL_APP} WHERE a.cliente_id = ? AND a.stato != 'annullato'`).all(u.id), 'cliente');
  const vb = visbodyDaRighe(db.prepare(`SELECT * FROM prenotazioni_visbody WHERE email = ? AND stato = 'confermata'`).all(u.email), false);
  const { futuri, passati } = dividi([...app, ...vb], oggi, adesso);
  return { appuntamenti: futuri, storico: passati.slice(0, 6) };
}

/* ---------- Dati per ruolo (usati anche dall'app dello staff, server/staff.js) ---------- */
export const viste = {
  cliente: appuntamentiCliente,

  receptionist(u, oggi) {
    const turni = db.prepare(`SELECT id, data, inizio, fine, area, note FROM turni WHERE utente_id = ? AND data BETWEEN ? AND ? ORDER BY data, inizio`)
      .all(u.id, oggi, aggiungiGiorni(oggi, 13));
    const attivita = db.prepare(
      `SELECT id, titolo, descrizione, scadenza, priorita, completata_il FROM attivita
        WHERE utente_id = ? AND (completata_il IS NULL OR completata_il >= datetime('now', '-2 days'))
        ORDER BY completata_il IS NOT NULL, CASE priorita WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, scadenza`
    ).all(u.id);
    const visbodyOggi = db.prepare(`SELECT COUNT(*) AS n FROM prenotazioni_visbody WHERE data = ? AND stato = 'confermata'`).get(oggi).n;
    return { turni, attivita, visbodyOggi };
  },

  consulente(u, oggi, adesso) {
    const chiamate = db.prepare(
      `SELECT id, cliente_nome, telefono, motivo, data, ora, esito, note, completata_il FROM chiamate
        WHERE consulente_id = ? AND (completata_il IS NULL OR completata_il >= datetime('now', '-2 days'))
        ORDER BY completata_il IS NOT NULL, data, ora`
    ).all(u.id);
    const consulenze = appDaRighe(
      db.prepare(`${SQL_APP} WHERE a.staff_id = ? AND a.tipo = 'consulenza' AND a.stato = 'confermato' AND a.data BETWEEN ? AND ?`)
        .all(u.id, oggi, aggiungiGiorni(oggi, GIORNI_AGENDA)), 'staff');
    return { chiamate, consulenze: dividi(consulenze, oggi, adesso).futuri };
  },

  trainer(u, oggi, adesso) {
    const fine = aggiungiGiorni(oggi, GIORNI_AGENDA);
    const sala = db.prepare(`SELECT * FROM turni WHERE utente_id = ? AND area = 'sala' AND data BETWEEN ? AND ?`).all(u.id, oggi, fine)
      .map((t) => ({ tipo: 'sala', id: `t-${t.id}`, data: t.data, inizio: t.inizio, fine: t.fine, titolo: 'Turno in sala pesi', dettaglio: t.note, luogo: 'Sala attrezzi' }));
    const personal = appDaRighe(
      db.prepare(`${SQL_APP} WHERE a.staff_id = ? AND a.tipo = 'personal' AND a.stato = 'confermato' AND a.data BETWEEN ? AND ?`).all(u.id, oggi, fine), 'staff');
    const vb = u.trainer_id
      ? visbodyDaRighe(db.prepare(`SELECT * FROM prenotazioni_visbody WHERE trainer_id = ? AND stato = 'confermata' AND data BETWEEN ? AND ?`).all(u.trainer_id, oggi, fine), true)
      : [];
    return { agenda: dividi([...sala, ...personal, ...vb], oggi, adesso).futuri };
  },

  istruttore(u, oggi, adesso) {
    const fine = aggiungiGiorni(oggi, GIORNI_AGENDA);
    const lezioni = db.prepare(
      `SELECT l.* FROM lezioni l JOIN lezioni_istruttori li ON li.lezione_id = l.id
        WHERE li.utente_id = ? AND l.data BETWEEN ? AND ?`
    ).all(u.id, oggi, fine);
    const coIstruttori = db.prepare(
      `SELECT u.nome || ' ' || u.cognome AS nome FROM lezioni_istruttori li JOIN utenti u ON u.id = li.utente_id
        WHERE li.lezione_id = ? AND li.utente_id != ? ORDER BY u.nome`
    );
    const agenda = lezioni.map((l) => ({
      tipo: 'lezione', id: `l-${l.id}`, data: l.data, inizio: l.inizio, fine: l.fine,
      titolo: corsi.get(l.corso_id)?.nome || l.corso_id, corso: l.corso_id, luogo: l.sala,
      insieme: coIstruttori.all(l.id, u.id).map((r) => r.nome),
    }));
    // Riepilogo dei corsi: tutti gli istruttori che li tengono nel periodo
    const corsiMiei = [...new Set(lezioni.map((l) => l.corso_id))].map((id) => {
      const staff = db.prepare(
        `SELECT DISTINCT u.nome || ' ' || u.cognome AS nome, u.id = ? AS io FROM lezioni l
           JOIN lezioni_istruttori li ON li.lezione_id = l.id JOIN utenti u ON u.id = li.utente_id
          WHERE l.corso_id = ? AND l.data BETWEEN ? AND ? ORDER BY io DESC, nome`
      ).all(u.id, id, oggi, fine);
      return {
        id, nome: corsi.get(id)?.nome || id, img: corsi.get(id)?.img,
        mie: lezioni.filter((l) => l.corso_id === id).length,
        istruttori: staff.map((s) => ({ nome: s.nome, io: !!s.io })),
      };
    });
    return { agenda: dividi(agenda, oggi, adesso).futuri, corsi: corsiMiei };
  },
};

/* ---------- Route /api/area ---------- */
export const area = express.Router();
area.use(richiediLogin);
area.use(express.json({ limit: '10kb' }));

// Le modifiche accettano solo JSON: insieme al cookie SameSite=Lax blocca richieste da altri siti
const soloJson = (req, res, next) => (req.is('application/json') ? next() : res.status(415).json({ ok: false, errore: 'Formato non supportato.' }));

area.get('/', (req, res) => {
  const u = req.utente;
  const { data: oggi, minuti } = oraItaliana();
  const adesso = toHHMM(minuti);
  // Impegni aggiunti dallo staff dall'app (riunioni, formazione…): compaiono anche qui
  const impegni = u.ruolo === 'cliente' ? undefined : db.prepare(
    `SELECT id, titolo, data, inizio, fine, luogo, note FROM impegni WHERE utente_id = ? AND data BETWEEN ? AND ? ORDER BY data, inizio`
  ).all(u.id, oggi, aggiungiGiorni(oggi, GIORNI_AGENDA)).filter((i) => i.data > oggi || i.fine > adesso);
  res.json({ ok: true, oggi, adesso, utente: { nome: u.nome, cognome: u.cognome, ruolo: u.ruolo }, ...viste[u.ruolo](u, oggi, adesso), impegni });
});

area.post('/attivita/:id', soloJson, (req, res) => {
  if (req.utente.ruolo !== 'receptionist') return res.status(403).json({ ok: false });
  const r = db.prepare(`UPDATE attivita SET completata_il = ${req.body?.completata ? "datetime('now')" : 'NULL'} WHERE id = ? AND utente_id = ?`)
    .run(Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});

const ESITI = new Set(['iscritto', 'appuntamento', 'interessato', 'richiamare', 'non-risponde', 'non-interessato']);
area.post('/chiamate/:id', soloJson, (req, res) => {
  if (req.utente.ruolo !== 'consulente') return res.status(403).json({ ok: false });
  const esito = String(req.body?.esito || '');
  if (esito && !ESITI.has(esito)) return res.status(400).json({ ok: false, errore: 'Esito non valido.' });
  const r = db.prepare(`UPDATE chiamate SET esito = ?, completata_il = ${esito ? "datetime('now')" : 'NULL'} WHERE id = ? AND consulente_id = ?`)
    .run(esito || null, Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});
