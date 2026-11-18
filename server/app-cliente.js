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
      esercizi: esercizi.all(g.id).map((e) => {
        const pOggi = pesoOggi.get(e.id, clienteId, oggi)?.peso_kg ?? null;
        const u = ultimo.get(e.id, clienteId, oggi) || null;
        const n = numSerie(e.serie);
        return {
          ...e,
          conPeso: !!e.conPeso,
          oggi: pOggi,
          ultimo: u,
          // Peso di ogni serie (null = non segnata): oggi e nell'ultima seduta, per i suggerimenti
          oggiSerie: pesiSerie(e.id, clienteId, oggi, n, pOggi),
          ultimoSerie: u ? pesiSerie(e.id, clienteId, u.data, n, u.peso_kg) : null,
        };
      }),
    })),
  };
}

/* ---------- Pesi per serie ---------- */
const MAX_SERIE = 20;
const numSerie = (n) => Math.min(Math.max(Number(n) || 1, 1), MAX_SERIE);

// Pesi delle serie di un giorno, lunghi quanto le serie dell'esercizio.
// I giorni segnati prima dei pesi per serie hanno solo registro_pesi: lo stesso peso su tutte le serie.
function pesiSerie(esId, clienteId, data, n, pesoGiorno) {
  const righe = db.prepare(`SELECT serie, peso_kg FROM registro_serie WHERE esercizio_id = ? AND cliente_id = ? AND data = ?`)
    .all(esId, clienteId, data);
  if (!righe.length) return Array(n).fill(pesoGiorno ?? null);
  const pesi = Array(n).fill(null);
  for (const r of righe) if (r.serie <= n) pesi[r.serie - 1] = r.peso_kg;
  return pesi;
}

// Riscrive tutte le serie di un giorno e aggiorna registro_pesi (peso più alto), in un'unica transazione.
function salvaSerie(esId, clienteId, data, pesi) {
  const segnati = pesi.filter((p) => p != null);
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM registro_serie WHERE esercizio_id = ? AND cliente_id = ? AND data = ?`).run(esId, clienteId, data);
    const ins = db.prepare(`INSERT INTO registro_serie (esercizio_id, cliente_id, data, serie, peso_kg) VALUES (?, ?, ?, ?, ?)`);
    pesi.forEach((p, i) => { if (p != null) ins.run(esId, clienteId, data, i + 1, p); });
    if (segnati.length) {
      db.prepare(
        `INSERT INTO registro_pesi (esercizio_id, cliente_id, data, peso_kg) VALUES (?, ?, ?, ?)
         ON CONFLICT (esercizio_id, cliente_id, data) DO UPDATE SET peso_kg = excluded.peso_kg, aggiornato_il = datetime('now')`
      ).run(esId, clienteId, data, Math.max(...segnati));
    } else {
      db.prepare(`DELETE FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? AND data = ?`).run(esId, clienteId, data);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return segnati.length ? Math.max(...segnati) : null;
}

// 40.5 o "40,5" → 40.5; null, undefined, "" o solo spazi → null;
// tutto il resto (spazi in mezzo, booleani, "1e3", fuori da 0–1000…) → undefined (errore 400)
function leggiPeso(grezzo) {
  if (grezzo === null || grezzo === undefined) return null;
  let n;
  if (typeof grezzo === 'number') n = grezzo;
  else if (typeof grezzo === 'string') {
    if (grezzo.trim() === '') return null;
    if (!/^\s*\d+([.,]\d+)?\s*$/.test(grezzo)) return undefined;
    n = Number(grezzo.trim().replace(',', '.'));
  } else return undefined;
  const kg = Math.round(n * 100) / 100;
  return Number.isFinite(kg) && kg >= 0 && kg <= 1000 ? kg : undefined;
}

// Data della richiesta (default oggi, mai nel futuro); null se non valida
function dataRichiesta(req) {
  const { data: oggi } = oraItaliana();
  const data = req.body?.data ?? oggi;
  return isData(data) && data <= oggi ? data : null;
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
  `SELECT e.id, e.con_peso, e.serie FROM schede_esercizi e
     JOIN schede_giorni g ON g.id = e.giorno_id
     JOIN schede s ON s.id = g.scheda_id
    WHERE e.id = ? AND s.cliente_id = ?`
);

appCliente.get('/', (req, res) => {
  const u = req.utente;
  const { data: oggi, minuti } = oraItaliana();
  const { appuntamenti } = appuntamentiCliente(u, oggi, toHHMM(minuti));
  res.json({ ok: true, oggi, utente: { id: u.id, nome: u.nome, cognome: u.cognome }, appuntamenti, scheda: schedaAttiva(u.id, oggi), visite: visite(u.id) });
});

// Storico dei pesi di un esercizio (per il grafico dei progressi)
appCliente.get('/esercizi/:id/storico', (req, res) => {
  const es = esercizioDelCliente.get(Number(req.params.id), req.utente.id);
  if (!es) return res.status(404).json({ ok: false });
  const storico = db.prepare(`SELECT data, peso_kg AS kg FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? ORDER BY data DESC LIMIT 20`)
    .all(es.id, req.utente.id).reverse();
  res.json({ ok: true, storico });
});

// Esercizio con peso della scheda del cliente, oppure risponde con l'errore e restituisce null
function esercizioConPeso(req, res) {
  const es = esercizioDelCliente.get(Number(req.params.id), req.utente.id);
  if (!es) { res.status(404).json({ ok: false, errore: 'Esercizio non trovato.' }); return null; }
  if (!es.con_peso) { res.status(400).json({ ok: false, errore: 'Questo esercizio non prevede un peso.' }); return null; }
  return es;
}

// Segna (o corregge) i pesi di oggi serie per serie: { pesi: [40, 42.5, null] }.
// La lista intera sostituisce quella salvata; serie vuote = non segnate; tutte vuote = cancella.
appCliente.put('/esercizi/:id/serie', soloJson, (req, res) => {
  const es = esercizioConPeso(req, res);
  if (!es) return;
  const data = dataRichiesta(req);
  if (!data) return res.status(400).json({ ok: false, errore: 'Data non valida.' });

  const grezzi = req.body?.pesi;
  const n = numSerie(es.serie);
  if (!Array.isArray(grezzi)) return res.status(400).json({ ok: false, errore: 'Formato dei pesi non valido.' });
  if (grezzi.length > n) return res.status(400).json({ ok: false, errore: `Questo esercizio ha ${n} serie.` });
  const pesi = Array.from({ length: n }, (_, i) => leggiPeso(grezzi[i]));
  if (pesi.includes(undefined)) return res.status(400).json({ ok: false, errore: 'Inserisci un peso tra 0 e 1000 kg.' });

  const peso_kg = salvaSerie(es.id, req.utente.id, data, pesi);
  res.json({ ok: true, pesi, peso_kg, data });
});

// Vecchio formato (un solo peso per esercizio): lo stesso peso su tutte le serie. peso_kg null = cancella
appCliente.put('/esercizi/:id/peso', soloJson, (req, res) => {
  const es = esercizioConPeso(req, res);
  if (!es) return;
  const data = dataRichiesta(req);
  if (!data) return res.status(400).json({ ok: false, errore: 'Data non valida.' });

  const kg = leggiPeso(req.body?.peso_kg);
  if (kg === undefined) return res.status(400).json({ ok: false, errore: 'Inserisci un peso tra 0 e 1000 kg.' });
  const peso_kg = salvaSerie(es.id, req.utente.id, data, Array(numSerie(es.serie)).fill(kg));
  res.json({ ok: true, peso_kg, data });
});
