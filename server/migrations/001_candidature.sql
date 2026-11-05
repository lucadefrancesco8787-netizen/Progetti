-- Candidature ricevute dalla sezione "Lavora con noi"
CREATE TABLE IF NOT EXISTS candidature (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  cognome       TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  telefono      TEXT,
  ruolo         TEXT    NOT NULL CHECK (ruolo IN ('personal-trainer', 'consulente-commerciale', 'segreteria')),
  messaggio     TEXT,
  cv_file       TEXT    NOT NULL,
  cv_nome       TEXT    NOT NULL,
  creato_il     TEXT    NOT NULL DEFAULT (datetime('now'))
);
