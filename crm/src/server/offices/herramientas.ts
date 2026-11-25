import type { Workflow } from '../runner/workflow';
import { OFFICE_ID } from './prospeccion';

/**
 * Herramientas MCP permitidas por oficina (mínimo privilegio, se aplica en código, no desde la UI).
 * Prospección conserva las crm_* actuales (null = sin restricción); el resto de oficinas solo
 * Biblioteca (kb_*), lectura web (obscura_extract) y aviso interno.
 */
export const HERRAMIENTAS_BASE: readonly string[] = [
  'kb_buscar',
  'kb_leer',
  'obscura_extract',
  'notificar_interno',
];

export function herramientasPermitidas(officeId: string): readonly string[] | null {
  return officeId === OFFICE_ID ? null : HERRAMIENTAS_BASE;
}

/** Herramientas que usa el workflow y la oficina no puede usar (impiden iniciar corridas hasta editarlo). */
export function herramientasNoPermitidas(wf: Workflow, officeId: string): string[] {
  const ok = herramientasPermitidas(officeId);
  if (!ok) return [];
  return [...new Set(Object.values(wf.pasos).flatMap((p) => p.herramientas))].filter(
    (h) => !ok.includes(h),
  );
}
