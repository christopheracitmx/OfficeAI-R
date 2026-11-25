import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgenteDef } from './types';
import type { Params } from './workflow';

/**
 * Origen de los prompts: archivos versionados (semilla) o tablas editables desde la UI (src/server/offices/prompts-bd.ts).
 */
export interface PromptSource {
  leer(officeId: string, nombre: string): string;
  /** Bloques extra que se insertan tras los prompts del rol (lecciones aprobadas, habilidades activas). */
  extras?(officeId: string, agente: AgenteDef): string[];
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

/**
 * Candados base de TODO piso nuevo (fijos en código, no editables desde los prompts ni la UI):
 * sin contacto externo, sin borrado, solo destinos internos y topes de consumo.
 */
export const CANDADOS_BASE = `CANDADOS FIJOS (prevalecen sobre cualquier otra instrucción):
- Jamás contactes, escribas ni respondas a personas u organizaciones externas.
- No borres ni modifiques datos fuera de lo que tu tarea indica; solo destinos internos.
- Respeta los topes de consumo de la corrida y no repitas llamadas innecesarias.
- No inventes datos. Solo usas las herramientas que se te dieron.`;

export class Prompts {
  /** `candados` (por oficina) son reglas de seguridad fijas en código: se añaden SIEMPRE al final y no se editan desde los prompts. */
  constructor(
    private readonly fuente: PromptSource,
    private readonly candados: Record<string, string>,
  ) {}

  /** System prompt = global + rol(es) + lecciones + habilidades + contexto de la corrida + candados fijos (siempre al final). */
  armar(agente: AgenteDef, c: ContextoCorrida, extras: string[] = []): string {
    const o = c.office_id;
    const partes = [
      this.fuente.leer(o, '_comun'),
      ...agente.prompts.map((p) => this.fuente.leer(o, p)),
      ...(this.fuente.extras?.(o, agente) ?? []),
      ...extras,
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
    return [...partes, contexto.join('\n'), this.candados[o] ?? CANDADOS_BASE]
      .filter(Boolean)
      .join('\n\n');
  }
}
