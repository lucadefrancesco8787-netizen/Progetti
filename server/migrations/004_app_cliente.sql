-- App del cliente: scheda di allenamento, pesi registrati, risultati delle visite

-- Una scheda appartiene a un cliente; di solito una sola è attiva alla volta
CREATE TABLE IF NOT EXISTS schede (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id   INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  trainer_id   INTEGER REFERENCES utenti(id) ON DELETE SET NULL,   -- chi l'ha preparata
  titolo       TEXT    NOT NULL,
  obiettivo    TEXT,
  inizio       TEXT    NOT NULL,                                   -- YYYY-MM-DD
  fine         TEXT,                                               -- scadenza prevista
  note         TEXT,
  attiva       INTEGER NOT NULL DEFAULT 1,
  creato_il    TEXT    NOT NULL DEFAULT (datetime('now')),
  demo         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_schede_cliente ON schede (cliente_id, attiva);

-- Giorni della scheda (es. "A · Petto e tricipiti")
CREATE TABLE IF NOT EXISTS schede_giorni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scheda_id  INTEGER NOT NULL REFERENCES schede(id) ON DELETE CASCADE,
  ordine     INTEGER NOT NULL,
  nome       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_giorni_scheda ON schede_giorni (scheda_id, ordine);

CREATE TABLE IF NOT EXISTS schede_esercizi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  giorno_id     INTEGER NOT NULL REFERENCES schede_giorni(id) ON DELETE CASCADE,
  ordine        INTEGER NOT NULL,
  nome          TEXT    NOT NULL,
  serie         INTEGER NOT NULL,
  ripetizioni   TEXT    NOT NULL,      -- testo: "10", "8-10", "30 sec", "max"
  recupero_sec  INTEGER,
  note          TEXT,
  con_peso      INTEGER NOT NULL DEFAULT 1   -- 0 = corpo libero / cardio, niente kg da segnare
);
CREATE INDEX IF NOT EXISTS ix_esercizi_giorno ON schede_esercizi (giorno_id, ordine);

-- Il peso usato dal cliente: uno per esercizio per giorno (se lo cambia, si aggiorna)
CREATE TABLE IF NOT EXISTS registro_pesi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  esercizio_id  INTEGER NOT NULL REFERENCES schede_esercizi(id) ON DELETE CASCADE,
  cliente_id    INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  data          TEXT    NOT NULL,
  peso_kg       REAL    NOT NULL CHECK (peso_kg >= 0 AND peso_kg <= 1000),
  aggiornato_il TEXT    NOT NULL DEFAULT (datetime('now')),
  demo          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (esercizio_id, cliente_id, data)
);
CREATE INDEX IF NOT EXISTS ix_pesi_cliente ON registro_pesi (cliente_id, esercizio_id, data);

-- Risultati della visita (analisi corporea Visbody), inseriti dal trainer
CREATE TABLE IF NOT EXISTS visite (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id         INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  trainer_id         INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  data               TEXT    NOT NULL,
  tipo               TEXT    NOT NULL DEFAULT 'visbody',
  peso_kg            REAL,
  altezza_cm         REAL,
  grasso_pct         REAL,
  massa_muscolare_kg REAL,
  acqua_pct          REAL,
  grasso_viscerale   REAL,
  metabolismo_kcal   INTEGER,
  eta_metabolica     INTEGER,
  vita_cm            REAL,
  fianchi_cm         REAL,
  note               TEXT,
  creato_il          TEXT    NOT NULL DEFAULT (datetime('now')),
  demo               INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_visite_cliente ON visite (cliente_id, data);
