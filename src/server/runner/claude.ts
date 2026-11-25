import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ejecutarProceso } from './proceso';
import {
  NOMBRE_MCP,
  type ContextoMotor,
  type EjecutarAgenteFn,
  type EjecutarAgenteInput,
  type ResultadoAgente,
} from './types';

/** Texto de error del CLI que indica límite del plan de suscripción (ver spike-runner.md). */
export const LIMITE_RE =
  /usage limit|limit reached|rate.?limit|too many requests|out of (extra )?usage|quota/i;

/** Escribe el JSON de --mcp-config con rutas bien escapadas (lo genera código, no a mano). */
export function escribirMcpConfig(ctx: ContextoMotor, i: EjecutarAgenteInput): string {
  mkdirSync(ctx.workDir, { recursive: true });
  const archivo = join(ctx.workDir, `mcp-${i.agente.id}.json`);
  writeFileSync(
    archivo,
    JSON.stringify({
      mcpServers: { [NOMBRE_MCP]: { command: ctx.mcp.command, args: ctx.mcp.args, env: i.mcpEnv } },
    }),
  );
  return archivo;
}

export function nombresHerramientas(i: EjecutarAgenteInput): string[] {
  const mcp = i.agente.herramientas.map((t) => `mcp__${NOMBRE_MCP}__${t}`);
  return i.agente.webSearch ? [...mcp, 'WebSearch'] : mcp;
}

/** Argumentos de `claude -p` verificados en el spike P5-1. El mensaje va por stdin. */
export function argsClaude(
  ctx: ContextoMotor,
  i: EjecutarAgenteInput,
  mcpConfig: string,
): string[] {
  return [
    ...(ctx.binArgs ?? []),
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--mcp-config',
    mcpConfig,
    '--strict-mcp-config',
    ctx.promptModo === 'agregar' ? '--append-system-prompt' : '--system-prompt',
    i.prompt,
    '--permission-mode',
    'dontAsk',
    '--max-turns',
    String(i.agente.maxTurnos),
    '--no-session-persistence',
    '--disable-slash-commands',
    '--setting-sources',
    '',
    ...(ctx.modelo ? ['--model', ctx.modelo] : []),
    ...(ctx.esfuerzo ? ['--effort', ctx.esfuerzo] : []),
    // Variádicos al final: se detienen en el siguiente flag o al agotarse los argumentos.
    '--tools',
    i.agente.webSearch ? 'WebSearch' : '',
    '--allowedTools',
    ...nombresHerramientas(i),
  ];
}

type Json = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const obj = (v: unknown): Json | null => (v && typeof v === 'object' ? (v as Json) : null);

export interface EstadoLectura {
  limite: boolean;
  resetEn: number | undefined;
  cuotaAgotada: boolean;
  resultado: Json | null;
  ultimoTexto: string;
  mcpFallo: boolean;
}

export const lecturaVacia = (): EstadoLectura => ({
  limite: false,
  resetEn: undefined,
  cuotaAgotada: false,
  resultado: null,
  ultimoTexto: '',
  mcpFallo: false,
});

/** Interpreta UNA línea del stream-json. Devuelve el nombre de la herramienta si el agente la invocó. */
export function leerLineaClaude(linea: string, st: EstadoLectura): string | null {
  let j: Json | null;
  try {
    j = obj(JSON.parse(linea));
  } catch {
    return null;
  }
  if (!j) return null;
  const tipo = j['type'];
  if (tipo === 'rate_limit_event') {
    const info = obj(j['rate_limit_info']);
    const estado = typeof info?.['status'] === 'string' ? info['status'] : 'allowed';
    if (estado !== 'allowed' && estado !== 'allowed_warning') {
      st.limite = true;
      if (typeof info?.['resetsAt'] === 'number') st.resetEn = info['resetsAt'];
    }
    return null;
  }
  if (tipo === 'system' && j['subtype'] === 'init') {
    const servers = j['mcp_servers'];
    if (Array.isArray(servers))
      st.mcpFallo = servers.some(
        (s) => obj(s)?.['name'] === NOMBRE_MCP && obj(s)?.['status'] === 'failed',
      );
    return null;
  }
  if (tipo === 'result') {
    st.resultado = j;
    return null;
  }
  const contenido = obj(j['message'])?.['content'];
  if (!Array.isArray(contenido)) return null;
  let herramienta: string | null = null;
  for (const b of contenido) {
    const bloque = obj(b);
    if (!bloque) continue;
    if (tipo === 'assistant' && bloque['type'] === 'text' && typeof bloque['text'] === 'string')
      st.ultimoTexto = bloque['text'];
    if (tipo === 'assistant' && bloque['type'] === 'tool_use' && typeof bloque['name'] === 'string')
      herramienta = bloque['name'].replace(`mcp__${NOMBRE_MCP}__`, '');
    if (
      tipo === 'user' &&
      bloque['type'] === 'tool_result' &&
      JSON.stringify(bloque).includes('quota_exceeded')
    )
      st.cuotaAgotada = true;
  }
  return herramienta;
}

export function resultadoClaude(
  st: EstadoLectura,
  codigo: number | null,
  stderr: string,
): ResultadoAgente {
  const r = st.resultado;
  const base = { ...(st.resetEn !== undefined ? { reset_en: st.resetEn } : {}) };
  const turnos = typeof r?.['num_turns'] === 'number' ? r['num_turns'] : undefined;
  const u = obj(r?.['usage']);
  const tokens = u
    ? ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']
        .map((k) => (typeof u[k] === 'number' ? u[k] : 0))
        .reduce((a, b) => a + b, 0)
    : undefined;
  const pond = u
    ? Math.round(
        num(u['input_tokens']) +
          num(u['output_tokens']) +
          1.25 * num(u['cache_creation_input_tokens']) +
          0.1 * num(u['cache_read_input_tokens']),
      )
    : undefined;
  const extra = {
    ...(tokens !== undefined ? { tokens } : {}),
    ...(pond !== undefined ? { tokens_ponderados: pond } : {}),
    ...(turnos !== undefined ? { turnos } : {}),
    ...(st.cuotaAgotada ? { cuota_agotada: true } : {}),
  };
  if (!r) {
    const msg =
      stderr.trim().slice(-300) || `El CLI terminó (código ${String(codigo)}) sin resultado`;
    const limite = st.limite || LIMITE_RE.test(msg);
    return {
      ok: false,
      salida: st.ultimoTexto,
      error: msg,
      ...(limite ? { limite_plan: true } : {}),
      ...base,
      ...extra,
    };
  }
  const texto = typeof r['result'] === 'string' ? r['result'] : st.ultimoTexto;
  const esError = r['is_error'] === true || r['subtype'] !== 'success';
  if (!esError && !st.mcpFallo) return { ok: true, salida: texto, ...extra };
  const errores = Array.isArray(r['errors']) ? r['errors'].join('; ') : '';
  const detalle = errores || texto || String(r['subtype']);
  const limite =
    st.limite ||
    r['api_error_status'] === 429 ||
    (r['is_error'] === true && LIMITE_RE.test(detalle));
  return {
    ok: false,
    salida: texto,
    error: st.mcpFallo ? 'El servidor MCP del CRM no arrancó' : detalle.slice(0, 300),
    ...(limite ? { limite_plan: true } : {}),
    ...base,
    ...extra,
  };
}

export function crearAdaptadorClaude(ctx: ContextoMotor): EjecutarAgenteFn {
  return async (i) => {
    const st = lecturaVacia();
    const mcpConfig = escribirMcpConfig(ctx, i);
    const out = await ejecutarProceso({
      bin: ctx.bin ?? 'claude',
      args: argsClaude(ctx, i, mcpConfig),
      cwd: ctx.workDir,
      env: { ...process.env, ...ctx.env },
      stdin: i.mensaje,
      timeoutMs: i.timeout,
      signal: i.signal,
      onLinea: (l) => {
        const h = leerLineaClaude(l, st);
        if (h) i.onProgreso?.({ tipo: 'herramienta', nombre: h });
      },
    });
    if (out.abortado)
      return { ok: false, salida: '', abortado: true, error: 'Detenido por el dueño' };
    if (out.timeout)
      return {
        ok: false,
        salida: st.ultimoTexto,
        timeout: true,
        error: `Tiempo agotado (${Math.round(i.timeout / 1000)} s)`,
      };
    if (out.errorLanzamiento)
      return { ok: false, salida: '', error: `No se pudo lanzar el CLI: ${out.errorLanzamiento}` };
    return resultadoClaude(st, out.codigo, out.stderr);
  };
}
