// Respaldo y restauración manual de la base (data/backups). La restauración copia datos DENTRO de una
// transacción con la base abierta: o se aplica completa o no se toca nada; antes siempre se respalda el estado actual.
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Db } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export const CONFIRMACION_RESTAURAR = 'RESTAURAR';
const NOMBRE_VALIDO = /^crm-[A-Za-z0-9._-]+\.db$/;

export interface Respaldo {
  archivo: string;
  tamano: number;
  creado_en: string;
  tipo: 'manual' | 'migracion' | 'restauracion' | 'otro';
}

function dirRespaldos(db: Db): string {
  if (!db.name || db.name === ':memory:')
    throw new KbError(409, 'La base está en memoria (demo): no hay archivo que respaldar');
  const dir = join(dirname(db.name), 'backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const tipoDe = (f: string): Respaldo['tipo'] =>
  f.startsWith('crm-manual-')
    ? 'manual'
    : f.startsWith('crm-pre-restaurar-')
      ? 'restauracion'
      : f.startsWith('crm-pre-')
        ? 'migracion'
        : 'otro';

export function listarRespaldos(db: Db): Respaldo[] {
  const dir = dirRespaldos(db);
  return readdirSync(dir)
    .filter((f) => NOMBRE_VALIDO.test(f))
    .map((archivo) => {
      const st = statSync(join(dir, archivo));
      return {
        archivo,
        tamano: st.size,
        creado_en: st.mtime.toISOString(),
        tipo: tipoDe(archivo),
      };
    })
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}

function copiar(db: Db, prefijo: string, ahora = new Date()): string {
  const dir = dirRespaldos(db);
  db.pragma('wal_checkpoint(TRUNCATE)');
  const sello = ahora.toISOString().replace(/[:.]/g, '-');
  const archivo = `${prefijo}-${sello}.db`;
  db.prepare('VACUUM INTO ?').run(join(dir, archivo));
  return archivo;
}

export function crearRespaldoManual(db: Db): Respaldo {
  const archivo = copiar(db, 'crm-manual');
  registrarCambio(db, 'prospeccion', 'respaldo', archivo, 'creó un respaldo manual');
  return listarRespaldos(db).find((r) => r.archivo === archivo)!;
}

const tablasDe = (db: Db, esquema: string): string[] =>
  (
    db
      .prepare(
        `SELECT name FROM ${esquema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map((t) => t.name);

const columnas = (db: Db, esquema: string, tabla: string): string[] =>
  (db.pragma(`${esquema}.table_info("${tabla}")`) as { name: string }[]).map((c) => c.name);

export interface ResultadoRestauracion {
  restaurado: string;
  respaldo_previo: string;
  tablas: number;
  filas: number;
}

/** Restaura una base de data/backups. Exige escribir RESTAURAR; respalda primero el estado actual. */
export function restaurarRespaldo(
  db: Db,
  archivo: string,
  confirmacion: string,
): ResultadoRestauracion {
  if (confirmacion !== CONFIRMACION_RESTAURAR)
    throw new KbError(400, `Escribe ${CONFIRMACION_RESTAURAR} para confirmar la restauración`);
  if (!NOMBRE_VALIDO.test(archivo)) throw new KbError(400, 'Nombre de respaldo inválido');
  const dir = dirRespaldos(db);
  const ruta = join(dir, archivo);
  if (!existsSync(ruta)) throw new KbError(404, 'Respaldo no encontrado');
  const previo = copiar(db, 'crm-pre-restaurar');
  db.prepare('ATTACH DATABASE ? AS bk').run(ruta);
  db.pragma('foreign_keys = OFF');
  try {
    const integridad = db.pragma('bk.integrity_check') as { integrity_check: string }[];
    if (integridad[0]?.integrity_check !== 'ok')
      throw new KbError(422, 'El respaldo está dañado (integrity_check): no se restauró nada');
    const enBk = new Set(tablasDe(db, 'bk'));
    if (!enBk.has('empresas') || !enBk.has('prospectos'))
      throw new KbError(422, 'El archivo no parece una base del CRM: no se restauró nada');
    let filas = 0;
    let tablas = 0;
    db.transaction(() => {
      for (const t of tablasDe(db, 'main')) {
        if (t === 'schema_migrations') continue;
        db.exec(`DELETE FROM main."${t}"`);
        if (!enBk.has(t)) continue; // tabla nueva respecto al respaldo: queda vacía
        const comunes = columnas(db, 'main', t).filter((c) => columnas(db, 'bk', t).includes(c));
        if (comunes.length === 0) continue;
        const lista = comunes.map((c) => `"${c}"`).join(',');
        filas += db
          .prepare(`INSERT INTO main."${t}" (${lista}) SELECT ${lista} FROM bk."${t}"`)
          .run().changes;
        tablas++;
      }
      const roto = db.pragma('foreign_key_check') as unknown[];
      if (roto.length > 0) throw new Error(`foreign_key_check: ${roto.length} fila(s) rotas`);
    })();
    return { restaurado: archivo, respaldo_previo: previo, tablas, filas };
  } finally {
    db.pragma('foreign_keys = ON');
    db.exec('DETACH DATABASE bk');
  }
}

/** Se registra DESPUÉS de restaurar (el registro de cambios también se restaura). */
export function registrarRestauracion(db: Db, r: ResultadoRestauracion): void {
  registrarCambio(
    db,
    'prospeccion',
    'respaldo',
    r.restaurado,
    'restauró la base',
    `Respaldo previo: ${r.respaldo_previo}`,
  );
}
