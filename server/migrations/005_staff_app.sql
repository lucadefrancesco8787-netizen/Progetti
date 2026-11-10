-- App dello staff: impegni personali, richieste di cambio turno, note sulle chiamate

-- Impegni aggiunti dallo staff alla propria agenda (riunioni, formazione, appuntamenti personali…)
CREATE TABLE IF NOT EXISTS impegni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id  INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  titolo     TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  inizio     TEXT    NOT NULL,
  fine       TEXT    NOT NULL,
  luogo      TEXT,
  note       TEXT,
  creato_il  TEXT    NOT NULL DEFAULT (datetime('now')),
  demo       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_impegni_utente ON impegni (utente_id, data);

-- Richiesta di cambio turno tra due colleghi.
-- tipo 'scambio': i due turni si scambiano; tipo 'copertura': il collega prende il turno senza darne uno in cambio.
CREATE TABLE IF NOT EXISTS cambi_turno (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo              TEXT    NOT NULL CHECK (tipo IN ('scambio', 'copertura')),
  richiedente_id    INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  turno_id          INTEGER NOT NULL REFERENCES turni(id) ON DELETE CASCADE,
  collega_id        INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  turno_collega_id  INTEGER REFERENCES turni(id) ON DELETE CASCADE,   -- solo per lo scambio
  messaggio         TEXT,
  stato             TEXT    NOT NULL DEFAULT 'in-attesa' CHECK (stato IN ('in-attesa', 'accettata', 'rifiutata', 'annullata')),
  risposta          TEXT,
  creato_il         TEXT    NOT NULL DEFAULT (datetime('now')),
  risposto_il       TEXT,
  demo              INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_cambi_collega ON cambi_turno (collega_id, stato);
CREATE INDEX IF NOT EXISTS ix_cambi_richiedente ON cambi_turno (richiedente_id, stato);

-- Note del consulente sull'esito di una chiamata
ALTER TABLE chiamate ADD COLUMN note TEXT;
