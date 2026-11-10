/*
 * Dati dimostrativi per l'area riservata: account di prova, turni, appuntamenti, chiamate, lezioni.
 * Tutto è marcato demo = 1, quindi si cancella con `npm run seed:reset` senza toccare i dati veri.
 * Le date sono calcolate a partire da oggi.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.js';
import { db, migrate } from './db.js';
import { hashPassword } from './auth.js';
import { oraItaliana, aggiungiGiorni, giornoSettimana, aggiungiMinuti } from './tempo.js';

export const ACCOUNT_DEMO = [
  { ruolo: 'cliente', email: 'cliente@demo.it', password: 'Cliente2026!', nome: 'Mario', cognome: 'Rossi', telefono: '333 111 2233' },
  { ruolo: 'receptionist', email: 'reception@demo.it', password: 'Reception2026!', nome: 'Anna', cognome: 'Vitale', telefono: '333 222 3344' },
  { ruolo: 'consulente', email: 'consulente@demo.it', password: 'Consulente2026!', nome: 'Paolo', cognome: 'Galli', telefono: '333 333 4455' },
  { ruolo: 'trainer', email: 'trainer@demo.it', password: 'Trainer2026!', nome: 'Marco', cognome: 'Esposito', telefono: '333 444 5566', trainer_id: 'marco' },
  { ruolo: 'istruttore', email: 'istruttore@demo.it', password: 'Istruttore2026!', nome: 'Chiara', cognome: 'Greco', telefono: '333 555 6677' },
];
// Secondi colleghi con password nota: servono per provare i cambi turno dall'altra parte
export const ACCOUNT_DEMO_COLLEGHI = [
  { ruolo: 'receptionist', email: 'reception2@demo.it', password: 'Reception2026!', nome: 'Sara', cognome: 'Coppola', telefono: '333 666 7788' },
  { ruolo: 'trainer', email: 'trainer2@demo.it', password: 'Trainer2026!', nome: 'Luca', cognome: 'Romano', telefono: '333 777 8899', trainer_id: 'luca' },
];
// Colleghi senza password nota: servono per mostrare le lezioni condivise
const COLLEGHI = [
  { ruolo: 'istruttore', email: 'elena.ricci@demo.it', nome: 'Elena', cognome: 'Ricci' },
  { ruolo: 'istruttore', email: 'valerio.marino@demo.it', nome: 'Valerio', cognome: 'Marino' },
  { ruolo: 'istruttore', email: 'giorgio.sannino@demo.it', nome: 'Giorgio', cognome: 'Sannino' },
];

const TABELLE_DEMO = ['cambi_turno', 'impegni', 'registro_pesi', 'visite', 'schede', 'lezioni', 'chiamate', 'attivita', 'turni', 'appuntamenti', 'prenotazioni_visbody', 'utenti'];

export function resetDemo() {
  db.exec('BEGIN');
  for (const t of TABELLE_DEMO) db.prepare(`DELETE FROM ${t} WHERE demo = 1`).run();
  db.exec('COMMIT');
}

export function seedDemo({ reset = false } = {}) {
  if (reset) resetDemo();
  if (db.prepare('SELECT COUNT(*) AS n FROM utenti WHERE demo = 1').get().n > 0) return seedApp() | seedStaff();

  const { data: oggi } = oraItaliana();
  const g = (n) => aggiungiGiorni(oggi, n);
  // Prossima data (da oggi + offset) che cade in uno dei giorni della settimana indicati
  const prossimo = (giorni, da = 0) => { for (let i = da; i < da + 14; i++) if (giorni.includes(giornoSettimana(g(i)))) return g(i); return g(da); };

  db.exec('BEGIN');
  try {
    /* Utenti */
    const insUtente = db.prepare(
      `INSERT INTO utenti (email, password_hash, nome, cognome, telefono, ruolo, trainer_id, demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const id = {};
    for (const a of ACCOUNT_DEMO) {
      id[a.ruolo] = Number(insUtente.run(a.email, hashPassword(a.password), a.nome, a.cognome, a.telefono, a.ruolo, a.trainer_id || null).lastInsertRowid);
    }
    for (const c of COLLEGHI) {
      id[c.nome.toLowerCase()] = Number(insUtente.run(c.email, hashPassword(crypto.randomBytes(18).toString('hex')), c.nome, c.cognome, null, c.ruolo, null).lastInsertRowid);
    }
    const mario = id.cliente, anna = id.receptionist, paolo = id.consulente, marco = id.trainer, chiara = id.istruttore;

    /* Appuntamenti del cliente Mario (compaiono anche nelle agende di consulente e trainer) */
    const insApp = db.prepare(
      `INSERT INTO appuntamenti (tipo, cliente_id, cliente_nome, cliente_telefono, staff_id, staff_nome, data, inizio, fine, luogo, note, stato, demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    insApp.run('visita-medica', mario, null, null, null, 'Dott.ssa Laura Bianchi, medico sportivo', g(3), '17:30', '18:00', 'Studio medico, piano terra', 'Porta un documento e, se li hai, gli esami del sangue recenti.', 'confermato');
    insApp.run('consulenza', mario, null, null, paolo, null, g(4), '18:30', '19:00', 'Ufficio consulenze', 'Scelta del nuovo abbonamento annuale.', 'confermato');
    insApp.run('personal', mario, null, null, marco, null, g(2), '19:00', '20:00', 'Sala attrezzi', 'Seduta 3 di 10 · focus parte bassa.', 'confermato');
    insApp.run('personal', mario, null, null, marco, null, g(6), '19:00', '20:00', 'Sala attrezzi', 'Seduta 4 di 10.', 'confermato');
    insApp.run('visita-medica', mario, null, null, null, 'Dott.ssa Laura Bianchi, medico sportivo', g(-60), '17:30', '18:00', 'Studio medico, piano terra', 'Certificato rilasciato.', 'svolto');
    insApp.run('consulenza', mario, null, null, paolo, null, g(-58), '18:00', '18:30', 'Ufficio consulenze', 'Iscrizione e prova gratuita.', 'svolto');

    /* Visbody: una prenotazione di Mario + altre per l'agenda del trainer Marco */
    const insVb = db.prepare(
      `INSERT INTO prenotazioni_visbody (codice, trainer_id, data, ora, nome, cognome, email, telefono, iscritto, obiettivo, note, demo)
       VALUES (?, 'marco', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const codice = () => 'VB-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    const giorniMarco = [1, 3, 5, 6];
    insVb.run(codice(), prossimo(giorniMarco, 1), '09:00', 'Mario', 'Rossi', 'cliente@demo.it', '333 111 2233', 1, 'massa', 'Controllo dopo 2 mesi di scheda.');
    insVb.run(codice(), prossimo(giorniMarco, 1), '10:30', 'Federica', 'Amato', 'federica@example.com', '347 555 0101', 0, 'dimagrimento', null);
    insVb.run(codice(), prossimo(giorniMarco, 3), '08:00', 'Salvatore', 'Iovine', 'salvo@example.com', '348 555 0202', 1, 'tonificazione', 'Mal di schiena ricorrente.');
    insVb.run(codice(), prossimo(giorniMarco, 5), '11:00', 'Roberta', 'Caputo', 'roberta@example.com', '349 555 0303', 0, 'benessere', null);

    /* Personal di Marco con altri clienti (senza account) */
    insApp.run('personal', null, 'Giulia Ferri', '340 555 1111', marco, null, g(1), '14:00', '15:00', 'Sala attrezzi', 'Preparazione gara di corsa.', 'confermato');
    insApp.run('personal', null, 'Ciro Esposito', '340 555 2222', marco, null, g(2), '13:00', '14:00', 'Sala functional', 'Rientro dopo infortunio al ginocchio.', 'confermato');
    insApp.run('personal', null, 'Giulia Ferri', '340 555 1111', marco, null, g(5), '14:00', '15:00', 'Sala attrezzi', null, 'confermato');

    /* Turni */
    const insTurno = db.prepare(`INSERT INTO turni (utente_id, data, inizio, fine, area, note, demo) VALUES (?, ?, ?, ?, ?, ?, 1)`);
    for (let i = 0; i < 14; i++) {
      const d = g(i), dow = giornoSettimana(d);
      // Anna: una settimana mattina, una pomeriggio; domenica riposo, sabato mezza giornata
      if (dow !== 0) {
        const mattina = Math.floor(i / 7) % 2 === 0;
        if (dow === 6) insTurno.run(anna, d, '09:00', '14:00', 'reception', 'Apertura weekend', );
        else insTurno.run(anna, d, mattina ? '06:00' : '14:00', mattina ? '14:00' : '22:00', 'reception', mattina ? 'Apertura club' : 'Chiusura cassa');
      }
      // Marco: sala nel pomeriggio, i Visbody restano al mattino
      if ([1, 3, 5].includes(dow)) insTurno.run(marco, d, '15:00', '19:00', 'sala', null);
      if ([2, 4].includes(dow)) insTurno.run(marco, d, '16:00', '21:00', 'sala', 'Chiusura sala');
    }

    /* Attività di Anna */
    const insAtt = db.prepare(`INSERT INTO attivita (utente_id, titolo, descrizione, scadenza, priorita, completata_il, demo) VALUES (?, ?, ?, ?, ?, ?, 1)`);
    insAtt.run(anna, 'Certificati medici in scadenza', '3 iscritti hanno il certificato che scade questa settimana: avvisarli all\'ingresso.', g(0), 'alta', null);
    insAtt.run(anna, 'Richiamare Giuseppe Landi', 'Abbonamento scaduto ieri, vuole sapere le promo di rinnovo.', g(0), 'alta', null);
    insAtt.run(anna, 'Preparare i badge dei nuovi iscritti', '5 badge da stampare e associare.', g(1), 'media', null);
    insAtt.run(anna, 'Confermare i Visbody di domani', 'Messaggio di promemoria a chi ha prenotato.', g(1), 'media', null);
    insAtt.run(anna, 'Ordinare asciugamani e gel docce', null, g(4), 'bassa', null);
    insAtt.run(anna, 'Chiusura cassa di ieri', null, g(-1), 'alta', new Date().toISOString().slice(0, 19).replace('T', ' '));

    /* Chiamate di Paolo */
    const insCh = db.prepare(`INSERT INTO chiamate (consulente_id, cliente_nome, telefono, motivo, data, ora, esito, completata_il, demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
    insCh.run(paolo, 'Lucia Marra', '331 555 9001', 'Lead da Instagram: chiede info sui corsi di Pilates', g(-1), '17:00', null, null);
    insCh.run(paolo, 'Giuseppe Landi', '331 555 9002', 'Abbonamento scaduto, proporre rinnovo annuale', g(0), '10:00', null, null);
    insCh.run(paolo, 'Teresa Gallo', '331 555 9003', 'Ha fatto la prova gratuita sabato: com\'è andata?', g(0), '16:30', null, null);
    insCh.run(paolo, 'Antonio Russo', '331 555 9004', 'Interessato al pacchetto personal 10 sedute', g(1), '11:00', null, null);
    insCh.run(paolo, 'Martina De Rosa', '331 555 9005', 'Richiesta convenzione aziendale', g(2), '15:00', null, null);
    insCh.run(paolo, 'Ferdinando Cuomo', '331 555 9006', 'Disdetta: capire il motivo', g(-2), '12:00', 'non-interessato', new Date().toISOString().slice(0, 19).replace('T', ' '));

    /* Consulenze di Paolo con potenziali clienti */
    insApp.run('consulenza', null, 'Federica Amato', '347 555 0101', paolo, null, g(1), '11:00', '11:30', 'Ufficio consulenze', 'Viene dopo il Visbody: proporre percorso dimagrimento.', 'confermato');
    insApp.run('consulenza', null, 'Gennaro Russo', '347 555 0404', paolo, null, g(2), '18:00', '18:30', 'Ufficio consulenze', 'Coppia: valutare abbonamento famiglia.', 'confermato');
    insApp.run('consulenza', null, 'Ilaria Conte', '347 555 0505', paolo, null, g(6), '12:30', '13:00', 'Ufficio consulenze', null, 'confermato');

    /* Lezioni dal planner, con uno o più istruttori */
    const planner = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'planner.json'), 'utf8')).settimana;
    const { elena, valerio, giorgio } = id;
    const istruttoriPer = (corso, dow) => ({
      step: [chiara],
      aerobica: [chiara],
      kombat: [chiara, valerio],                                     // co-condotto
      pilates: dow === 4 ? [chiara, elena] : dow === 1 ? [chiara] : [elena],
      yoga: [elena],
      functional: dow === 6 ? [giorgio, valerio] : [valerio],
      circuit: dow === 5 ? [giorgio, chiara] : [giorgio],
    }[corso] || [giorgio]);
    const insLez = db.prepare(`INSERT INTO lezioni (corso_id, data, inizio, fine, sala, demo) VALUES (?, ?, ?, ?, ?, 1)`);
    const insLi = db.prepare(`INSERT INTO lezioni_istruttori (lezione_id, utente_id) VALUES (?, ?)`);
    for (let i = 0; i < 21; i++) {
      const d = g(i), dow = giornoSettimana(d);
      for (const s of planner[String(dow)] || []) {
        const lid = insLez.run(s.corso, d, s.ora, aggiungiMinuti(s.ora, s.durata), s.sala).lastInsertRowid;
        for (const u of istruttoriPer(s.corso, dow)) insLi.run(lid, u);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  seedApp();
  seedStaff();
  return true;
}

/*
 * Dati per l'app del cliente demo (Mario): scheda, pesi già segnati nelle ultime settimane, visite Visbody.
 * Separata dal resto così si aggiunge anche a un database creato prima che l'app esistesse.
 */
const SCHEDA_DEMO = [
  ['A · Petto, spalle, tricipiti', [
    ['Panca piana con bilanciere', 4, '8', 120, 'Scapole addotte, piedi ben piantati.', [50, 52.5, 55, 55, 57.5]],
    ['Spinte manubri su panca inclinata', 3, '10', 90, null, [18, 18, 20, 20, 20]],
    ['Croci ai cavi', 3, '12', 60, 'Movimento controllato, niente slanci.', [10, 10, 12.5, 12.5, 12.5]],
    ['Lento avanti manubri', 3, '10', 90, null, [14, 14, 16, 16, 16]],
    ['Alzate laterali', 3, '12-15', 60, null, [8, 8, 8, 9, 10]],
    ['Push down al cavo', 3, '12', 60, null, [20, 22.5, 22.5, 25, 25]],
  ]],
  ['B · Gambe e addome', [
    ['Squat con bilanciere', 4, '8', 150, 'Scendi almeno al parallelo, schiena neutra.', [60, 65, 65, 70, 72.5]],
    ['Pressa 45°', 3, '10', 120, null, [120, 130, 140, 140, 150]],
    ['Affondi in camminata con manubri', 3, '10 per gamba', 90, null, [12, 12, 14, 14, 14]],
    ['Leg curl sdraiato', 3, '12', 60, null, [30, 32.5, 32.5, 35, 35]],
    ['Calf in piedi alla macchina', 4, '15', 45, null, [40, 40, 45, 45, 50]],
    ['Plank', 3, '45 sec', 45, null, null],
  ]],
  ['C · Dorso e bicipiti', [
    ['Lat machine presa larga', 4, '10', 90, null, [45, 47.5, 50, 50, 52.5]],
    ['Rematore con bilanciere', 4, '8', 120, "Busto a 45°, tira verso l'ombelico.", [40, 42.5, 45, 45, 47.5]],
    ['Pulley basso', 3, '12', 60, null, [40, 40, 45, 45, 45]],
    ['Face pull', 3, '15', 60, null, [15, 15, 17.5, 17.5, 20]],
    ['Curl con bilanciere EZ', 3, '10', 60, null, [20, 22.5, 22.5, 25, 25]],
    ['Tapis roulant in salita', 1, '15 min', null, 'Pendenza 8–10%, passo veloce.', null],
  ]],
];

export function seedApp() {
  const mario = db.prepare(`SELECT id FROM utenti WHERE email = 'cliente@demo.it' AND demo = 1`).get()?.id;
  const marco = db.prepare(`SELECT id FROM utenti WHERE email = 'trainer@demo.it' AND demo = 1`).get()?.id ?? null;
  if (!mario || db.prepare('SELECT COUNT(*) AS n FROM schede WHERE demo = 1').get().n > 0) return false;

  const { data: oggi } = oraItaliana();
  const g = (n) => aggiungiGiorni(oggi, n);
  db.exec('BEGIN');
  try {
    const schedaId = db.prepare(
      `INSERT INTO schede (cliente_id, trainer_id, titolo, obiettivo, inizio, fine, note, demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(mario, marco, 'Ipertrofia · 3 giorni', 'Aumento massa muscolare', g(-35), g(49),
      'Riscaldamento di 10 minuti prima di ogni allenamento. Se completi tutte le ripetizioni con buona tecnica, aumenta il peso la volta dopo.').lastInsertRowid;
    const insGiorno = db.prepare(`INSERT INTO schede_giorni (scheda_id, ordine, nome) VALUES (?, ?, ?)`);
    const insEs = db.prepare(`INSERT INTO schede_esercizi (giorno_id, ordine, nome, serie, ripetizioni, recupero_sec, note, con_peso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insPeso = db.prepare(`INSERT INTO registro_pesi (esercizio_id, cliente_id, data, peso_kg, demo) VALUES (?, ?, ?, ?, 1)`);
    SCHEDA_DEMO.forEach(([nome, esercizi], gi) => {
      const giornoId = insGiorno.run(schedaId, gi + 1, nome).lastInsertRowid;
      esercizi.forEach(([n, serie, rip, rec, note, storico], ei) => {
        const esId = insEs.run(giornoId, ei + 1, n, serie, rip, rec, note, storico ? 1 : 0).lastInsertRowid;
        // Una seduta a settimana per giorno di scheda, nelle ultime 5 settimane
        storico?.forEach((kg, k) => insPeso.run(esId, mario, g(-7 * (5 - k) + gi * 2 - 1), kg));
      });
    });

    const insVisita = db.prepare(
      `INSERT INTO visite (cliente_id, trainer_id, data, peso_kg, altezza_cm, grasso_pct, massa_muscolare_kg, acqua_pct, grasso_viscerale,
                           metabolismo_kcal, eta_metabolica, vita_cm, fianchi_cm, note, demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    insVisita.run(mario, marco, g(-63), 82.4, 178, 21.8, 35.1, 54.2, 9, 1760, 38, 92, 101, 'Prima analisi: buona base, obiettivo più massa magra e meno grasso addominale.');
    insVisita.run(mario, marco, g(-12), 81.1, 178, 19.6, 36.4, 55.8, 8, 1795, 35, 89, 100,
      'Ottimi progressi: +1,3 kg di muscolo e −2,2% di grasso in due mesi. Continuare con la scheda attuale, aumentare leggermente le proteine.');
    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/*
 * Dati per l'app dello staff: secondi colleghi (reception e trainer) con i loro turni, impegni, una richiesta di cambio turno.
 * Idempotente: si aggiunge anche a un database creato prima.
 */
export function seedStaff() {
  if (db.prepare(`SELECT COUNT(*) AS n FROM utenti WHERE email = 'reception2@demo.it'`).get().n > 0) return false;
  const idDi = (email) => db.prepare(`SELECT id FROM utenti WHERE email = ? AND demo = 1`).get(email)?.id;
  const anna = idDi('reception@demo.it'), marco = idDi('trainer@demo.it'), paolo = idDi('consulente@demo.it'), chiara = idDi('istruttore@demo.it');
  if (!anna || !marco) return false;

  const { data: oggi } = oraItaliana();
  const g = (n) => aggiungiGiorni(oggi, n);
  db.exec('BEGIN');
  try {
    const insUtente = db.prepare(`INSERT INTO utenti (email, password_hash, nome, cognome, telefono, ruolo, trainer_id, demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
    const [sara, luca] = ACCOUNT_DEMO_COLLEGHI.map((a) => Number(insUtente.run(a.email, hashPassword(a.password), a.nome, a.cognome, a.telefono, a.ruolo, null).lastInsertRowid));

    /* Turni dei colleghi: complementari a quelli di Anna e Marco */
    const insTurno = db.prepare(`INSERT INTO turni (utente_id, data, inizio, fine, area, note, demo) VALUES (?, ?, ?, ?, ?, ?, 1)`);
    const turnoSara = {};
    for (let i = 0; i < 14; i++) {
      const d = g(i), dow = giornoSettimana(d);
      if (dow !== 0 && dow !== 6) {
        const mattina = Math.floor(i / 7) % 2 === 1; // opposta ad Anna
        turnoSara[i] = Number(insTurno.run(sara, d, mattina ? '06:00' : '14:00', mattina ? '14:00' : '22:00', 'reception', mattina ? 'Apertura club' : 'Chiusura cassa').lastInsertRowid);
      }
      if ([2, 4, 6].includes(dow)) insTurno.run(luca, d, '08:00', '13:00', 'sala', null);
      if ([1, 3, 5].includes(dow)) insTurno.run(luca, d, '19:00', '23:00', 'sala', 'Chiusura sala');
    }

    /* Una richiesta in attesa: Sara chiede ad Anna di coprire un suo turno */
    const giornoSara = Object.keys(turnoSara).map(Number).find((i) => i >= 2);
    if (giornoSara != null) {
      db.prepare(`INSERT INTO cambi_turno (tipo, richiedente_id, turno_id, collega_id, messaggio, demo) VALUES ('copertura', ?, ?, ?, ?, 1)`)
        .run(sara, turnoSara[giornoSara], anna, 'Ho una visita medica quel giorno, riusciresti a coprirmi? Ricambio quando vuoi!');
    }

    /* Impegni */
    const insImp = db.prepare(`INSERT INTO impegni (utente_id, titolo, data, inizio, fine, luogo, note, demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
    insImp.run(marco, 'Riunione staff trainer', g(3), '13:30', '14:30', 'Sala riunioni', 'Nuove schede di gruppo per gennaio.');
    insImp.run(marco, 'Corso aggiornamento kettlebell', g(8), '10:00', '13:00', 'Online', null);
    insImp.run(anna, 'Formazione nuovo gestionale', g(2), '15:00', '16:00', 'Ufficio', 'Portare le credenziali.');
    if (paolo) insImp.run(paolo, 'Incontro azienda convenzione', g(1), '09:30', '10:30', 'Sede Rossi Srl, Via Roma 12', 'Proposta abbonamenti aziendali.');
    if (chiara) insImp.run(chiara, 'Prova coreografia step', g(2), '12:00', '13:00', 'Sala corsi', null);

    /* Una nota su una chiamata già fatta */
    if (paolo) db.prepare(`UPDATE chiamate SET note = ? WHERE consulente_id = ? AND esito = 'non-interessato'`).run('Si trasferisce a Salerno per lavoro. Richiamare tra 6 mesi.', paolo);

    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Esecuzione da riga di comando: `npm run seed` oppure `npm run seed:reset`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate();
  const reset = process.argv.includes('--reset');
  const fatto = seedDemo({ reset });
  console.log(fatto ? 'Dati dimostrativi creati.' : 'I dati dimostrativi esistono già (usa --reset per ricrearli).');
  for (const a of [...ACCOUNT_DEMO, ...ACCOUNT_DEMO_COLLEGHI]) console.log(`  ${a.ruolo.padEnd(13)} ${a.email.padEnd(22)} ${a.password}`);
}
