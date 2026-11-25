import { existsSync, readFileSync } from 'node:fs';
import { crearAdaptadorGemini, crearAdaptadorOpencode } from './alternos';
import { crearAdaptadorClaude } from './claude';
import { MOTORES, type ContextoMotor, type EjecutarAgenteFn, type Motor } from './types';

export interface ConfigRunner {
  engine: Motor;
  /** Ejecutable del CLI si no está en el PATH (opcional). */
  bin: string | undefined;
  modelo: string | undefined;
  /** Agrupa pasos baratos en una sola llamada al motor (ahorra plan). */
  agrupar_pasos: boolean;
  /** Esfuerzo de razonamiento (low | medium | high...). Bajo = menos tokens del plan. */
  esfuerzo: string | undefined;
  /** Capacidades externas apagadas (p. ej. `places`): sus pasos se omiten y su llave se vacía. */
  capacidades_off: string[];
  timeout_paso_min: number;
  max_minutos_corrida: number;
  max_fallos_seguidos: number;
}

/** Modelo base (plan Pro, bajo consumo). Se cambia en engine.yaml con `modelo:`. */
export const MODELO_BASE = 'claude-sonnet-5-5';

export const CONFIG_POR_DEFECTO: ConfigRunner = {
  engine: 'claude-code',
  bin: undefined,
  modelo: MODELO_BASE,
  agrupar_pasos: true,
  esfuerzo: 'low',
  capacidades_off: [],
  timeout_paso_min: 10,
  max_minutos_corrida: 240,
  max_fallos_seguidos: 3,
};

function valor(raw: string): string {
  return raw
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/** Lector mínimo de YAML plano (clave: valor). engine.yaml no necesita más. */
export function parsearEngineYaml(texto: string): ConfigRunner {
  const c: ConfigRunner = { ...CONFIG_POR_DEFECTO };
  const num = (v: string, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  let explicito = false;
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(linea);
    if (!m) continue;
    const k = m[1]!;
    const v = valor(m[2] ?? '');
    if (k === 'engine') {
      if (!(MOTORES as readonly string[]).includes(v))
        throw new Error(`engine.yaml: motor "${v}" no válido. Usa: ${MOTORES.join(' | ')}`);
      c.engine = v as Motor;
    } else if (k === 'bin') c.bin = v || undefined;
    else if (k === 'modelo') {
      c.modelo = v || undefined;
      explicito = true;
    } else if (k === 'agrupar_pasos') c.agrupar_pasos = v !== 'false';
    else if (k === 'esfuerzo') c.esfuerzo = v || undefined;
    else if (k === 'capacidades_off')
      c.capacidades_off = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    else if (k === 'timeout_paso_min') c.timeout_paso_min = num(v, c.timeout_paso_min);
    else if (k === 'max_minutos_corrida') c.max_minutos_corrida = num(v, c.max_minutos_corrida);
    else if (k === 'max_fallos_seguidos') c.max_fallos_seguidos = num(v, c.max_fallos_seguidos);
  }
  // El modelo base y el esfuerzo son de Claude Code; otros motores solo con valor explícito.
  if (c.engine !== 'claude-code') {
    if (!explicito) c.modelo = undefined;
    c.esfuerzo = undefined;
  }
  return c;
}

export function leerEngineYaml(ruta: string): ConfigRunner {
  if (!existsSync(ruta)) return { ...CONFIG_POR_DEFECTO };
  return parsearEngineYaml(readFileSync(ruta, 'utf8'));
}

/** Interfaz común: ejecutarAgente({agente, prompt, mensaje, mcpEnv, timeout}) → {ok, salida, limite_plan?}. */
export function crearEjecutor(cfg: ConfigRunner, ctx: ContextoMotor): EjecutarAgenteFn {
  const c: ContextoMotor = {
    ...ctx,
    bin: ctx.bin ?? cfg.bin,
    modelo: ctx.modelo ?? cfg.modelo,
    esfuerzo: ctx.esfuerzo ?? cfg.esfuerzo,
  };
  switch (cfg.engine) {
    case 'claude-code':
      return crearAdaptadorClaude(c);
    case 'opencode':
      return crearAdaptadorOpencode(c);
    case 'gemini':
      return crearAdaptadorGemini(c);
  }
}
