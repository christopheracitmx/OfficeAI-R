// Contratos del runner: la interfaz común de motor y las definiciones de agentes.

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
  /** Una herramienta devolvió quota_exceeded (cuota de un servicio externo). */
  cuota_agotada?: boolean;
  /** Tokens consumidos en el paso (si el motor lo informa). */
  tokens?: number;
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
  /** Para tests: variables extra del proceso hijo. */
  env?: NodeJS.ProcessEnv | undefined;
}

export const NOMBRE_MCP = 'acitmx-crm';
