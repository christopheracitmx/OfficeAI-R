import type { Db } from '../db';
import { nowIso } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

/** Nombre del prompt global (bloque común) dentro del workflow; vive en la tabla prompt_global. */
export const GLOBAL = '_comun';

export const estimarTokens = (t: string): number => Math.ceil(t.length / 3.6);

export interface VersionPrompt {
  version: number;
  texto: string;
  nota: string | null;
  activo: number;
  creado_en: string;
}

export function versionesPrompt(db: Db, office: string, prompt: string): VersionPrompt[] {
  return (
    prompt === GLOBAL
      ? db
          .prepare(
            'SELECT version, texto, nota, activo, creado_en FROM prompt_global WHERE office_id = ? ORDER BY version DESC',
          )
          .all(office)
      : db
          .prepare(
            'SELECT version, texto, nota, activo, creado_en FROM prompts_agente WHERE office_id = ? AND prompt = ? ORDER BY version DESC',
          )
          .all(office, prompt)
  ) as VersionPrompt[];
}

export function promptActivo(db: Db, office: string, prompt: string): string | undefined {
  const fila = (
    prompt === GLOBAL
      ? db.prepare('SELECT texto FROM prompt_global WHERE office_id = ? AND activo = 1').get(office)
      : db
          .prepare(
            'SELECT texto FROM prompts_agente WHERE office_id = ? AND prompt = ? AND activo = 1',
          )
          .get(office, prompt)
  ) as { texto: string } | undefined;
  return fila?.texto;
}

/** Guarda una versión nueva y la deja activa. Devuelve la versión creada. */
export function guardarPrompt(
  db: Db,
  office: string,
  prompt: string,
  texto: string,
  nota?: string,
): number {
  const g = prompt === GLOBAL;
  const tabla = g ? 'prompt_global' : 'prompts_agente';
  const filtro = g ? 'office_id = ?' : 'office_id = ? AND prompt = ?';
  const args = g ? [office] : [office, prompt];
  const tx = db.transaction(() => {
    const ultima =
      (
        db.prepare(`SELECT MAX(version) AS v FROM ${tabla} WHERE ${filtro}`).get(...args) as {
          v: number | null;
        }
      ).v ?? 0;
    db.prepare(`UPDATE ${tabla} SET activo = 0 WHERE ${filtro}`).run(...args);
    if (g)
      db.prepare(
        'INSERT INTO prompt_global (office_id, version, texto, nota, activo, creado_en) VALUES (?,?,?,?,1,?)',
      ).run(office, ultima + 1, texto, nota ?? null, nowIso());
    else
      db.prepare(
        'INSERT INTO prompts_agente (office_id, prompt, version, texto, nota, activo, creado_en) VALUES (?,?,?,?,?,1,?)',
      ).run(office, prompt, ultima + 1, texto, nota ?? null, nowIso());
    return ultima + 1;
  });
  const v = tx();
  registrarCambio(db, office, 'prompt', prompt, `guardó la versión ${v}`, nota);
  return v;
}

/** Rollback = nueva versión con el texto antiguo (el historial se conserva). */
export function restaurarPrompt(db: Db, office: string, prompt: string, version: number): number {
  const v = versionesPrompt(db, office, prompt).find((x) => x.version === version);
  if (!v) throw new KbError(404, 'Versión no encontrada');
  return guardarPrompt(db, office, prompt, v.texto, `Restaurada desde la versión ${version}`);
}

export interface FilaPrompt {
  prompt: string;
  version: number;
  largo: number;
  tokens: number;
  actualizado_en: string;
}

export function listarPrompts(db: Db, office: string): FilaPrompt[] {
  const filas = db
    .prepare(
      `SELECT prompt, version, texto, creado_en FROM prompts_agente WHERE office_id = ? AND activo = 1 ORDER BY prompt`,
    )
    .all(office) as { prompt: string; version: number; texto: string; creado_en: string }[];
  const g = db
    .prepare(
      'SELECT version, texto, creado_en FROM prompt_global WHERE office_id = ? AND activo = 1',
    )
    .get(office) as { version: number; texto: string; creado_en: string } | undefined;
  const todas = g ? [{ prompt: GLOBAL, ...g }, ...filas] : filas;
  return todas.map((f) => ({
    prompt: f.prompt,
    version: f.version,
    largo: f.texto.length,
    tokens: estimarTokens(f.texto),
    actualizado_en: f.creado_en,
  }));
}

/** Lecciones aprobadas (máx. 10 por agente, ~600 tokens). Vacío hasta P6.5. */
export function leccionesAprobadas(db: Db, office: string, agente: string): string {
  const ls = db
    .prepare(
      "SELECT tipo, texto FROM lecciones WHERE office_id = ? AND agente = ? AND estado = 'aprobada' ORDER BY id DESC LIMIT 10",
    )
    .all(office, agente) as { tipo: string; texto: string }[];
  let out = '';
  for (const l of ls) {
    const linea = `- ${l.tipo === 'error' ? 'EVITA' : 'REPITE'}: ${l.texto}\n`;
    if (estimarTokens(out + linea) > 600) break;
    out += linea;
  }
  return out ? `LECCIONES APROBADAS POR EL DUEÑO:\n${out.trim()}` : '';
}
