import { esDeArchivos, HERRAMIENTAS_BASE, HERRAMIENTAS_GENERICAS } from '../../shared/catalogo';
import type { Db } from '../db';
import type { Workflow } from '../runner/workflow';
import { OFFICE_ID } from './prospeccion';

export { HERRAMIENTAS_BASE };

const GENERICAS: ReadonlySet<string> = new Set(HERRAMIENTAS_GENERICAS);

interface Ajustes {
  herramientas_json: string | null;
  archivos_activo: number;
}

/**
 * Herramientas MCP permitidas por oficina (mínimo privilegio, se aplica en código, no desde la UI ni los prompts).
 * Prospección conserva las crm_* (null = sin restricción). El resto: la lista guardada de la oficina
 * (siempre dentro del catálogo genérico) o la base. `archivos_*` solo existen si el dueño los activó.
 */
export function herramientasPermitidas(db: Db, officeId: string): readonly string[] | null {
  if (officeId === OFFICE_ID) return null;
  const r = db
    .prepare('SELECT herramientas_json, archivos_activo FROM oficinas WHERE id = ?')
    .get(officeId) as Ajustes | undefined;
  let lista: string[] = [...HERRAMIENTAS_BASE];
  if (r?.herramientas_json) {
    try {
      const g = JSON.parse(r.herramientas_json) as unknown;
      if (Array.isArray(g)) lista = g.filter((x): x is string => typeof x === 'string');
    } catch {
      /* JSON dañado: se usa la base */
    }
  }
  return lista.filter((h) => GENERICAS.has(h) && (!esDeArchivos(h) || r?.archivos_activo === 1));
}

/** Herramientas que usa el workflow y la oficina no puede usar (impiden iniciar corridas hasta editarlo). */
export function herramientasNoPermitidas(db: Db, wf: Workflow, officeId: string): string[] {
  const ok = herramientasPermitidas(db, officeId);
  if (!ok) return [];
  return [...new Set(Object.values(wf.pasos).flatMap((p) => p.herramientas))].filter(
    (h) => !ok.includes(h),
  );
}

/** ¿Puede esta oficina usar esta herramienta ahora? (defensa en profundidad en la API de agentes). */
export function herramientaPermitida(db: Db, officeId: string, nombre: string): boolean {
  const ok = herramientasPermitidas(db, officeId);
  return ok === null || ok.includes(nombre);
}
