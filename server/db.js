import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

// Applica in ordine le migrazioni non ancora eseguite (server/migrations/*.sql)
export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrazioni (nome TEXT PRIMARY KEY, applicata_il TEXT DEFAULT (datetime('now')))`);
  const done = new Set(db.prepare('SELECT nome FROM _migrazioni').all().map((r) => r.nome));
  const dir = path.join(ROOT, 'server', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      db.prepare('INSERT INTO _migrazioni (nome) VALUES (?)').run(f);
      db.exec('COMMIT');
      console.log(`Migrazione applicata: ${f}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
