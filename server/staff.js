/*
 * API dell'app dello staff (/api/staff): impegni, cambi turno, schede (trainer), chiamate (consulenti), attività (reception).
 * Ogni rotta controlla il ruolo; i dati personali sono sempre filtrati sull'utente della sessione.
 */
import express from 'express';
import { db } from './db.js';
import { richiediLogin } from './auth.js';
import { oraItaliana, toHHMM, toMin, isData, aggiungiGiorni } from './tempo.js';
import { viste } from './area.js';

export const staff = express.Router();
staff.use(richiediLogin);
staff.use((req, res, next) => (req.utente.ruolo !== 'cliente' ? next() : res.status(403).json({ ok: false, errore: 'Sezione riservata allo staff.' })));
staff.use(express.json({ limit: '64kb' }));
staff.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
// Le modifiche accettano solo JSON (insieme al cookie SameSite blocca richieste da altri siti); GET e DELETE non hanno corpo
staff.use((req, res, next) => (req.method === 'GET' || req.method === 'DELETE' || req.is('application/json') ? next() : res.status(415).json({ ok: false, errore: 'Formato non supportato.' })));

const solo = (...ruoli) => (req, res, next) => (ruoli.includes(req.utente.ruolo) ? next() : res.status(403).json({ ok: false, errore: 'Operazione non consentita per il tuo ruolo.' }));
const testo = (v, max) => { const s = String(v ?? '').trim().slice(0, max); return s || null; };
const isOra = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const errore = (res, msg, code = 400) => res.status(code).json({ ok: false, errore: msg });
const ora = () => { const { data, minuti } = oraItaliana(); return { oggi: data, adesso: toHHMM(minuti) }; };

// Ruoli che hanno turni e possono scambiarseli (solo con colleghi dello stesso ruolo)
const RUOLI_TURNI = new Set(['receptionist', 'trainer']);
const nome = (r) => (r ? `${r.nome} ${r.cognome}` : null);

/* ---------- Riepilogo per l'app ---------- */
function impegniDi(utenteId, oggi) {
  return db.prepare(`SELECT id, titolo, data, inizio, fine, luogo, note FROM impegni WHERE utente_id = ? AND data >= ? ORDER BY data, inizio`)
    .all(utenteId, oggi);
}

function turniERichieste(u, oggi) {
  if (!RUOLI_TURNI.has(u.ruolo)) return null;
  const fine = aggiungiGiorni(oggi, 20);
  const miei = db.prepare(`SELECT id, data, inizio, fine, area, note FROM turni WHERE utente_id = ? AND data BETWEEN ? AND ? ORDER BY data, inizio`)
    .all(u.id, oggi, fine);
  const colleghi = db.prepare(`SELECT id, nome, cognome FROM utenti WHERE ruolo = ? AND attivo = 1 AND id != ? ORDER BY nome`).all(u.ruolo, u.id)
    .map((c) => ({ id: c.id, nome: nome(c) }));
  const sqlRich = `
    SELECT c.*, r.nome AS r_nome, r.cognome AS r_cognome, k.nome AS k_nome, k.cognome AS k_cognome,
           t.data AS t_data, t.inizio AS t_inizio, t.fine AS t_fine, t.area AS t_area,
           tc.data AS tc_data, tc.inizio AS tc_inizio, tc.fine AS tc_fine
      FROM cambi_turno c
      JOIN utenti r ON r.id = c.richiedente_id JOIN utenti k ON k.id = c.collega_id
      JOIN turni t ON t.id = c.turno_id LEFT JOIN turni tc ON tc.id = c.turno_collega_id`;
  const forma = (c) => ({
    id: c.id, tipo: c.tipo, stato: c.stato, messaggio: c.messaggio, risposta: c.risposta, creato_il: c.creato_il,
    richiedente: `${c.r_nome} ${c.r_cognome}`, collega: `${c.k_nome} ${c.k_cognome}`,
    turno: { data: c.t_data, inizio: c.t_inizio, fine: c.t_fine, area: c.t_area },
    turnoCollega: c.turno_collega_id ? { data: c.tc_data, inizio: c.tc_inizio, fine: c.tc_fine } : null,
  });
  // Ricevute: in attesa + quelle chiuse da poco; inviate: tutte le recenti
  const ricevute = db.prepare(`${sqlRich} WHERE c.collega_id = ? AND (c.stato = 'in-attesa' OR c.risposto_il >= datetime('now', '-7 days')) ORDER BY c.stato != 'in-attesa', c.creato_il DESC`).all(u.id).map(forma);
  const inviate = db.prepare(`${sqlRich} WHERE c.richiedente_id = ? AND (c.stato = 'in-attesa' OR c.risposto_il >= datetime('now', '-7 days') OR c.creato_il >= datetime('now', '-7 days')) ORDER BY c.creato_il DESC`).all(u.id).map(forma);
  // Turni già coinvolti in una richiesta in attesa: non si possono richiedere due volte
  const bloccati = db.prepare(`SELECT turno_id AS id FROM cambi_turno WHERE stato = 'in-attesa' UNION SELECT turno_collega_id FROM cambi_turno WHERE stato = 'in-attesa' AND turno_collega_id IS NOT NULL`).all().map((r) => r.id);
  return { miei, colleghi, ricevute, inviate, bloccati };
}

staff.get('/', (req, res) => {
  const u = req.utente;
  const { oggi, adesso } = ora();
  res.json({
    ok: true, oggi, adesso,
    utente: { nome: u.nome, cognome: u.cognome, ruolo: u.ruolo },
    ...viste[u.ruolo](u, oggi, adesso),
    impegni: impegniDi(u.id, oggi),
    turni: turniERichieste(u, oggi),
  });
});

/* ---------- Impegni (tutto lo staff) ---------- */
function leggiImpegno(b, oggi) {
  const v = {
    titolo: testo(b?.titolo, 120), data: String(b?.data ?? ''), inizio: String(b?.inizio ?? ''), fine: String(b?.fine ?? ''),
    luogo: testo(b?.luogo, 120), note: testo(b?.note, 1000),
  };
  if (!v.titolo) return { err: 'Scrivi di cosa si tratta.' };
  if (!isData(v.data)) return { err: 'Data non valida.' };
  if (v.data < oggi) return { err: 'La data è già passata.' };
  if (!isOra(v.inizio) || !isOra(v.fine)) return { err: 'Orari non validi.' };
  if (toMin(v.fine) <= toMin(v.inizio)) return { err: "L'ora di fine deve essere dopo l'inizio." };
  return { v };
}

staff.post('/impegni', (req, res) => {
  const { oggi } = ora();
  const { v, err } = leggiImpegno(req.body, oggi);
  if (err) return errore(res, err);
  const id = db.prepare(`INSERT INTO impegni (utente_id, titolo, data, inizio, fine, luogo, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.utente.id, v.titolo, v.data, v.inizio, v.fine, v.luogo, v.note).lastInsertRowid;
  res.json({ ok: true, id: Number(id) });
});

staff.delete('/impegni/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM impegni WHERE id = ? AND utente_id = ?`).run(Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});

/* ---------- Cambi turno (reception e trainer) ---------- */
const turnoDi = (id, utenteId) => db.prepare(`SELECT * FROM turni WHERE id = ? AND utente_id = ?`).get(id, utenteId);
const iniziato = (t, oggi, adesso) => t.data < oggi || (t.data === oggi && t.inizio <= adesso);
const sovrapposto = (utenteId, t, escludiId) => !!db.prepare(
  `SELECT 1 FROM turni WHERE utente_id = ? AND data = ? AND id != ? AND inizio < ? AND fine > ?`
).get(utenteId, t.data, escludiId ?? -1, t.fine, t.inizio);
const inAttesa = (turnoId) => !!db.prepare(
  `SELECT 1 FROM cambi_turno WHERE stato = 'in-attesa' AND (turno_id = ? OR turno_collega_id = ?)`
).get(turnoId, turnoId);

// Turni futuri di un collega (per scegliere con quale scambiare)
staff.get('/colleghi/:id/turni', solo(...RUOLI_TURNI), (req, res) => {
  const c = db.prepare(`SELECT id FROM utenti WHERE id = ? AND ruolo = ? AND attivo = 1 AND id != ?`).get(Number(req.params.id), req.utente.ruolo, req.utente.id);
  if (!c) return errore(res, 'Collega non trovato.', 404);
  const { oggi } = ora();
  const turni = db.prepare(`SELECT id, data, inizio, fine, area, note FROM turni WHERE utente_id = ? AND data BETWEEN ? AND ? ORDER BY data, inizio`)
    .all(c.id, oggi, aggiungiGiorni(oggi, 20));
  res.json({ ok: true, turni });
});

staff.post('/cambi-turno', solo(...RUOLI_TURNI), (req, res) => {
  const u = req.utente;
  const { oggi, adesso } = ora();
  const b = req.body ?? {};
  const tipo = b.tipo === 'scambio' ? 'scambio' : b.tipo === 'copertura' ? 'copertura' : null;
  if (!tipo) return errore(res, 'Scegli se vuoi uno scambio o una copertura.');
  const mio = turnoDi(Number(b.turno_id), u.id);
  if (!mio) return errore(res, 'Turno non trovato.', 404);
  if (iniziato(mio, oggi, adesso)) return errore(res, 'Questo turno è già iniziato o passato.');
  if (inAttesa(mio.id)) return errore(res, "C'è già una richiesta in attesa per questo turno.");
  const collega = db.prepare(`SELECT id FROM utenti WHERE id = ? AND ruolo = ? AND attivo = 1 AND id != ?`).get(Number(b.collega_id), u.ruolo, u.id);
  if (!collega) return errore(res, 'Scegli un collega con il tuo stesso ruolo.');

  let suo = null;
  if (tipo === 'scambio') {
    suo = turnoDi(Number(b.turno_collega_id), collega.id);
    if (!suo) return errore(res, 'Scegli il turno del collega con cui scambiare.');
    if (iniziato(suo, oggi, adesso)) return errore(res, 'Il turno del collega è già iniziato o passato.');
    if (inAttesa(suo.id)) return errore(res, "C'è già una richiesta in attesa per il turno del collega.");
  }
  // Controllo anticipato: dopo il cambio nessuno deve trovarsi con due turni sovrapposti
  if (sovrapposto(collega.id, mio, suo?.id)) return errore(res, 'Il collega ha già un turno in quell\'orario.');
  if (suo && sovrapposto(u.id, suo, mio.id)) return errore(res, 'Hai già un turno nell\'orario del collega.');

  const id = db.prepare(
    `INSERT INTO cambi_turno (tipo, richiedente_id, turno_id, collega_id, turno_collega_id, messaggio) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(tipo, u.id, mio.id, collega.id, suo?.id ?? null, testo(b.messaggio, 500)).lastInsertRowid;
  res.json({ ok: true, id: Number(id) });
});

// Il collega risponde: accetta (i turni cambiano subito) o rifiuta
staff.post('/cambi-turno/:id/risposta', solo(...RUOLI_TURNI), (req, res) => {
  const u = req.utente;
  const c = db.prepare(`SELECT * FROM cambi_turno WHERE id = ? AND collega_id = ? AND stato = 'in-attesa'`).get(Number(req.params.id), u.id);
  if (!c) return errore(res, 'Richiesta non trovata o già gestita.', 404);
  const accetta = req.body?.accetta === true;
  const risposta = testo(req.body?.risposta, 500);

  if (!accetta) {
    db.prepare(`UPDATE cambi_turno SET stato = 'rifiutata', risposta = ?, risposto_il = datetime('now') WHERE id = ?`).run(risposta, c.id);
    return res.json({ ok: true, stato: 'rifiutata' });
  }

  const { oggi, adesso } = ora();
  db.exec('BEGIN');
  try {
    // Ricontrolla tutto: nel frattempo i turni potrebbero essere cambiati
    const mio = turnoDi(c.turno_id, c.richiedente_id);
    const suo = c.turno_collega_id ? turnoDi(c.turno_collega_id, u.id) : null;
    const nonValida = (msg) => { db.exec('ROLLBACK'); return errore(res, msg, 409); };
    if (!mio || (c.tipo === 'scambio' && !suo)) return nonValida('Uno dei turni non esiste più: la richiesta non è più valida.');
    if (iniziato(mio, oggi, adesso) || (suo && iniziato(suo, oggi, adesso))) return nonValida('Il turno è già iniziato: non si può più cambiare.');
    if (sovrapposto(u.id, mio, suo?.id)) return nonValida('Hai già un turno in quell\'orario.');
    if (suo && sovrapposto(c.richiedente_id, suo, mio.id)) return nonValida('Il collega ha già un turno nell\'orario del tuo.');

    db.prepare(`UPDATE turni SET utente_id = ? WHERE id = ?`).run(u.id, mio.id);
    if (suo) db.prepare(`UPDATE turni SET utente_id = ? WHERE id = ?`).run(c.richiedente_id, suo.id);
    db.prepare(`UPDATE cambi_turno SET stato = 'accettata', risposta = ?, risposto_il = datetime('now') WHERE id = ?`).run(risposta, c.id);
    db.exec('COMMIT');
    res.json({ ok: true, stato: 'accettata' });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

staff.post('/cambi-turno/:id/annulla', solo(...RUOLI_TURNI), (req, res) => {
  const r = db.prepare(`UPDATE cambi_turno SET stato = 'annullata', risposto_il = datetime('now') WHERE id = ? AND richiedente_id = ? AND stato = 'in-attesa'`)
    .run(Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});

/* ---------- Attività (reception) ---------- */
const PRIORITA = new Set(['alta', 'media', 'bassa']);
staff.post('/attivita', solo('receptionist'), (req, res) => {
  const b = req.body ?? {};
  const titolo = testo(b.titolo, 160);
  if (!titolo) return errore(res, "Scrivi l'attività da fare.");
  const scadenza = b.scadenza ? String(b.scadenza) : null;
  if (scadenza && !isData(scadenza)) return errore(res, 'Scadenza non valida.');
  const priorita = PRIORITA.has(b.priorita) ? b.priorita : 'media';
  const id = db.prepare(`INSERT INTO attivita (utente_id, titolo, descrizione, scadenza, priorita) VALUES (?, ?, ?, ?, ?)`)
    .run(req.utente.id, titolo, testo(b.descrizione, 1000), scadenza, priorita).lastInsertRowid;
  res.json({ ok: true, id: Number(id) });
});

staff.post('/attivita/:id', solo('receptionist'), (req, res) => {
  const r = db.prepare(`UPDATE attivita SET completata_il = ${req.body?.completata ? "datetime('now')" : 'NULL'} WHERE id = ? AND utente_id = ?`)
    .run(Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});

staff.delete('/attivita/:id', solo('receptionist'), (req, res) => {
  const r = db.prepare(`DELETE FROM attivita WHERE id = ? AND utente_id = ?`).run(Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});

/* ---------- Chiamate (consulenti) ---------- */
const ESITI = new Set(['iscritto', 'appuntamento', 'interessato', 'richiamare', 'non-risponde', 'non-interessato']);
staff.post('/chiamate', solo('consulente'), (req, res) => {
  const b = req.body ?? {};
  const v = { nome: testo(b.cliente_nome, 120), tel: testo(b.telefono, 40), motivo: testo(b.motivo, 300), data: String(b.data ?? ''), ora: b.ora ? String(b.ora) : null };
  if (!v.nome) return errore(res, 'Scrivi il nome della persona da chiamare.');
  if (!v.tel || !/^[+\d][\d\s./-]{5,}$/.test(v.tel)) return errore(res, 'Numero di telefono non valido.');
  if (!v.motivo) return errore(res, 'Scrivi il motivo della chiamata.');
  if (!isData(v.data)) return errore(res, 'Data non valida.');
  if (v.ora && !isOra(v.ora)) return errore(res, 'Ora non valida.');
  const id = db.prepare(`INSERT INTO chiamate (consulente_id, cliente_nome, telefono, motivo, data, ora) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(req.utente.id, v.nome, v.tel, v.motivo, v.data, v.ora).lastInsertRowid;
  res.json({ ok: true, id: Number(id) });
});

// Esito e note della chiamata (esito vuoto = torna da fare)
staff.post('/chiamate/:id', solo('consulente'), (req, res) => {
  const esito = String(req.body?.esito ?? '');
  if (esito && !ESITI.has(esito)) return errore(res, 'Esito non valido.');
  const r = db.prepare(`UPDATE chiamate SET esito = ?, note = ?, completata_il = ${esito ? "COALESCE(completata_il, datetime('now'))" : 'NULL'} WHERE id = ? AND consulente_id = ?`)
    .run(esito || null, testo(req.body?.note, 1000), Number(req.params.id), req.utente.id);
  res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
});

/* ---------- Schede (trainer) ---------- */
staff.get('/clienti', solo('trainer'), (_req, res) => {
  const clienti = db.prepare(
    `SELECT u.id, u.nome, u.cognome, u.email,
            s.id AS scheda_id, s.titolo, s.inizio, s.fine, t.nome || ' ' || t.cognome AS trainer
       FROM utenti u
       LEFT JOIN schede s ON s.cliente_id = u.id AND s.attiva = 1
       LEFT JOIN utenti t ON t.id = s.trainer_id
      WHERE u.ruolo = 'cliente' AND u.attivo = 1
      ORDER BY u.cognome, u.nome`
  ).all();
  res.json({ ok: true, clienti });
});

staff.get('/clienti/:id/scheda', solo('trainer'), (req, res) => {
  const cliente = db.prepare(`SELECT id, nome, cognome FROM utenti WHERE id = ? AND ruolo = 'cliente'`).get(Number(req.params.id));
  if (!cliente) return errore(res, 'Cliente non trovato.', 404);
  const s = db.prepare(`SELECT id, titolo, obiettivo, inizio, fine, note FROM schede WHERE cliente_id = ? AND attiva = 1 ORDER BY inizio DESC LIMIT 1`).get(cliente.id);
  let scheda = null;
  if (s) {
    const ultimo = db.prepare(`SELECT data, peso_kg FROM registro_pesi WHERE esercizio_id = ? AND cliente_id = ? ORDER BY data DESC LIMIT 1`);
    scheda = {
      ...s,
      giorni: db.prepare(`SELECT id, nome FROM schede_giorni WHERE scheda_id = ? ORDER BY ordine`).all(s.id).map((g) => ({
        ...g,
        esercizi: db.prepare(`SELECT id, nome, serie, ripetizioni, recupero_sec AS recupero, note, con_peso AS conPeso FROM schede_esercizi WHERE giorno_id = ? ORDER BY ordine`)
          .all(g.id).map((e) => ({ ...e, conPeso: !!e.conPeso, ultimo: ultimo.get(e.id, cliente.id) || null })),
      })),
    };
  }
  res.json({ ok: true, cliente: { id: cliente.id, nome: nome(cliente) }, scheda });
});

function leggiScheda(b) {
  const s = {
    titolo: testo(b?.titolo, 120), obiettivo: testo(b?.obiettivo, 120), inizio: String(b?.inizio ?? ''),
    fine: b?.fine ? String(b.fine) : null, note: testo(b?.note, 2000),
  };
  if (!s.titolo) return { err: 'Dai un titolo alla scheda.' };
  if (!isData(s.inizio)) return { err: 'Data di inizio non valida.' };
  if (s.fine && (!isData(s.fine) || s.fine < s.inizio)) return { err: 'La data di fine deve essere dopo l\'inizio.' };
  const giorni = Array.isArray(b?.giorni) ? b.giorni : [];
  if (!giorni.length || giorni.length > 7) return { err: 'La scheda deve avere da 1 a 7 giorni.' };
  s.giorni = [];
  for (const [gi, g] of giorni.entries()) {
    const nomeG = testo(g?.nome, 80);
    if (!nomeG) return { err: `Dai un nome al giorno ${gi + 1}.` };
    const es = Array.isArray(g?.esercizi) ? g.esercizi : [];
    if (!es.length || es.length > 25) return { err: `Il giorno "${nomeG}" deve avere da 1 a 25 esercizi.` };
    const esercizi = [];
    for (const e of es) {
      const n = testo(e?.nome, 120);
      if (!n) return { err: `C'è un esercizio senza nome nel giorno "${nomeG}".` };
      const serie = Number(e?.serie);
      if (!Number.isInteger(serie) || serie < 1 || serie > 20) return { err: `Serie non valide per "${n}" (da 1 a 20).` };
      const rip = testo(e?.ripetizioni, 30);
      if (!rip) return { err: `Indica le ripetizioni per "${n}" (es. 10, 8-10, 30 sec).` };
      const rec = e?.recupero === '' || e?.recupero == null ? null : Number(e.recupero);
      if (rec != null && (!Number.isInteger(rec) || rec < 0 || rec > 900)) return { err: `Recupero non valido per "${n}" (secondi, da 0 a 900).` };
      esercizi.push({ id: Number(e?.id) || null, nome: n, serie, ripetizioni: rip, recupero: rec, note: testo(e?.note, 500), conPeso: e?.conPeso !== false });
    }
    s.giorni.push({ id: Number(g?.id) || null, nome: nomeG, esercizi });
  }
  return { s };
}

/*
 * Salva la scheda del cliente.
 * - nuova = true (o nessuna scheda attiva): archivia la scheda attuale e ne crea una nuova.
 * - altrimenti modifica quella attiva mantenendo gli id degli esercizi, così i pesi già segnati dal cliente restano collegati.
 */
staff.put('/clienti/:id/scheda', solo('trainer'), (req, res) => {
  const cliente = db.prepare(`SELECT id FROM utenti WHERE id = ? AND ruolo = 'cliente'`).get(Number(req.params.id));
  if (!cliente) return errore(res, 'Cliente non trovato.', 404);
  const { s, err } = leggiScheda(req.body);
  if (err) return errore(res, err);
  const attuale = db.prepare(`SELECT id FROM schede WHERE cliente_id = ? AND attiva = 1 ORDER BY inizio DESC LIMIT 1`).get(cliente.id);
  const nuova = req.body?.nuova === true || !attuale;

  db.exec('BEGIN');
  try {
    let schedaId;
    if (nuova) {
      db.prepare(`UPDATE schede SET attiva = 0 WHERE cliente_id = ? AND attiva = 1`).run(cliente.id);
      schedaId = Number(db.prepare(`INSERT INTO schede (cliente_id, trainer_id, titolo, obiettivo, inizio, fine, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(cliente.id, req.utente.id, s.titolo, s.obiettivo, s.inizio, s.fine, s.note).lastInsertRowid);
    } else {
      schedaId = attuale.id;
      db.prepare(`UPDATE schede SET trainer_id = ?, titolo = ?, obiettivo = ?, inizio = ?, fine = ?, note = ? WHERE id = ?`)
        .run(req.utente.id, s.titolo, s.obiettivo, s.inizio, s.fine, s.note, schedaId);
    }

    // id esistenti di questa scheda: solo questi si possono aggiornare (gli altri id inviati vengono ignorati)
    const giorniEsistenti = new Set(db.prepare(`SELECT id FROM schede_giorni WHERE scheda_id = ?`).all(schedaId).map((r) => r.id));
    const eserciziEsistenti = new Set(db.prepare(
      `SELECT e.id FROM schede_esercizi e JOIN schede_giorni g ON g.id = e.giorno_id WHERE g.scheda_id = ?`
    ).all(schedaId).map((r) => r.id));
    const giorniTenuti = new Set(), eserciziTenuti = new Set();

    s.giorni.forEach((g, gi) => {
      let giornoId = !nuova && giorniEsistenti.has(g.id) ? g.id : null;
      if (giornoId) db.prepare(`UPDATE schede_giorni SET ordine = ?, nome = ? WHERE id = ?`).run(gi + 1, g.nome, giornoId);
      else giornoId = Number(db.prepare(`INSERT INTO schede_giorni (scheda_id, ordine, nome) VALUES (?, ?, ?)`).run(schedaId, gi + 1, g.nome).lastInsertRowid);
      giorniTenuti.add(giornoId);
      g.esercizi.forEach((e, ei) => {
        const args = [giornoId, ei + 1, e.nome, e.serie, e.ripetizioni, e.recupero, e.note, e.conPeso ? 1 : 0];
        if (!nuova && eserciziEsistenti.has(e.id)) {
          db.prepare(`UPDATE schede_esercizi SET giorno_id = ?, ordine = ?, nome = ?, serie = ?, ripetizioni = ?, recupero_sec = ?, note = ?, con_peso = ? WHERE id = ?`).run(...args, e.id);
          eserciziTenuti.add(e.id);
        } else {
          db.prepare(`INSERT INTO schede_esercizi (giorno_id, ordine, nome, serie, ripetizioni, recupero_sec, note, con_peso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...args);
        }
      });
    });
    if (!nuova) {
      // Esercizi e giorni tolti dal trainer (i pesi collegati vengono cancellati con loro)
      for (const id of eserciziEsistenti) if (!eserciziTenuti.has(id)) db.prepare(`DELETE FROM schede_esercizi WHERE id = ?`).run(id);
      for (const id of giorniEsistenti) if (!giorniTenuti.has(id)) db.prepare(`DELETE FROM schede_giorni WHERE id = ?`).run(id);
    }
    db.exec('COMMIT');
    res.json({ ok: true, scheda_id: schedaId, nuova });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});
