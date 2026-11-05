-- Area riservata: utenti, sessioni, agenda dello staff e dei clienti

CREATE TABLE IF NOT EXISTS utenti (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  nome          TEXT    NOT NULL,
  cognome       TEXT    NOT NULL,
  telefono      TEXT,
  ruolo         TEXT    NOT NULL CHECK (ruolo IN ('cliente', 'receptionist', 'consulente', 'trainer', 'istruttore')),
  trainer_id    TEXT,                 -- collega un personal trainer al suo profilo Visbody (server/data/trainer.json)
  attivo        INTEGER NOT NULL DEFAULT 1,
  demo          INTEGER NOT NULL DEFAULT 0,
  creato_il     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessioni (
  token_hash    TEXT    PRIMARY KEY,  -- salviamo solo l'hash del token, mai il token
  utente_id     INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  creato_il     TEXT    NOT NULL DEFAULT (datetime('now')),
  scade_il      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessioni_utente ON sessioni (utente_id);

-- Appuntamenti tra un cliente e lo staff (il Visbody ha la sua tabella)
CREATE TABLE IF NOT EXISTS appuntamenti (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo             TEXT    NOT NULL CHECK (tipo IN ('visita-medica', 'consulenza', 'personal')),
  cliente_id       INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  cliente_nome     TEXT,              -- per clienti senza account (es. potenziali iscritti)
  cliente_telefono TEXT,
  staff_id         INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  staff_nome       TEXT,              -- per professionisti esterni (es. medico sportivo)
  data             TEXT    NOT NULL,
  inizio           TEXT    NOT NULL,
  fine             TEXT    NOT NULL,
  luogo            TEXT,
  note             TEXT,
  stato            TEXT    NOT NULL DEFAULT 'confermato' CHECK (stato IN ('confermato', 'svolto', 'annullato')),
  demo             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_app_cliente ON appuntamenti (cliente_id, data);
CREATE INDEX IF NOT EXISTS ix_app_staff ON appuntamenti (staff_id, data);

-- Turni di lavoro (reception o sala pesi)
CREATE TABLE IF NOT EXISTS turni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id  INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  inizio     TEXT    NOT NULL,
  fine       TEXT    NOT NULL,
  area       TEXT    NOT NULL CHECK (area IN ('reception', 'sala')),
  note       TEXT,
  demo       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_turni_utente ON turni (utente_id, data);

-- Attività da svolgere (to-do dello staff)
CREATE TABLE IF NOT EXISTS attivita (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id     INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  titolo        TEXT    NOT NULL,
  descrizione   TEXT,
  scadenza      TEXT,
  priorita      TEXT    NOT NULL DEFAULT 'media' CHECK (priorita IN ('alta', 'media', 'bassa')),
  completata_il TEXT,
  creato_il     TEXT    NOT NULL DEFAULT (datetime('now')),
  demo          INTEGER NOT NULL DEFAULT 0
);

-- Chiamate che un consulente deve fare
CREATE TABLE IF NOT EXISTS chiamate (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  consulente_id  INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  cliente_nome   TEXT    NOT NULL,
  telefono       TEXT    NOT NULL,
  motivo         TEXT    NOT NULL,
  data           TEXT    NOT NULL,
  ora            TEXT,
  esito          TEXT,
  completata_il  TEXT,
  demo           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_chiamate_consulente ON chiamate (consulente_id, data);

-- Lezioni dei corsi: una lezione può avere più istruttori
CREATE TABLE IF NOT EXISTS lezioni (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  corso_id  TEXT    NOT NULL,         -- id in public/data/corsi.json
  data      TEXT    NOT NULL,
  inizio    TEXT    NOT NULL,
  fine      TEXT    NOT NULL,
  sala      TEXT,
  demo      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_lezioni_data ON lezioni (data);

CREATE TABLE IF NOT EXISTS lezioni_istruttori (
  lezione_id  INTEGER NOT NULL REFERENCES lezioni(id) ON DELETE CASCADE,
  utente_id   INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  PRIMARY KEY (lezione_id, utente_id)
);
CREATE INDEX IF NOT EXISTS ix_li_utente ON lezioni_istruttori (utente_id);

ALTER TABLE prenotazioni_visbody ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
