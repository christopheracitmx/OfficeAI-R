// Contratos del runner: la interfaz común de motor y las definiciones de agentes.
import type { InfoPlan } from './plan';

export type Motor = 'claude-code' | 'opencode' | 'gemini';
export const MOTORES: readonly Motor[] = ['claude-code', 'opencode', 'gemini'];

/** Un agente tal como lo lanza el runner (un paso puede agrupar a varios roles del roster). Lo define el workflow de cada oficina. */
export interface AgenteDef {
  /** Nombre CRM_AGENT con el que el MCP firma la actividad (debe estar en AGENTES). */
  id: string;
  /** Roles visibles en "Ver oficina" que participan en este paso. */
  roles: string[];
  /** Archivos de prompt en config/agents/ (sin extensión); se concatenan en orden. */
  prompts: string[];
  /** Herramientas MCP permitidas (CRM_TOOLS). */
  herramientas: string[];
  /** Si el motor debe darle su búsqueda web nativa. */
  webSearch: boolean;
  maxTurnos: number;
  maxLecturas?: number | undefined;
  /** Modelo de este paso (ahorro de plan). Sin valor usa el `modelo` de engine.yaml. */
  modelo?: string | undefined;
  /** Esfuerzo de este paso (low | medium | high). Sin valor usa el del motor. */
  esfuerzo?: string | undefined;
}

export interface ProgresoAgente {
  tipo: 'herramienta';
  nombre: string;
}

export interface EjecutarAgenteInput {
  /** Oficina a la que pertenece la corrida. */
  officeId: string;
  agente: AgenteDef;
  /** System prompt completo (bloque común + agente + contexto de corrida). */
  prompt: string;
  /** Mensaje de trabajo: solo ids y la tarea. */
  mensaje: string;
  /** Variables para el proceso MCP (CRM_AGENT, CRM_URL, CRM_TOOLS, ...). */
  mcpEnv: Record<string, string>;
  /** Milisegundos máximos del paso. */
  timeout: number;
  signal?: AbortSignal | undefined;
  onProgreso?: ((p: ProgresoAgente) => void) | undefined;
}

export interface ResultadoAgente {
  ok: boolean;
  /** Texto final del agente (resumen de una línea esperado). */
  salida: string;
  /** El motor reportó límite del plan/rate limit: el runner debe pausar, no reintentar. */
  limite_plan?: boolean;
  /** Epoch en segundos en que el motor dice que se libera el límite (si lo informa). */
  reset_en?: number;
  /** Estado de las ventanas del plan que emitió el CLI (rate_limit_event), si lo informó. */
  plan?: InfoPlan;
  /** El modelo exige créditos de uso que la cuenta no tiene (no es el límite del plan). */
  requiere_creditos?: boolean;
  /** Una herramienta devolvió quota_exceeded (cuota de un servicio externo). */
  cuota_agotada?: boolean;
  /** Tokens brutos del paso (suma de todo lo que reporta el motor, incluida la caché leída en cada turno). */
  tokens?: number;
  /** Consumo equivalente: entrada + salida + 1.25×caché escrita + 0.1×caché leída (refleja mejor el costo real). */
  tokens_ponderados?: number;
  /** Proveedor/modelo que realmente atendió el paso (motores de API); si falta se usa el del paso/engine.yaml. */
  modelo_usado?: string;
  timeout?: boolean;
  abortado?: boolean;
  error?: string;
  turnos?: number;
}

export type EjecutarAgenteFn = (i: EjecutarAgenteInput) => Promise<ResultadoAgente>;

/** Cómo lanzar el servidor MCP del CRM desde el motor. */
export interface McpLauncher {
  command: string;
  args: string[];
}

export interface ContextoMotor {
  /** Carpeta de trabajo aislada de los agentes (vacía, sin proyecto). */
  workDir: string;
  mcp: McpLauncher;
  /** Ejecutable del motor (por defecto el nombre del CLI). */
  bin?: string | undefined;
  /** Argumentos que van antes de los del motor (p. ej. el script de un CLI simulado). */
  binArgs?: string[] | undefined;
  modelo?: string | undefined;
  /** Esfuerzo de razonamiento del motor (bajo = menos tokens). */
  esfuerzo?: string | undefined;
  promptModo?: 'reemplazar' | 'agregar' | undefined;
  /** Para tests: variables extra del proceso hijo. */
  env?: NodeJS.ProcessEnv | undefined;
}

/** Modelos que acepta `claude --model` en el plan Pro (verificado con el CLI real; ver consumo-tokens.md). */
export const MODELOS_CLAUDE = [
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-fable-5-2',
] as const;

export const NOMBRE_MCP = 'acitmx-crm';
