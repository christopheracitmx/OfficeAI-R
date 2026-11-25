import type { Db } from '../db';
import { nowIso } from '../db';
import type { KbDocInput } from '../../shared/cerebro';
import { registrarCambio } from './cambios';

export interface KbDoc {
  id: number;
  office_id: string;
  tipo: string;
  titulo: string;
  contenido_md: string;
  tags: string;
  activo: number;
  version: number;
  creado_en: string;
  actualizado_en: string;
}

export class KbError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const COLS =
  'id, office_id, tipo, titulo, contenido_md, tags, activo, version, creado_en, actualizado_en';

export function listarDocs(
  db: Db,
  office: string,
  f: { tipo?: string; q?: string; activo?: boolean } = {},
): unknown[] {
  const w = ['office_id = ?'];
  const p: (string | number)[] = [office];
  if (f.tipo) {
    w.push('tipo = ?');
    p.push(f.tipo);
  }
  if (f.activo !== undefined) {
    w.push('activo = ?');
    p.push(f.activo ? 1 : 0);
  }
  if (f.q) {
    w.push('(titulo LIKE ? OR contenido_md LIKE ? OR tags LIKE ?)');
    const l = `%${f.q}%`;
    p.push(l, l, l);
  }
  return db
    .prepare(
      `SELECT id, office_id, tipo, titulo, tags, activo, version, actualizado_en, length(contenido_md) AS largo FROM kb_documentos WHERE ${w.join(' AND ')} ORDER BY tipo, titulo`,
    )
    .all(...p);
}

export const leerDoc = (db: Db, id: number): KbDoc | undefined =>
  db.prepare(`SELECT ${COLS} FROM kb_documentos WHERE id = ?`).get(id) as KbDoc | undefined;

function snapshot(db: Db, d: KbDoc, nota?: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO kb_versiones (documento_id, version, titulo, contenido_md, tags, nota, creado_en) VALUES (?,?,?,?,?,?,?)',
  ).run(d.id, d.version, d.titulo, d.contenido_md, d.tags, nota ?? null, nowIso());
}

const duplicado = (e: unknown): boolean => e instanceof Error && /UNIQUE/.test(e.message);

export function crearDoc(db: Db, i: KbDocInput): KbDoc {
  const t = nowIso();
  try {
    const r = db
      .prepare(
        'INSERT INTO kb_documentos (office_id, tipo, titulo, contenido_md, tags, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?)',
      )
      .run(i.office_id, i.tipo, i.titulo, i.contenido_md, i.tags, t, t);
    const d = leerDoc(db, Number(r.lastInsertRowid))!;
    snapshot(db, d, i.nota ?? 'Versión inicial');
    registrarCambio(db, i.office_id, 'kb_documento', String(d.id), 'creó', d.titulo);
    return d;
  } catch (e) {
    if (duplicado(e)) throw new KbError(409, 'Ya existe un documento con ese título');
    throw e;
  }
}

type Parche = Partial<Pick<KbDocInput, 'tipo' | 'titulo' | 'contenido_md' | 'tags' | 'nota'>> & {
  activo?: boolean;
};

export function editarDoc(db: Db, id: number, p: Parche): KbDoc {
  const d = leerDoc(db, id);
  if (!d) throw new KbError(404, 'Documento no encontrado');
  const cambia =
    (p.contenido_md !== undefined && p.contenido_md !== d.contenido_md) ||
    (p.titulo !== undefined && p.titulo !== d.titulo) ||
    (p.tags !== undefined && p.tags !== d.tags);
  const n = {
    tipo: p.tipo ?? d.tipo,
    titulo: p.titulo ?? d.titulo,
    contenido_md: p.contenido_md ?? d.contenido_md,
    tags: p.tags ?? d.tags,
    activo: p.activo === undefined ? d.activo : p.activo ? 1 : 0,
    version: cambia ? d.version + 1 : d.version,
  };
  try {
    db.prepare(
      'UPDATE kb_documentos SET tipo=?, titulo=?, contenido_md=?, tags=?, activo=?, version=?, actualizado_en=? WHERE id=?',
    ).run(n.tipo, n.titulo, n.contenido_md, n.tags, n.activo, n.version, nowIso(), id);
  } catch (e) {
    if (duplicado(e)) throw new KbError(409, 'Ya existe un documento con ese título');
    throw e;
  }
  const nuevo = leerDoc(db, id)!;
  if (cambia) snapshot(db, nuevo, p.nota);
  const accion = p.activo === false ? 'archivó' : p.activo === true ? 'reactivó' : 'editó';
  registrarCambio(db, d.office_id, 'kb_documento', String(id), accion, nuevo.titulo);
  return nuevo;
}

export const versionesDoc = (db: Db, id: number): unknown[] =>
  db
    .prepare(
      'SELECT version, titulo, nota, creado_en, contenido_md FROM kb_versiones WHERE documento_id = ? ORDER BY version DESC',
    )
    .all(id);

/** Restaurar = crear una versión nueva con el contenido antiguo (el historial nunca se pierde). */
export function restaurarDoc(db: Db, id: number, version: number): KbDoc {
  const v = db
    .prepare(
      'SELECT titulo, contenido_md, tags FROM kb_versiones WHERE documento_id = ? AND version = ?',
    )
    .get(id, version) as { titulo: string; contenido_md: string; tags: string } | undefined;
  if (!v) throw new KbError(404, 'Versión no encontrada');
  return editarDoc(db, id, { ...v, nota: `Restaurada desde la versión ${version}` });
}
