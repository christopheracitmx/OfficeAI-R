import { z } from 'zod';
import {
  campoDef,
  coleccionInput,
  type CampoDef,
  type ColeccionInput,
} from '../../shared/colecciones';
import type { Db } from '../db';
import { nowIso } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export interface ColeccionFila {
  id: number;
  office_id: string;
  nombre: string;
  descripcion: string;
  campos: CampoDef[];
  clave: string | null;
  estado: 'activa' | 'archivada';
  registros: number;
  creado_en: string;
  actualizado_en: string;
}

interface Cruda {
  id: number;
  office_id: string;
  nombre: string;
  descripcion: string;
  campos_json: string;
  clave: string | null;
  estado: 'activa' | 'archivada';
  creado_en: string;
  actualizado_en: string;
}

function aFila(db: Db, r: Cruda): ColeccionFila {
  const { campos_json, ...resto } = r;
  const n = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM coleccion_registros WHERE coleccion_id = ? AND estado = 'activo'",
      )
      .get(r.id) as { n: number }
  ).n;
  return { ...resto, campos: z.array(campoDef).parse(JSON.parse(campos_json)), registros: n };
}

export function listarColecciones(db: Db, office: string, archivadas = false): ColeccionFila[] {
  return (
    db
      .prepare(
        `SELECT * FROM colecciones WHERE office_id = ? ${archivadas ? '' : "AND estado = 'activa'"} ORDER BY estado, nombre`,
      )
      .all(office) as Cruda[]
  ).map((r) => aFila(db, r));
}

/** Colección de ESA oficina (el aislamiento por office_id es obligatorio en cada acceso). */
export function obtenerColeccion(db: Db, office: string, id: number): ColeccionFila | undefined {
  const r = db
    .prepare('SELECT * FROM colecciones WHERE id = ? AND office_id = ?')
    .get(id, office) as Cruda | undefined;
  return r && aFila(db, r);
}

export function coleccionPorNombre(
  db: Db,
  office: string,
  nombre: string,
): ColeccionFila | undefined {
  const r = db
    .prepare('SELECT * FROM colecciones WHERE office_id = ? AND nombre = ? COLLATE NOCASE')
    .get(office, nombre) as Cruda | undefined;
  return r && aFila(db, r);
}

export function coleccionOError(db: Db, office: string, id: number): ColeccionFila {
  const c = obtenerColeccion(db, office, id);
  if (!c) throw new KbError(404, 'Colección no encontrada');
  return c;
}

const esUnico = (e: unknown): boolean => e instanceof Error && /UNIQUE/.test(e.message);
const MSG_DUP = 'Ya existe una colección con ese nombre en esta oficina';

export function crearColeccion(db: Db, office: string, entrada: ColeccionInput): ColeccionFila {
  const i = coleccionInput.parse(entrada);
  const t = nowIso();
  try {
    const r = db
      .prepare(
        'INSERT INTO colecciones (office_id, nombre, descripcion, campos_json, clave, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?)',
      )
      .run(office, i.nombre, i.descripcion, JSON.stringify(i.campos), i.clave, t, t);
    registrarCambio(
      db,
      office,
      'coleccion',
      String(r.lastInsertRowid),
      'creó la colección',
      i.nombre,
    );
    return coleccionOError(db, office, Number(r.lastInsertRowid));
  } catch (e) {
    if (esUnico(e)) throw new KbError(409, MSG_DUP);
    throw e;
  }
}

/**
 * Edita nombre, descripción y esquema. Seguro con datos: no se pueden quitar campos ni cambiar su tipo
 * (solo añadir campos opcionales o cambiar etiquetas/ampliar opciones).
 */
export function editarColeccion(
  db: Db,
  office: string,
  id: number,
  p: {
    nombre?: string | undefined;
    descripcion?: string | undefined;
    campos?: CampoDef[] | undefined;
  },
): ColeccionFila {
  const c = coleccionOError(db, office, id);
  const campos = p.campos ?? c.campos;
  if (p.campos) {
    const nuevosPorNombre = new Map(p.campos.map((f) => [f.nombre, f]));
    for (const viejo of c.campos) {
      const nuevo = nuevosPorNombre.get(viejo.nombre);
      if (!nuevo)
        throw new KbError(
          422,
          `No se puede quitar el campo «${viejo.etiqueta}»; archiva la colección`,
        );
      if (nuevo.tipo !== viejo.tipo)
        throw new KbError(422, `No se puede cambiar el tipo del campo «${viejo.etiqueta}»`);
      if (viejo.tipo === 'enum' && !viejo.opciones?.every((o) => nuevo.opciones?.includes(o)))
        throw new KbError(422, `Las opciones de «${viejo.etiqueta}» solo se pueden ampliar`);
    }
    const existentes = new Set(c.campos.map((v) => v.nombre));
    const nuevos = p.campos.filter((f) => !existentes.has(f.nombre));
    if (nuevos.some((f) => f.requerido) && c.registros > 0)
      throw new KbError(422, 'Los campos nuevos deben ser opcionales si ya hay registros');
    coleccionInput.parse({ nombre: c.nombre, campos, clave: c.clave });
  }
  try {
    db.prepare(
      'UPDATE colecciones SET nombre = ?, descripcion = ?, campos_json = ?, actualizado_en = ? WHERE id = ?',
    ).run(
      p.nombre ?? c.nombre,
      p.descripcion ?? c.descripcion,
      JSON.stringify(campos),
      nowIso(),
      id,
    );
  } catch (e) {
    if (esUnico(e)) throw new KbError(409, MSG_DUP);
    throw e;
  }
  registrarCambio(db, office, 'coleccion', String(id), 'editó la colección', p.nombre ?? c.nombre);
  return coleccionOError(db, office, id);
}

export function estadoColeccion(
  db: Db,
  office: string,
  id: number,
  estado: 'activa' | 'archivada',
): ColeccionFila {
  const c = coleccionOError(db, office, id);
  db.prepare('UPDATE colecciones SET estado = ?, actualizado_en = ? WHERE id = ?').run(
    estado,
    nowIso(),
    id,
  );
  registrarCambio(
    db,
    office,
    'coleccion',
    String(id),
    estado === 'archivada' ? 'archivó la colección' : 'restauró la colección',
    c.nombre,
  );
  return coleccionOError(db, office, id);
}
