import { OFICINA_PRINCIPAL, type OficinaFila } from '../../shared/oficinas';
import { definicionOficina, type DefinicionOficina } from '../../shared/oficina3d/definicion';
import { definicionMinima } from '../../shared/oficina3d/minima';
import { definicionProspeccion, type AgenteRoster } from '../../shared/oficina3d/prospeccion';
import type { Db } from '../db';
import { nowIso } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

const COLS =
  'id, nombre, descripcion, icono, orden, estado, plantilla_origen, workflow_ref, creado_en';

export function listarOficinas(db: Db, incluirArchivadas = true): OficinaFila[] {
  return db
    .prepare(
      `SELECT ${COLS} FROM oficinas ${incluirArchivadas ? '' : "WHERE estado = 'activa'"} ORDER BY estado, orden, id`,
    )
    .all() as OficinaFila[];
}

export function obtenerOficina(db: Db, id: string): OficinaFila | undefined {
  return db.prepare(`SELECT ${COLS} FROM oficinas WHERE id = ?`).get(id) as OficinaFila | undefined;
}

export function oficinaActivaOError(db: Db, id: string): OficinaFila {
  const o = obtenerOficina(db, id);
  if (!o) throw new KbError(404, `Oficina desconocida: ${id}`);
  if (o.estado !== 'activa') throw new KbError(409, `La oficina «${o.nombre}» está archivada`);
  return o;
}

/** Id estable a partir del nombre (sin acentos); si ya existe agrega un sufijo numérico. */
export function idDesdeNombre(db: Db, nombre: string): string {
  const base =
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34) || 'oficina';
  const id0 = base.length >= 2 ? base : `${base}-1`;
  let id = id0;
  for (let n = 2; obtenerOficina(db, id); n++) id = `${id0}-${n}`;
  return id;
}

export function siguienteOrden(db: Db): number {
  return (
    (db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM oficinas').get() as { m: number }).m + 1
  );
}

/** Piso (1 = planta baja) de una oficina activa según el orden entre las activas. */
export function pisoDe(db: Db, id: string): number | null {
  const ids = listarOficinas(db, false).map((o) => o.id);
  const i = ids.indexOf(id);
  return i < 0 ? null : i + 1;
}

export function renombrarOficina(
  db: Db,
  id: string,
  p: { nombre?: string | undefined; descripcion?: string | undefined; icono?: string | undefined },
): OficinaFila {
  const o = obtenerOficina(db, id);
  if (!o) throw new KbError(404, `Oficina desconocida: ${id}`);
  const n = { ...o, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) };
  db.prepare('UPDATE oficinas SET nombre = ?, descripcion = ?, icono = ? WHERE id = ?').run(
    n.nombre,
    n.descripcion,
    n.icono,
    id,
  );
  // El rótulo 3D sigue al nombre.
  const def = leerDefinicion(db, id);
  if (def && def.office.nombre !== n.nombre)
    guardarDefinicion(db, id, { ...def, office: { ...def.office, nombre: n.nombre } });
  registrarCambio(db, id, 'oficina', id, 'renombró/editó la oficina', n.nombre);
  return obtenerOficina(db, id)!;
}

/** Reordena las activas (el primer id es el piso 1). Debe incluir exactamente todas las activas. */
export function reordenarOficinas(db: Db, orden: string[]): OficinaFila[] {
  const activas = listarOficinas(db, false).map((o) => o.id);
  const igual =
    orden.length === activas.length &&
    new Set(orden).size === orden.length &&
    orden.every((i) => activas.includes(i));
  if (!igual) throw new KbError(400, 'El orden debe incluir exactamente las oficinas activas');
  const up = db.prepare('UPDATE oficinas SET orden = ? WHERE id = ?');
  db.transaction(() => orden.forEach((id, i) => up.run(i + 1, id)))();
  registrarCambio(db, OFICINA_PRINCIPAL, 'oficina', null, 'reordenó los pisos', orden.join(' > '));
  return listarOficinas(db);
}

/** Archivar = ocultar (jamás se borra físicamente). No se archiva con corrida en curso ni la última activa. */
export function archivarOficina(db: Db, id: string): OficinaFila {
  const o = obtenerOficina(db, id);
  if (!o) throw new KbError(404, `Oficina desconocida: ${id}`);
  if (o.estado === 'archivada') return o;
  if (db.prepare("SELECT 1 FROM corridas WHERE office_id = ? AND estado = 'en_curso'").get(id))
    throw new KbError(409, 'Hay una corrida en curso en esta oficina; deténla antes de archivarla');
  if (listarOficinas(db, false).length <= 1)
    throw new KbError(409, 'No se puede archivar la última oficina activa del edificio');
  db.prepare("UPDATE oficinas SET estado = 'archivada' WHERE id = ?").run(id);
  registrarCambio(db, id, 'oficina', id, 'archivó la oficina', o.nombre);
  return obtenerOficina(db, id)!;
}

export function restaurarOficina(db: Db, id: string): OficinaFila {
  const o = obtenerOficina(db, id);
  if (!o) throw new KbError(404, `Oficina desconocida: ${id}`);
  if (o.estado === 'activa') return o;
  db.prepare("UPDATE oficinas SET estado = 'activa', orden = ? WHERE id = ?").run(
    siguienteOrden(db),
    id,
  );
  registrarCambio(db, id, 'oficina', id, 'restauró la oficina', o.nombre);
  return obtenerOficina(db, id)!;
}

// ---- Definición 3D (planta)

export function leerDefinicion(db: Db, id: string): DefinicionOficina | null {
  const r = db.prepare('SELECT definicion_json FROM oficinas WHERE id = ?').get(id) as
    { definicion_json: string | null } | undefined;
  if (!r?.definicion_json) return null;
  try {
    const p = definicionOficina.safeParse(JSON.parse(r.definicion_json));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/** Valida con el esquema zod y guarda la planta. */
export function guardarDefinicion(db: Db, id: string, def: unknown): DefinicionOficina {
  const d = definicionOficina.parse(def);
  if (d.office.id !== id) throw new KbError(400, 'La definición no corresponde a esta oficina');
  db.prepare('UPDATE oficinas SET definicion_json = ? WHERE id = ?').run(JSON.stringify(d), id);
  return d;
}

function rosterDe(db: Db, id: string): AgenteRoster[] {
  return db
    .prepare(
      'SELECT id, persona, genero, rol, area FROM agentes WHERE office_id = ? ORDER BY rowid',
    )
    .all(id) as AgenteRoster[];
}

/**
 * Definición 3D de una oficina: la guardada; si falta (o es inválida) se genera: la de prospección
 * desde su roster y para el resto una planta mínima válida (recepción + 1 sala).
 */
export function definicionDe(db: Db, id: string): DefinicionOficina | null {
  const o = obtenerOficina(db, id);
  if (!o) return null;
  const guardada = leerDefinicion(db, id);
  if (guardada) return guardada;
  const piso = pisoDe(db, id) ?? 1;
  if (id === OFICINA_PRINCIPAL) {
    const d = definicionProspeccion(rosterDe(db, id));
    return { ...d, office: { ...d.office, nombre: o.nombre, piso } };
  }
  return definicionMinima({ id, nombre: o.nombre, piso });
}

/** Al arrancar: guarda la planta de las oficinas que aún no la tienen (idempotente). */
export function sembrarDefiniciones(db: Db): void {
  for (const o of listarOficinas(db)) {
    if (leerDefinicion(db, o.id)) continue;
    const d = definicionDe(db, o.id);
    if (d)
      db.prepare('UPDATE oficinas SET definicion_json = ? WHERE id = ?').run(
        JSON.stringify(d),
        o.id,
      );
  }
}

export function insertarOficina(
  db: Db,
  o: {
    id: string;
    nombre: string;
    descripcion: string;
    icono: string;
    plantilla_origen: string;
    workflow_json: string;
  },
): void {
  db.prepare(
    `INSERT INTO oficinas (id, nombre, descripcion, icono, orden, estado, plantilla_origen, workflow_ref, workflow_json, creado_en)
     VALUES (?,?,?,?,?,'activa',?, 'bd', ?, ?)`,
  ).run(
    o.id,
    o.nombre,
    o.descripcion,
    o.icono,
    siguienteOrden(db),
    o.plantilla_origen,
    o.workflow_json,
    nowIso(),
  );
}
