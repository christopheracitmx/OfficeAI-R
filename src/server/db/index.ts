import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed';

export type Db = Database.Database;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const RESPALDOS_A_CONSERVAR = 5;

/** Abre SQLite (archivo o ':memory:'), aplica migraciones pendientes (con respaldo) y semillas. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seed(db);
  return db;
}

/** Respaldo consistente (incluye lo que aún está en el WAL) y rotación de los últimos 5. */
export function respaldarAntesDeMigrar(
  db: Db,
  migracion: string,
  ahora = new Date(),
): string | null {
  const ruta = db.name;
  if (!ruta || ruta === ':memory:' || !existsSync(ruta)) return null;
  const dir = join(dirname(ruta), 'backups');
  mkdirSync(dir, { recursive: true });
  db.pragma('wal_checkpoint(TRUNCATE)');
  const sello = ahora.toISOString().replace(/[:.]/g, '-');
  const destino = join(dir, `crm-pre-${migracion.replace(/\.sql$/, '')}-${sello}.db`);
  db.prepare('VACUUM INTO ?').run(destino);
  const viejos = readdirSync(dir)
    .filter((f) => /^crm-pre-.*\.db$/.test(f))
    .sort();
  for (const f of viejos.slice(0, Math.max(0, viejos.length - RESPALDOS_A_CONSERVAR)))
    rmSync(join(dir, f), { force: true });
  return destino;
}

/**
 * Aplica las migraciones pendientes. Si hay alguna y la base ya tenía datos, respalda primero.
 * Cada migración corre en UNA transacción con foreign_keys apagado (fuera de la transacción) y
 * termina con PRAGMA foreign_key_check: si algo falla se revierte y se lanza el error.
 */
export function migrate(db: Db, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)',
  );
  const hechas = new Set(
    (db.prepare('SELECT nombre FROM schema_migrations').all() as { nombre: string }[]).map(
      (r) => r.nombre,
    ),
  );
  const pendientes = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !hechas.has(f));
  const aplicadas: string[] = [];
  if (pendientes.length === 0) return aplicadas;
  const respaldo = hechas.size > 0 ? respaldarAntesDeMigrar(db, pendientes[0]!) : null;
  db.pragma('foreign_keys = OFF');
  try {
    for (const archivo of pendientes) {
      const sql = readFileSync(join(dir, archivo), 'utf8');
      try {
        db.transaction(() => {
          db.exec(sql);
          const roto = db.pragma('foreign_key_check') as unknown[];
          if (roto.length > 0) throw new Error(`foreign_key_check: ${roto.length} fila(s) rotas`);
          db.prepare('INSERT INTO schema_migrations (nombre, aplicada_en) VALUES (?, ?)').run(
            archivo,
            new Date().toISOString(),
          );
        })();
      } catch (e) {
        throw new Error(
          `Migración ${archivo} falló y se revirtió${respaldo ? ` (respaldo previo: ${respaldo})` : ''}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      aplicadas.push(archivo);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
  return aplicadas;
}

export const nowIso = (): string => new Date().toISOString();
