/*
 * API dell'app del cliente (/api/app): appuntamenti, scheda di allenamento con i pesi, ultima visita.
 * Riservata al ruolo "cliente": ogni query è filtrata sull'utente della sessione.
 */
import express from 'express';
import { db } from './db.js';
import { richiediLogin } from './auth.js';
import { oraItaliana, toHHMM, isData } from './tempo.js';
import { appuntamentiCliente } from './area.js';

export const appCliente = express.Router();
appCliente.use(richiediLogin);
appCliente.use((req, res, next) =>
  req.utente.ruolo === 'cliente' ? next() : res.status(403).json({ ok: false, errore: "L'app è riservata ai clienti del club." }));
appCliente.use(express.json({ limit: '10kb' }));
// Dati personali: mai in cache condivise
appCliente.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });

const soloJson = (req, res, next) => (req.is('application/json') ? next() : res.status(415).json({ ok: false, errore: 'Formato non supportato.' }));

function schedaAttiva(clienteId, oggi) {
  const s = db.prepare(
    `SELECT s.id, s.titolo, s.obiettivo, s.inizio, s.fine, s.note, t.nome || ' ' || t.cognome AS trainer
       FROM schede s LEFT JOIN utenti t ON t.id = s.trainer_id
      WHERE s.cliente_id = ? AND s.attiva = 1 ORDER BY s.inizio DESC LIMIT 1`
  ).get(clienteId);
  if (!s) return null;

  const giorni = db.prepare(`SELECT id, nome FROM schede_giorni WHERE scheda_id = ? ORDER BY ordine`).all(s.id);
  const esercizi = db.prepare(
    `SELECT id, nome, serie, ripetizioni, recupero_sec AS recupero, note, con_peso AS conPeso
       FROM schede_esercizi WHERE giorno_id = ? ORDER BY ordine`
  );
  // Peso di oggi (se già segnato) e ultimo peso usato prima di oggi
  const pesoOggi = db.prepare(`SELECT peso_kg FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? AND data = ?`);
  const ultimo = db.prepare(
    `SELECT data, peso_kg FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? AND data < ? ORDER BY data DESC LIMIT 1`
  );
  const ultimaSeduta = db.prepare(
    `SELECT MAX(r.data) AS data FROM registro_pesi r JOIN schede_esercizi e ON e.id = r.esercizio_id
      WHERE e.giorno_id = ? AND r.cliente_id = ?`
  );

  return {
    ...s,
    giorni: giorni.map((g) => ({
      ...g,
      ultimaSeduta: ultimaSeduta.get(g.id, clienteId)?.data || null,
      esercizi: esercizi.all(g.id).map((e) => ({
        ...e,
        conPeso: !!e.conPeso,
        oggi: pesoOggi.get(e.id, clienteId, oggi)?.peso_kg ?? null,
        ultimo: ultimo.get(e.id, clienteId, oggi) || null,
      })),
    })),
  };
}

function visite(clienteId) {
  const righe = db.prepare(
    `SELECT v.*, t.nome || ' ' || t.cognome AS trainer FROM visite v LEFT JOIN utenti t ON t.id = v.trainer_id
      WHERE v.cliente_id = ? ORDER BY v.data DESC LIMIT 2`
  ).all(clienteId);
  const pulisci = (v) => v && ({
    data: v.data, tipo: v.tipo, trainer: v.trainer, note: v.note,
    valori: {
      peso: v.peso_kg, grasso: v.grasso_pct, muscolo: v.massa_muscolare_kg, acqua: v.acqua_pct,
      viscerale: v.grasso_viscerale, metabolismo: v.metabolismo_kcal, etaMetabolica: v.eta_metabolica,
      vita: v.vita_cm, fianchi: v.fianchi_cm,
      bmi: v.peso_kg && v.altezza_cm ? Math.round((v.peso_kg / (v.altezza_cm / 100) ** 2) * 10) / 10 : null,
    },
  });
  return { ultima: pulisci(righe[0]) || null, precedente: pulisci(righe[1]) || null };
}

// Esercizio di una scheda del cliente (impedisce di scrivere su schede altrui).
// Preparata al primo uso: all'import le migrazioni potrebbero non essere ancora state applicate.
let _esCliente;
const esercizioDelCliente = { get: (...a) => (_esCliente ??= db.prepare(SQL_ES_CLIENTE)).get(...a) };
const SQL_ES_CLIENTE = (
  `SELECT e.id, e.con_peso FROM schede_esercizi e
     JOIN schede_giorni g ON g.id = e.giorno_id
     JOIN schede s ON s.id = g.scheda_id
    WHERE e.id = ? AND s.cliente_id = ?`
);

appCliente.get('/', (req, res) => {
  const u = req.utente;
  const { data: oggi, minuti } = oraItaliana();
  const { appuntamenti } = appuntamentiCliente(u, oggi, toHHMM(minuti));
  res.json({ ok: true, oggi, utente: { nome: u.nome, cognome: u.cognome }, appuntamenti, scheda: schedaAttiva(u.id, oggi), visite: visite(u.id) });
});

// Storico dei pesi di un esercizio (per il grafico dei progressi)
appCliente.get('/esercizi/:id/storico', (req, res) => {
  const es = esercizioDelCliente.get(Number(req.params.id), req.utente.id);
  if (!es) return res.status(404).json({ ok: false });
  const storico = db.prepare(`SELECT data, peso_kg AS kg FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? ORDER BY data DESC LIMIT 20`)
    .all(es.id, req.utente.id).reverse();
  res.json({ ok: true, storico });
});

// Segna (o corregge) il peso di oggi per un esercizio. peso_kg null = cancella
appCliente.put('/esercizi/:id/peso', soloJson, (req, res) => {
  const es = esercizioDelCliente.get(Number(req.params.id), req.utente.id);
  if (!es) return res.status(404).json({ ok: false, errore: 'Esercizio non trovato.' });
  if (!es.con_peso) return res.status(400).json({ ok: false, errore: 'Questo esercizio non prevede un peso.' });

  const { data: oggi } = oraItaliana();
  const data = req.body?.data ?? oggi;
  if (!isData(data) || data > oggi) return res.status(400).json({ ok: false, errore: 'Data non valida.' });

  const grezzo = req.body?.peso_kg;
  if (grezzo === null || grezzo === '') {
    db.prepare(`DELETE FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? AND data = ?`).run(es.id, req.utente.id, data);
    return res.json({ ok: true, peso_kg: null });
  }
  const kg = Math.round(Number(String(grezzo).replace(',', '.')) * 100) / 100;
  if (!Number.isFinite(kg) || kg < 0 || kg > 1000) return res.status(400).json({ ok: false, errore: 'Inserisci un peso tra 0 e 1000 kg.' });

  db.prepare(
    `INSERT INTO registro_pesi (esercizio_id, cliente_id, data, peso_kg) VALUES (?, ?, ?, ?)
     ON CONFLICT (esercizio_id, cliente_id, data) DO UPDATE SET peso_kg = excluded.peso_kg, aggiornato_il = datetime('now')`
  ).run(es.id, req.utente.id, data, kg);
  res.json({ ok: true, peso_kg: kg, data });
});
