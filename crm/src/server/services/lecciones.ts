import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import type { leccionInput, leccionPatch } from '../../shared/aprendizaje';
import { motivoLeccionInvalida, normalizarLeccion } from '../../shared/leccion-reglas';
import { registrarCambio } from './cambios';
import { KbError } from './kb';
import { estimarTokens } from './prompts-db';

export const MAX_APROBADAS_POR_AGENTE = 10;
export const MAX_TOKENS_LECCIONES = 600;

export interface Leccion {
  id: number;
  office_id: string;
  agente: string;
  tipo: 'acierto' | 'error';
  texto: string;
  evidencia: string | null;
  estado: 'propuesta' | 'aprobada' | 'archivada';
  origen: string;
  version: number;
  nota: string | null;
  creado_en: string;
  actualizado_en: string | null;
}

export interface EntradaHistorial {
  id: number;
  version: number;
  texto: string;
  estado: string;
  accion: string;
  nota: string | null;
  creado_en: string;
}

const leer = (db: Db, id: number): Leccion | undefined =>
  db.prepare('SELECT * FROM lecciones WHERE id = ?').get(id) as Leccion | undefined;

const existente = (db: Db, id: number): Leccion => {
  const l = leer(db, id);
  if (!l) throw new KbError(404, 'Lección no encontrada');
  return l;
};

function historia(db: Db, l: Leccion, accion: string, nota?: string): void {
  db.prepare(
    'INSERT INTO lecciones_historial (leccion_id, version, texto, estado, accion, nota, creado_en) VALUES (?,?,?,?,?,?,?)',
  ).run(l.id, l.version, l.texto, l.estado, accion, nota ?? null, nowIso());
}

/** Validación en servidor: sin precios, sin contacto externo, sin relajar candados. Lanza 422. */
export function validarTexto(texto: string): string {
  const t = normalizarLeccion(texto);
  const motivo = motivoLeccionInvalida(t);
  if (motivo) throw new KbError(422, `Lección rechazada: ${motivo}`);
  return t;
}

function agenteValido(db: Db, office: string, agente: string): void {
  if (!db.prepare('SELECT 1 FROM agentes WHERE office_id = ? AND id = ?').get(office, agente))
    throw new KbError(400, `Agente desconocido: ${agente}`);
}

export function crearLeccion(
  db: Db,
  i: z.infer<typeof leccionInput>,
  origen: 'manual' | 'reflexion' | 'automatica' = 'manual',
): Leccion {
  agenteValido(db, i.office_id, i.agente);
  const texto = validarTexto(i.texto);
  const ahora = nowIso();
  const id = Number(
    db
      .prepare(
        `INSERT INTO lecciones (office_id, agente, tipo, texto, evidencia, estado, origen, version, nota, creado_en, actualizado_en)
         VALUES (?,?,?,?,?,'propuesta',?,1,?,?,?)`,
      )
      .run(
        i.office_id,
        i.agente,
        i.tipo,
        texto,
        i.evidencia ? JSON.stringify(i.evidencia) : null,
        origen,
        i.nota ?? null,
        ahora,
        ahora,
      ).lastInsertRowid,
  );
  const l = existente(db, id);
  historia(db, l, 'creada', origen);
  registrarCambio(db, l.office_id, 'leccion', String(id), `propuso una lección (${origen})`, texto);
  return l;
}

export function editarLeccion(db: Db, id: number, p: z.infer<typeof leccionPatch>): Leccion {
  const l = existente(db, id);
  const agente = p.agente ?? l.agente;
  if (p.agente) agenteValido(db, l.office_id, p.agente);
  const texto = p.texto === undefined ? l.texto : validarTexto(p.texto);
  const cambio = texto !== l.texto || agente !== l.agente || (p.tipo ?? l.tipo) !== l.tipo;
  if (!cambio && p.nota === undefined) return l;
  // Editar una lección aprobada la devuelve a propuesta: el dueño debe volver a aprobarla.
  const estado = l.estado === 'aprobada' && cambio ? 'propuesta' : l.estado;
  db.prepare(
    'UPDATE lecciones SET texto=?, agente=?, tipo=?, nota=?, estado=?, version=version+?, actualizado_en=? WHERE id=?',
  ).run(texto, agente, p.tipo ?? l.tipo, p.nota ?? l.nota, estado, cambio ? 1 : 0, nowIso(), id);
  const n = existente(db, id);
  if (cambio) {
    historia(db, n, 'editada', estado !== l.estado ? 'volvió a propuesta' : undefined);
    registrarCambio(db, n.office_id, 'leccion', String(id), 'editó una lección', texto);
  }
  return n;
}

/** Tokens que ocuparían estas lecciones inyectadas (mismo formato que el compositor del prompt). */
export function tokensLecciones(textos: { tipo: string; texto: string }[]): number {
  return estimarTokens(
    textos.map((l) => `- ${l.tipo === 'error' ? 'EVITA' : 'REPITE'}: ${l.texto}\n`).join(''),
  );
}

export type AccionLeccion = 'aprobar' | 'descartar' | 'archivar' | 'reabrir';

export function cambiarEstado(db: Db, id: number, accion: AccionLeccion): Leccion {
  const l = existente(db, id);
  const ahora = nowIso();
  const poner = (estado: Leccion['estado'], etiqueta: string, nota?: string) => {
    db.prepare('UPDATE lecciones SET estado=?, actualizado_en=? WHERE id=?').run(estado, ahora, id);
    const n = existente(db, id);
    historia(db, n, etiqueta, nota);
    registrarCambio(db, n.office_id, 'leccion', String(id), `${etiqueta} una lección`, n.texto);
    return n;
  };
  if (accion === 'aprobar') {
    if (l.estado === 'aprobada') return l;
    validarTexto(l.texto); // defensa en profundidad: nada se inyecta sin pasar las reglas
    const activas = db
      .prepare(
        "SELECT id, tipo, texto FROM lecciones WHERE office_id=? AND agente=? AND estado='aprobada' AND id != ?",
      )
      .all(l.office_id, l.agente, id) as { id: number; tipo: string; texto: string }[];
    const fusiona = fusionadas(l);
    const quedan = activas.filter((a) => !fusiona.includes(a.id));
    if (quedan.length >= MAX_APROBADAS_POR_AGENTE)
      throw new KbError(
        409,
        `${l.agente} ya tiene ${MAX_APROBADAS_POR_AGENTE} lecciones aprobadas: archiva alguna antes de aprobar otra`,
      );
    if (tokensLecciones([...quedan, l]) > MAX_TOKENS_LECCIONES)
      throw new KbError(
        409,
        `Las lecciones de ${l.agente} superarían ~${MAX_TOKENS_LECCIONES} tokens: acorta o archiva alguna`,
      );
    return db.transaction(() => {
      for (const f of activas.filter((a) => fusiona.includes(a.id)))
        cambiarEstadoInterno(db, f.id, 'archivada', 'fusionada', `fusionada en #${id}`);
      return poner('aprobada', 'aprobó');
    })();
  }
  if (accion === 'reabrir') return poner('propuesta', 'reabrió');
  if (l.estado === 'archivada') return l;
  return poner('archivada', accion === 'descartar' ? 'descartó' : 'archivó');
}

function cambiarEstadoInterno(
  db: Db,
  id: number,
  estado: string,
  etiqueta: string,
  nota: string,
): void {
  db.prepare('UPDATE lecciones SET estado=?, actualizado_en=? WHERE id=?').run(
    estado,
    nowIso(),
    id,
  );
  historia(db, existente(db, id), etiqueta, nota);
}

/** Ids de lecciones aprobadas que esta propuesta fusiona (se archivan al aprobarla). */
export function fusionadas(l: Pick<Leccion, 'evidencia'>): number[] {
  if (!l.evidencia) return [];
  try {
    const f = (JSON.parse(l.evidencia) as { fusiona?: unknown }).fusiona;
    return Array.isArray(f) ? f.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

export interface FiltroLecciones {
  estado?: string | undefined;
  agente?: string | undefined;
  tipo?: string | undefined;
  origen?: string | undefined;
  q?: string | undefined;
}

export function listarLecciones(db: Db, office: string, f: FiltroLecciones = {}): Leccion[] {
  const where = ['office_id = ?'];
  const params: unknown[] = [office];
  for (const [col, v] of [
    ['estado', f.estado],
    ['agente', f.agente],
    ['tipo', f.tipo],
    ['origen', f.origen],
  ] as const)
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  if (f.q) {
    where.push('lower(texto) LIKE ?');
    params.push(`%${f.q.toLowerCase()}%`);
  }
  return db
    .prepare(`SELECT * FROM lecciones WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 500`)
    .all(...params) as Leccion[];
}

export const historialLeccion = (db: Db, id: number): EntradaHistorial[] => {
  existente(db, id);
  return db
    .prepare(
      'SELECT id, version, texto, estado, accion, nota, creado_en FROM lecciones_historial WHERE leccion_id = ? ORDER BY id DESC',
    )
    .all(id) as EntradaHistorial[];
};

/** Restaura el texto de una versión anterior (queda como propuesta: hay que volver a aprobarla). */
export function restaurarVersion(db: Db, id: number, version: number): Leccion {
  const h = db
    .prepare(
      'SELECT texto FROM lecciones_historial WHERE leccion_id = ? AND version = ? ORDER BY id DESC LIMIT 1',
    )
    .get(id, version) as { texto: string } | undefined;
  if (!h) throw new KbError(404, 'Versión no encontrada');
  return editarLeccion(db, id, { texto: h.texto, nota: `Restaurada desde la versión ${version}` });
}

export interface ConteoLecciones {
  propuestas: number;
  aprobadas: number;
  archivadas: number;
  por_agente: Record<string, { propuestas: number; aprobadas: number }>;
}

export function conteoLecciones(db: Db, office: string): ConteoLecciones {
  const filas = db
    .prepare(
      'SELECT agente, estado, COUNT(*) AS n FROM lecciones WHERE office_id = ? GROUP BY agente, estado',
    )
    .all(office) as { agente: string; estado: string; n: number }[];
  const out: ConteoLecciones = { propuestas: 0, aprobadas: 0, archivadas: 0, por_agente: {} };
  for (const f of filas) {
    if (f.estado === 'propuesta') out.propuestas += f.n;
    else if (f.estado === 'aprobada') out.aprobadas += f.n;
    else out.archivadas += f.n;
    const a = (out.por_agente[f.agente] ??= { propuestas: 0, aprobadas: 0 });
    if (f.estado === 'propuesta') a.propuestas += f.n;
    if (f.estado === 'aprobada') a.aprobadas += f.n;
  }
  return out;
}
