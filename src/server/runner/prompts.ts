import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgenteDef } from './types';
import type { Params } from './workflow';

/**
 * Origen de los prompts. Hoy son archivos versionados (config/offices/<oficina>/agents/*.md);
 * en P6 se reemplaza por una tabla editable desde la UI sin tocar el motor.
 */
export interface PromptSource {
  leer(officeId: string, nombre: string): string;
}

export class ArchivosPrompts implements PromptSource {
  private cache = new Map<string, string>();
  constructor(private readonly dirOficinas: string) {}
  leer(officeId: string, nombre: string): string {
    const k = `${officeId}/${nombre}`;
    let t = this.cache.get(k);
    if (t === undefined) {
      t = readFileSync(join(this.dirOficinas, officeId, 'agents', `${nombre}.md`), 'utf8').trim();
      this.cache.set(k, t);
    }
    return t;
  }
}

export interface ContextoCorrida {
  id: number;
  office_id: string;
  params: Params;
}

export class Prompts {
  /** `candados` (por oficina) son reglas de seguridad fijas en código: se añaden SIEMPRE al final y no se editan desde los prompts. */
  constructor(
    private readonly fuente: PromptSource,
    private readonly candados: Record<string, string>,
  ) {}

  /** System prompt = bloque común + rol(es) + contexto de la corrida + candados fijos. */
  armar(agente: AgenteDef, c: ContextoCorrida): string {
    const o = c.office_id;
    const partes = [
      this.fuente.leer(o, '_comun'),
      ...agente.prompts.map((p) => this.fuente.leer(o, p)),
    ];
    const params = Object.entries(c.params)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ');
    const contexto = [
      `CONTEXTO DE LA CORRIDA #${c.id} (${o}): ${params}. Tu nombre en el CRM es ${agente.id}.`,
    ];
    if (agente.roles.length > 1)
      contexto.push(
        `Este paso AGRUPA los roles ${agente.roles.join(' y ')}: haz cada uno en ese orden dentro de esta misma tarea y guarda lo que corresponda a cada rol con su herramienta.`,
      );
    return [...partes, contexto.join('\n'), this.candados[o] ?? ''].filter(Boolean).join('\n\n');
  }
}
