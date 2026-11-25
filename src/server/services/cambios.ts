import type { Db } from '../db';
import { nowIso } from '../db';

/** Registro de cambios de configuración (quién/cuándo cambió qué). Hoy el único actor es el dueño. */
export function registrarCambio(
  db: Db,
  office: string,
  entidad: string,
  ref: string | null,
  accion: string,
  detalle?: string,
): void {
  db.prepare(
    'INSERT INTO cambios_log (office_id, entidad, entidad_ref, accion, detalle, creado_en) VALUES (?,?,?,?,?,?)',
  ).run(office, entidad, ref, accion, detalle?.slice(0, 300) ?? null, nowIso());
}

export const listarCambios = (db: Db, office: string, limit = 100) =>
  db
    .prepare('SELECT * FROM cambios_log WHERE office_id = ? ORDER BY id DESC LIMIT ?')
    .all(office, Math.min(limit, 500));
