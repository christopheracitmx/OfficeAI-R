import {
  claveNormalizada,
  MAX_REGISTROS,
  validarDatos,
  type Datos,
  type RegistroInput,
} from '../../shared/colecciones';
import type { Db } from '../db';
import { nowIso } from '../db';
import { coleccionOError, type ColeccionFila } from './colecciones';
import { KbError } from './kb';

export interface RegistroFila {
  id: number;
  coleccion_id: number;
  datos: Datos;
  fuente_url: string | null;
  nota: string | null;
  estado: 'activo' | 'archivado';
  version: number;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
}

interface Cruda extends Omit<RegistroFila, 'datos'> {
  datos_json: string;
}

const aFila = ({ datos_json, ...r }: Cruda): RegistroFila => ({
  ...r,
  datos: JSON.parse(datos_json) as Datos,
});

export interface FiltroRegistros {
  q?: string | undefined;
  estado?: 'activo' | 'archivado' | 'todos' | undefined;
  limite?: number | undefined;
  desde?: number | undefined;
}

export function listarRegistros(
  db: Db,
  office: string,
  coleccionId: number,
  f: FiltroRegistros = {},
): { total: number; registros: RegistroFila[] } {
  coleccionOError(db, office, coleccionId);
  const donde = ['coleccion_id = ?', 'office_id = ?'];
  const args: unknown[] = [coleccionId, office];
  const estado = f.estado ?? 'activo';
  if (estado !== 'todos') {
    donde.push('estado = ?');
    args.push(estado);
  }
  if (f.q && f.q.trim()) {
    // Búsqueda literal sobre el JSON (LIKE con escape): sin SQL construido con texto del usuario.
    donde.push("datos_json LIKE ? ESCAPE '\\'");
    args.push(`%${f.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  const w = donde.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM coleccion_registros WHERE ${w}`).get(...args) as {
      n: number;
    }
  ).n;
  const filas = db
    .prepare(`SELECT * FROM coleccion_registros WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, Math.min(f.limite ?? 100, 500), Math.max(f.desde ?? 0, 0)) as Cruda[];
  return { total, registros: filas.map(aFila) };
}

function leerRegistro(db: Db, office: string, coleccionId: number, id: number): Cruda {
  const r = db
    .prepare(
      'SELECT * FROM coleccion_registros WHERE id = ? AND coleccion_id = ? AND office_id = ?',
    )
    .get(id, coleccionId, office) as Cruda | undefined;
  if (!r) throw new KbError(404, 'Registro no encontrado');
  return r;
}

interface Instantanea {
  id: number;
  version: number;
  datos_json: string;
  fuente_url: string | null;
  nota: string | null;
}

function historial(r: Instantanea, db: Db, accion: string, actor: string): void {
  db.prepare(
    'INSERT INTO coleccion_registros_hist (registro_id, version, datos_json, fuente_url, nota, accion, actor, creado_en) VALUES (?,?,?,?,?,?,?,?)',
  ).run(r.id, r.version, r.datos_json, r.fuente_url, r.nota, accion, actor, nowIso());
}

function validar(c: ColeccionFila, i: RegistroInput): Datos {
  if (!i.fuente_url && !(i.nota && i.nota.trim()))
    throw new KbError(422, 'Cada registro necesita su fuente (enlace) o una nota de origen');
  const v = validarDatos(c.campos, i.datos);
  if (!v.ok) throw new KbError(422, v.errores.join('; '));
  return v.datos;
}

export interface ResultadoUpsert {
  accion: 'creado' | 'actualizado' | 'sin_cambios';
  id: number;
  version: number;
}

/**
 * Crea o actualiza (deduplica por la clave de la colección). Si el registro existía archivado, se
 * reactiva. El historial conserva cada versión; nunca se borra físicamente.
 */
export function upsertRegistro(
  db: Db,
  office: string,
  coleccionId: number,
  i: RegistroInput,
  actor: string,
): ResultadoUpsert {
  const c = coleccionOError(db, office, coleccionId);
  if (c.estado !== 'activa') throw new KbError(409, 'La colección está archivada');
  const datos = validar(c, i);
  const json = JSON.stringify(datos);
  const clave = claveNormalizada(c.clave, datos);
  if (c.clave && clave === null) throw new KbError(422, `Falta el campo clave «${c.clave}»`);
  const fuente = i.fuente_url ?? null;
  const nota = i.nota ?? null;
  const t = nowIso();
  return db.transaction((): ResultadoUpsert => {
    const previo = clave
      ? (db
          .prepare('SELECT * FROM coleccion_registros WHERE coleccion_id = ? AND clave_valor = ?')
          .get(coleccionId, clave) as Cruda | undefined)
      : undefined;
    if (previo) {
      if (previo.datos_json === json && previo.estado === 'activo' && previo.fuente_url === fuente)
        return { accion: 'sin_cambios', id: previo.id, version: previo.version };
      const version = previo.version + 1;
      db.prepare(
        "UPDATE coleccion_registros SET datos_json=?, fuente_url=?, nota=?, estado='activo', version=?, actualizado_en=? WHERE id=?",
      ).run(json, fuente, nota, version, t, previo.id);
      historial(
        { id: previo.id, version, datos_json: json, fuente_url: fuente, nota },
        db,
        'actualizado',
        actor,
      );
      return { accion: 'actualizado', id: previo.id, version };
    }
    const n = (
      db
        .prepare('SELECT COUNT(*) AS n FROM coleccion_registros WHERE coleccion_id = ?')
        .get(coleccionId) as { n: number }
    ).n;
    if (n >= MAX_REGISTROS)
      throw new KbError(409, `Tope de ${MAX_REGISTROS} registros por colección`);
    const r = db
      .prepare(
        'INSERT INTO coleccion_registros (coleccion_id, office_id, datos_json, clave_valor, fuente_url, nota, creado_por, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(coleccionId, office, json, clave, fuente, nota, actor, t, t);
    const id = Number(r.lastInsertRowid);
    historial({ id, version: 1, datos_json: json, fuente_url: fuente, nota }, db, 'creado', actor);
    return { accion: 'creado', id, version: 1 };
  })();
}

/** Edición manual de un registro concreto por el dueño (misma validación; puede cambiar la clave). */
export function editarRegistro(
  db: Db,
  office: string,
  coleccionId: number,
  id: number,
  i: RegistroInput,
): ResultadoUpsert {
  const c = coleccionOError(db, office, coleccionId);
  const previo = leerRegistro(db, office, coleccionId, id);
  const datos = validar(c, i);
  const json = JSON.stringify(datos);
  const clave = claveNormalizada(c.clave, datos);
  if (c.clave && clave === null) throw new KbError(422, `Falta el campo clave «${c.clave}»`);
  const choque = clave
    ? db
        .prepare(
          'SELECT id FROM coleccion_registros WHERE coleccion_id = ? AND clave_valor = ? AND id != ?',
        )
        .get(coleccionId, clave, id)
    : undefined;
  if (choque) throw new KbError(409, 'Ya existe otro registro con esa clave');
  const version = previo.version + 1;
  const fuente = i.fuente_url ?? null;
  const nota = i.nota ?? null;
  db.transaction(() => {
    db.prepare(
      'UPDATE coleccion_registros SET datos_json=?, clave_valor=?, fuente_url=?, nota=?, version=?, actualizado_en=? WHERE id=?',
    ).run(json, clave, fuente, nota, version, nowIso(), id);
    historial({ id, version, datos_json: json, fuente_url: fuente, nota }, db, 'editado', 'dueño');
  })();
  return { accion: 'actualizado', id, version };
}

export function archivarRegistro(
  db: Db,
  office: string,
  coleccionId: number,
  id: number,
  archivar: boolean,
): void {
  const previo = leerRegistro(db, office, coleccionId, id);
  const version = previo.version + 1;
  db.transaction(() => {
    db.prepare(
      'UPDATE coleccion_registros SET estado=?, version=?, actualizado_en=? WHERE id=?',
    ).run(archivar ? 'archivado' : 'activo', version, nowIso(), id);
    historial({ ...previo, version }, db, archivar ? 'archivado' : 'restaurado', 'dueño');
  })();
}

export function historialRegistro(
  db: Db,
  office: string,
  coleccionId: number,
  id: number,
): unknown[] {
  leerRegistro(db, office, coleccionId, id);
  return db
    .prepare(
      'SELECT version, datos_json, fuente_url, nota, accion, actor, creado_en FROM coleccion_registros_hist WHERE registro_id = ? ORDER BY version DESC',
    )
    .all(id);
}
