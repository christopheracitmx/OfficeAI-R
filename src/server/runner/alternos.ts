import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITE_RE } from './claude';
import { ejecutarProceso, type ResultadoProceso } from './proceso';
import {
  NOMBRE_MCP,
  type ContextoMotor,
  type EjecutarAgenteFn,
  type EjecutarAgenteInput,
  type ResultadoAgente,
} from './types';

/**
 * Adaptadores OpenCode y Gemini. NO están verificados en vivo (spike-runner.md): solo se probó
 * la construcción de argumentos y la lectura de errores con un CLI simulado. Úsalos como punto de
 * partida cuando cambies de motor y ajusta aquí si el CLI real difiere.
 */
export const VERIFICADO = { 'claude-code': true, opencode: false, gemini: false } as const;

const textoCompleto = (i: EjecutarAgenteInput): string =>
  `${i.prompt}\n\n---\nTAREA:\n${i.mensaje}`;

export function argsOpencode(ctx: ContextoMotor, i: EjecutarAgenteInput): string[] {
  return [
    ...(ctx.binArgs ?? []),
    'run',
    '--format',
    'json',
    '--auto',
    ...(ctx.modelo ? ['--model', ctx.modelo] : []),
    textoCompleto(i),
  ];
}

/** Configuración inline de OpenCode con SOLO el MCP del CRM (variable OPENCODE_CONFIG_CONTENT). */
export function configOpencode(ctx: ContextoMotor, i: EjecutarAgenteInput): string {
  return JSON.stringify({
    mcp: {
      [NOMBRE_MCP]: {
        type: 'local',
        command: [ctx.mcp.command, ...ctx.mcp.args],
        environment: i.mcpEnv,
        enabled: true,
      },
    },
  });
}

export function argsGemini(ctx: ContextoMotor, i: EjecutarAgenteInput): string[] {
  return [
    ...(ctx.binArgs ?? []),
    '-p',
    textoCompleto(i),
    '--output-format',
    'json',
    '--yolo',
    ...(ctx.modelo ? ['--model', ctx.modelo] : []),
  ];
}

/** Gemini lee los MCP de `.gemini/settings.json` del directorio de trabajo. */
export function escribirAjustesGemini(ctx: ContextoMotor, i: EjecutarAgenteInput): string {
  const dir = join(ctx.workDir, `gemini-${i.agente.id}`);
  mkdirSync(join(dir, '.gemini'), { recursive: true });
  writeFileSync(
    join(dir, '.gemini', 'settings.json'),
    JSON.stringify({
      mcpServers: {
        [NOMBRE_MCP]: { command: ctx.mcp.command, args: ctx.mcp.args, env: i.mcpEnv, trust: true },
      },
    }),
  );
  return dir;
}

export function resultadoGenerico(out: ResultadoProceso, i: EjecutarAgenteInput): ResultadoAgente {
  if (out.abortado)
    return { ok: false, salida: '', abortado: true, error: 'Detenido por el dueño' };
  if (out.timeout)
    return { ok: false, salida: out.stdout.slice(-300), timeout: true, error: 'Tiempo agotado' };
  if (out.errorLanzamiento)
    return { ok: false, salida: '', error: `No se pudo lanzar el CLI: ${out.errorLanzamiento}` };
  const cuota = out.stdout.includes('quota_exceeded');
  const resumen = out.stdout.trim().split('\n').pop()?.slice(0, 500) ?? '';
  if (out.codigo === 0)
    return { ok: true, salida: resumen, ...(cuota ? { cuota_agotada: true } : {}) };
  const detalle = `${out.stderr}\n${out.stdout}`.slice(-400);
  const limite = LIMITE_RE.test(detalle) || /resource.?exhausted|\b429\b/i.test(detalle);
  return {
    ok: false,
    salida: resumen,
    error: `${i.agente.id}: el CLI terminó con código ${String(out.codigo)}: ${detalle.trim().slice(-200)}`,
    ...(limite ? { limite_plan: true } : {}),
    ...(cuota ? { cuota_agotada: true } : {}),
  };
}

export function crearAdaptadorOpencode(ctx: ContextoMotor): EjecutarAgenteFn {
  return async (i) => {
    mkdirSync(ctx.workDir, { recursive: true });
    const out = await ejecutarProceso({
      bin: ctx.bin ?? 'opencode',
      args: argsOpencode(ctx, i),
      cwd: ctx.workDir,
      env: { ...process.env, ...ctx.env, OPENCODE_CONFIG_CONTENT: configOpencode(ctx, i) },
      timeoutMs: i.timeout,
      signal: i.signal,
    });
    return resultadoGenerico(out, i);
  };
}

export function crearAdaptadorGemini(ctx: ContextoMotor): EjecutarAgenteFn {
  return async (i) => {
    const cwd = escribirAjustesGemini(ctx, i);
    const out = await ejecutarProceso({
      bin: ctx.bin ?? 'gemini',
      args: argsGemini(ctx, i),
      cwd,
      env: { ...process.env, ...ctx.env },
      timeoutMs: i.timeout,
      signal: i.signal,
    });
    return resultadoGenerico(out, i);
  };
}
