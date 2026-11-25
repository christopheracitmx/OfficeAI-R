import type { Db } from '../db';
import type { EventBus } from '../services/events';
import type { CorridaFila, ValorProgreso } from './datos';
import type { ConfigRunner } from './motor';
import type { Prompts } from './prompts';
import type { EjecutarAgenteFn, Motor } from './types';
import type { Workflow } from './workflow';

export interface GanchoArgs {
  db: Db;
  itemId: number;
  corridaId: number;
  evento: (agente: string, accion: string, detalle?: string) => void;
}
/** Código propio de una oficina, referenciado por nombre desde su workflow (p. ej. cerrar y avisar). */
export type Gancho = (a: GanchoArgs) => Promise<void>;

export interface OficinaDef {
  workflow: Workflow;
  ganchos: Record<string, Gancho>;
  /** Herramientas MCP que la oficina puede usar (null = sin restricción). Se aplica en código. */
  herramientas?: readonly string[] | null;
}

export interface RunnerDeps {
  db: Db;
  bus: EventBus;
  ejecutar: EjecutarAgenteFn;
  prompts: Prompts;
  cfg: ConfigRunner;
  oficinas: Record<string, OficinaDef>;
  /** Variables para el proceso MCP de cada agente (URL del CRM, archivo del token...). */
  mcpEnvBase: Record<string, string>;
  /** Capacidades externas realmente disponibles (llave presente y no apagada). */
  capacidades: ReadonlySet<string>;
}

export interface Ejecucion {
  corrida: CorridaFila;
  oficina: OficinaDef;
  abort: AbortController;
  inicio: number;
  fallos: number;
  pasos: number;
  porClave: Map<string, number>;
  fase: string;
  item: { id: number; nombre?: string | undefined } | null;
  paso: string | null;
  cuotaAgotada: boolean;
  resumen: Record<string, number>;
  salidaPrevia: string;
  /** El dueño reanudó pese a la reserva: no se vuelve a pausar por ella en esta ejecución. */
  ignorarReserva: boolean;
}

export interface EstadoRunner {
  activo: boolean;
  office_id: string | null;
  corrida_id: number | null;
  motor: Motor;
  fase: string | null;
  item_actual: { id: number; nombre?: string | undefined } | null;
  paso_actual: string | null;
  pasos_ejecutados: number;
  pasos_max: number;
  fallos_seguidos: number;
  resumen: Record<string, number>;
  progreso: ValorProgreso[];
}
