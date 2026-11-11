-- Peso di ogni singola serie (es. 3 serie da 10: 40, 42,5, 45 kg)
--
-- registro_pesi resta com'è: una riga per esercizio per giorno con il peso più alto delle serie.
-- Così storico, grafico "Andamento", "Ultima volta" e le viste dello staff continuano a funzionare.
-- Il server scrive sempre le due tabelle insieme, in un'unica transazione (app-cliente.js, salvaSerie).
CREATE TABLE IF NOT EXISTS registro_serie (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  esercizio_id  INTEGER NOT NULL REFERENCES schede_esercizi(id) ON DELETE CASCADE,
  cliente_id    INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  data          TEXT    NOT NULL,
  serie         INTEGER NOT NULL CHECK (serie BETWEEN 1 AND 20),   -- 1 = prima serie
  peso_kg       REAL    NOT NULL CHECK (peso_kg >= 0 AND peso_kg <= 1000),
  aggiornato_il TEXT    NOT NULL DEFAULT (datetime('now')),
  demo          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (esercizio_id, cliente_id, data, serie)
);
CREATE INDEX IF NOT EXISTS ix_serie_cliente ON registro_serie (cliente_id, esercizio_id, data);
