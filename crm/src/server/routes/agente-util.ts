import type { Request } from 'express';
import { AGENTES } from '../../shared/domain';

/** Oficina que declara el proceso MCP del agente (x-office-id). */
export const oficinaAgente = (req: Request): string => req.header('x-office-id') || 'prospeccion';

/** Rutas de agente que sirven a cualquier oficina; todo lo demás (crm_*) es solo de prospección. */
export const RUTAS_COMUNES = /^\/(kb\/|actividad$|notificar$|coleccion\/|archivos\/)/;

export function agenteDe(req: Request): string {
  const n = req.header('x-agent-name') ?? '';
  if ((AGENTES as readonly string[]).includes(n)) return n;
  // Otras oficinas traen sus propios nombres de agente.
  return oficinaAgente(req) !== 'prospeccion' && /^[\w\- ]{1,40}$/.test(n) ? n : 'Coordinador';
}
