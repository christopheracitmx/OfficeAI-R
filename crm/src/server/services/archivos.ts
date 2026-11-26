import { dirname, resolve } from 'node:path';
import type { Db } from '../db';
import { nowIso } from '../db';
import {
  leerTexto,
  listarDirectorio,
  moverACuarentena,
  resolverDentro,
  revertirCuarentena,
  validarCarpetaRaiz,
  type EntradaListado,
} from './archivos-sandbox';
import { registrarCambio } from './cambios';
import { KbError } from './kb';
import { oficinaActivaOError } from './oficinas';

export interface CarpetaFila {
  id: number;
  ruta: string;
}

export interface EntradaLog {
  id: number;
  accion: string;
  ruta: string;
  destino: string | null;
  detalle: string | null;
  agente: string | null;
  creado_en: string;
}

export function estadoArchivos(db: Db, office: string) {
  oficinaActivaOError(db, office);
  const activo =
    (
      db.prepare('SELECT archivos_activo AS a FROM oficinas WHERE id = ?').get(office) as {
        a: number;
      }
    ).a === 1;
  const carpetas = carpetasDe(db, office);
  const log = db
    .prepare(
      'SELECT id, accion, ruta, destino, detalle, agente, creado_en FROM archivos_log WHERE office_id = ? ORDER BY id DESC LIMIT 100',
    )
    .all(office) as EntradaLog[];
  return { activo, carpetas, log };
}

export const carpetasDe = (db: Db, office: string): CarpetaFila[] =>
  db
    .prepare('SELECT id, ruta FROM archivos_carpetas WHERE office_id = ? ORDER BY id')
    .all(office) as CarpetaFila[];

const raices = (db: Db, office: string): string[] => carpetasDe(db, office).map((c) => c.ruta);

/** Autoriza una carpeta (ruta absoluta y real; no puede contener los datos del CRM). */
export function agregarCarpeta(db: Db, office: string, ruta: string): CarpetaFila {
  oficinaActivaOError(db, office);
  const real = validarCarpetaRaiz(ruta, db.name === ':memory:' ? [] : [resolve(dirname(db.name))]);
  const previas = raices(db, office);
  if (previas.includes(real)) throw new KbError(409, 'Esa carpeta ya está autorizada');
  const r = db
    .prepare('INSERT INTO archivos_carpetas (office_id, ruta, creado_en) VALUES (?,?,?)')
    .run(office, real, nowIso());
  registrarCambio(db, office, 'archivos', String(r.lastInsertRowid), 'autorizó una carpeta', real);
  return { id: Number(r.lastInsertRowid), ruta: real };
}

export function quitarCarpeta(db: Db, office: string, id: number): void {
  const c = db
    .prepare('SELECT ruta FROM archivos_carpetas WHERE id = ? AND office_id = ?')
    .get(id, office) as { ruta: string } | undefined;
  if (!c) throw new KbError(404, 'Carpeta no encontrada');
  db.transaction(() => {
    db.prepare('DELETE FROM archivos_carpetas WHERE id = ?').run(id);
    // Sin carpetas no puede haber archivos activos.
    if (carpetasDe(db, office).length === 0)
      db.prepare('UPDATE oficinas SET archivos_activo = 0 WHERE id = ?').run(office);
  })();
  registrarCambio(db, office, 'archivos', String(id), 'quitó una carpeta autorizada', c.ruta);
}

export function activarArchivos(db: Db, office: string, activo: boolean): void {
  oficinaActivaOError(db, office);
  if (activo && carpetasDe(db, office).length === 0)
    throw new KbError(409, 'Autoriza al menos una carpeta antes de activar los archivos');
  db.prepare('UPDATE oficinas SET archivos_activo = ? WHERE id = ?').run(activo ? 1 : 0, office);
  registrarCambio(
    db,
    office,
    'archivos',
    null,
    activo ? 'activó las herramientas de archivos' : 'desactivó las herramientas de archivos',
  );
}

function exigirActivo(db: Db, office: string): string[] {
  const a = db.prepare('SELECT archivos_activo AS a FROM oficinas WHERE id = ?').get(office) as
    { a: number } | undefined;
  if (!a || a.a !== 1)
    throw new KbError(403, 'Las herramientas de archivos están desactivadas en esta oficina');
  const r = raices(db, office);
  if (r.length === 0) throw new KbError(403, 'No hay carpetas autorizadas');
  return r;
}

function log(
  db: Db,
  office: string,
  accion: string,
  ruta: string,
  agente: string | null,
  destino?: string,
  detalle?: string,
): number {
  return Number(
    db
      .prepare(
        'INSERT INTO archivos_log (office_id, accion, ruta, destino, detalle, agente, creado_en) VALUES (?,?,?,?,?,?,?)',
      )
      .run(office, accion, ruta, destino ?? null, detalle ?? null, agente, nowIso())
      .lastInsertRowid,
  );
}

/** Sin ruta: las carpetas autorizadas. Con ruta: el contenido de esa carpeta (dentro de la sandbox). */
export function archivosListar(
  db: Db,
  office: string,
  ruta: string | undefined,
  agente: string,
): { carpetas?: string[]; entradas?: EntradaListado[]; truncado?: boolean } {
  const r = exigirActivo(db, office);
  if (!ruta) return { carpetas: r };
  const { real } = resolverDentro(r, ruta);
  const l = listarDirectorio(real);
  log(db, office, 'listar', real, agente);
  return l;
}

export function archivosLeer(db: Db, office: string, ruta: string, agente: string) {
  const r = exigirActivo(db, office);
  const { real } = resolverDentro(r, ruta);
  const t = leerTexto(real);
  log(
    db,
    office,
    'leer',
    real,
    agente,
    undefined,
    `${t.tamano} bytes${t.truncado ? ' (truncado)' : ''}`,
  );
  return { ruta: real, ...t };
}

export function archivosMoverCuarentena(
  db: Db,
  office: string,
  ruta: string,
  motivo: string,
  agente: string,
): { origen: string; destino: string; log_id: number } {
  const r = exigirActivo(db, office);
  const { raiz, real } = resolverDentro(r, ruta);
  const m = moverACuarentena(raiz, real);
  const id = log(db, office, 'mover_cuarentena', m.origen, agente, m.destino, motivo.slice(0, 300));
  registrarCambio(db, office, 'archivos', String(id), 'movió a cuarentena', m.origen);
  return { ...m, log_id: id };
}

/** El dueño revierte un movimiento a cuarentena (el archivo vuelve a su lugar original). */
export function revertirMovimiento(db: Db, office: string, logId: number): void {
  const e = db
    .prepare(
      "SELECT * FROM archivos_log WHERE id = ? AND office_id = ? AND accion = 'mover_cuarentena'",
    )
    .get(logId, office) as { ruta: string; destino: string } | undefined;
  if (!e) throw new KbError(404, 'Movimiento no encontrado');
  const raiz = raices(db, office).find((x) => e.ruta.toLowerCase().startsWith(x.toLowerCase()));
  if (!raiz) throw new KbError(403, 'La carpeta ya no está autorizada');
  revertirCuarentena(raiz, e.ruta, e.destino);
  log(db, office, 'revertir', e.ruta, null, e.destino, `revierte el movimiento #${logId}`);
  registrarCambio(db, office, 'archivos', String(logId), 'revirtió un movimiento', e.ruta);
}
