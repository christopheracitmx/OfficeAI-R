import type { Db } from '../db';
import { nowIso } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export interface Habilidad {
  id: number;
  office_id: string;
  nombre: string;
  descripcion: string;
  contenido_md: string;
  activo: number;
  version: number;
  base: number;
  actualizado_en: string;
  agentes?: string[];
}

const duplicado = (e: unknown): boolean => e instanceof Error && /UNIQUE/.test(e.message);

export function listarHabilidades(db: Db, office: string): Habilidad[] {
  const hs = db
    .prepare('SELECT * FROM habilidades WHERE office_id = ? ORDER BY base DESC, nombre')
    .all(office) as Habilidad[];
  const asig = db
    .prepare('SELECT habilidad_id, agente FROM agente_habilidades WHERE office_id = ?')
    .all(office) as { habilidad_id: number; agente: string }[];
  return hs.map((h) => ({
    ...h,
    agentes: asig.filter((a) => a.habilidad_id === h.id).map((a) => a.agente),
  }));
}

const leer = (db: Db, id: number): Habilidad | undefined =>
  db.prepare('SELECT * FROM habilidades WHERE id = ?').get(id) as Habilidad | undefined;

function version(db: Db, h: Habilidad): void {
  db.prepare(
    'INSERT OR REPLACE INTO habilidades_versiones (habilidad_id, version, nombre, contenido_md, creado_en) VALUES (?,?,?,?,?)',
  ).run(h.id, h.version, h.nombre, h.contenido_md, nowIso());
}

export function crearHabilidad(
  db: Db,
  i: { office_id: string; nombre: string; descripcion: string; contenido_md: string },
  base = false,
): Habilidad {
  const t = nowIso();
  try {
    const r = db
      .prepare(
        'INSERT INTO habilidades (office_id, nombre, descripcion, contenido_md, base, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?)',
      )
      .run(i.office_id, i.nombre, i.descripcion, i.contenido_md, base ? 1 : 0, t, t);
    const h = leer(db, Number(r.lastInsertRowid))!;
    version(db, h);
    registrarCambio(db, i.office_id, 'habilidad', String(h.id), 'creó', h.nombre);
    return h;
  } catch (e) {
    if (duplicado(e)) throw new KbError(409, 'Ya existe una habilidad con ese nombre');
    throw e;
  }
}

export function editarHabilidad(
  db: Db,
  id: number,
  p: { nombre?: string; descripcion?: string; contenido_md?: string; activo?: boolean },
): Habilidad {
  const h = leer(db, id);
  if (!h) throw new KbError(404, 'Habilidad no encontrada');
  const cambia =
    (p.contenido_md !== undefined && p.contenido_md !== h.contenido_md) ||
    (p.nombre !== undefined && p.nombre !== h.nombre);
  try {
    db.prepare(
      'UPDATE habilidades SET nombre=?, descripcion=?, contenido_md=?, activo=?, version=?, actualizado_en=? WHERE id=?',
    ).run(
      p.nombre ?? h.nombre,
      p.descripcion ?? h.descripcion,
      p.contenido_md ?? h.contenido_md,
      p.activo === undefined ? h.activo : p.activo ? 1 : 0,
      cambia ? h.version + 1 : h.version,
      nowIso(),
      id,
    );
  } catch (e) {
    if (duplicado(e)) throw new KbError(409, 'Ya existe una habilidad con ese nombre');
    throw e;
  }
  const n = leer(db, id)!;
  if (cambia) version(db, n);
  registrarCambio(
    db,
    h.office_id,
    'habilidad',
    String(id),
    p.activo === undefined ? 'editó' : p.activo ? 'activó' : 'desactivó',
    n.nombre,
  );
  return n;
}

export const versionesHabilidad = (db: Db, id: number): unknown[] =>
  db
    .prepare(
      'SELECT version, nombre, contenido_md, creado_en FROM habilidades_versiones WHERE habilidad_id = ? ORDER BY version DESC',
    )
    .all(id);

export function restaurarHabilidad(db: Db, id: number, v: number): Habilidad {
  const x = db
    .prepare(
      'SELECT nombre, contenido_md FROM habilidades_versiones WHERE habilidad_id = ? AND version = ?',
    )
    .get(id, v) as { nombre: string; contenido_md: string } | undefined;
  if (!x) throw new KbError(404, 'Versión no encontrada');
  return editarHabilidad(db, id, x);
}

/** Asignación completa: reemplaza la lista de agentes de la habilidad. */
export function asignarHabilidad(db: Db, id: number, agentes: string[]): void {
  const h = leer(db, id);
  if (!h) throw new KbError(404, 'Habilidad no encontrada');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM agente_habilidades WHERE habilidad_id = ?').run(id);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO agente_habilidades (office_id, agente, habilidad_id) VALUES (?,?,?)',
    );
    for (const a of agentes) ins.run(h.office_id, a, id);
  });
  tx();
  registrarCambio(
    db,
    h.office_id,
    'habilidad',
    String(id),
    'asignó',
    agentes.join(', ') || '(nadie)',
  );
}

/** Habilidades activas para los roles de un paso, en texto para el prompt. Solo Markdown: nada se ejecuta. */
export function habilidadesParaPrompt(db: Db, office: string, agentes: string[]): string {
  if (agentes.length === 0) return '';
  const q = agentes.map(() => '?').join(',');
  const hs = db
    .prepare(
      `SELECT DISTINCT h.id, h.nombre, h.contenido_md FROM habilidades h
       JOIN agente_habilidades a ON a.habilidad_id = h.id
       WHERE h.office_id = ? AND h.activo = 1 AND a.agente IN (${q}) ORDER BY h.id`,
    )
    .all(office, ...agentes) as { nombre: string; contenido_md: string }[];
  if (hs.length === 0) return '';
  return `HABILIDADES (procedimientos de apoyo; son instrucciones, no código):\n${hs
    .map((h) => `### ${h.nombre}\n${h.contenido_md.trim()}`)
    .join('\n\n')}`;
}
