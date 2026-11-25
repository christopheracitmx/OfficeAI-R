import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed';

export type Db = Database.Database;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Abre SQLite (archivo o ':memory:'), aplica migraciones pendientes y semillas. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seed(db);
  return db;
}

export function migrate(db: Db): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)',
  );
  const hechas = new Set(
    (db.prepare('SELECT nombre FROM schema_migrations').all() as { nombre: string }[]).map(
      (r) => r.nombre,
    ),
  );
  const aplicadas: string[] = [];
  const archivos = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, archivo), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (nombre, aplicada_en) VALUES (?, ?)').run(
      archivo,
      new Date().toISOString(),
    );
    aplicadas.push(archivo);
  }
  db.pragma('foreign_keys = ON');
  return aplicadas;
}

export const nowIso = (): string => new Date().toISOString();
