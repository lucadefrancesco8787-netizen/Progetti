-- Prenotazioni della visita Visbody con un trainer
CREATE TABLE IF NOT EXISTS prenotazioni_visbody (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codice        TEXT    NOT NULL UNIQUE,
  trainer_id    TEXT    NOT NULL,
  data          TEXT    NOT NULL,            -- YYYY-MM-DD (ora italiana)
  ora           TEXT    NOT NULL,            -- HH:MM
  nome          TEXT    NOT NULL,
  cognome       TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  telefono      TEXT    NOT NULL,
  iscritto      INTEGER NOT NULL DEFAULT 0,  -- 1 = già iscritto al club
  obiettivo     TEXT,
  note          TEXT,
  stato         TEXT    NOT NULL DEFAULT 'confermata' CHECK (stato IN ('confermata', 'annullata')),
  creato_il     TEXT    NOT NULL DEFAULT (datetime('now')),
  annullato_il  TEXT
);

-- Un trainer non può avere due visite confermate nello stesso orario
CREATE UNIQUE INDEX IF NOT EXISTS ux_visbody_slot
  ON prenotazioni_visbody (trainer_id, data, ora)
  WHERE stato = 'confermata';

CREATE INDEX IF NOT EXISTS ix_visbody_data ON prenotazioni_visbody (data);
