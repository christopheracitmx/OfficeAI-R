import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { claveDe, PROVEEDORES, type ProveedorId } from './proveedores';
import type {
  ContextoMotor,
  EjecutarAgenteFn,
  EjecutarAgenteInput,
  ResultadoAgente,
} from './types';

/**
 * Adaptador de motores por API compatible con OpenAI chat/completions (Gemini y OpenCode Go): bucle de agente
 * propio (modelo ↔ herramientas MCP del CRM). Mismos candados que con Claude: el proceso MCP filtra las
 * herramientas por CRM_TOOLS y la llave nunca llega al modelo ni al MCP.
 */
interface Mensaje {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' ? (x as Record<string, unknown>) : {};

/** Los esquemas JSON de MCP traen claves que algunos proveedores rechazan. */
export function limpiarEsquema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(limpiarEsquema);
  if (s && typeof s === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k === '$schema' || k === 'additionalProperties' || k === 'default') continue;
      o[k] = limpiarEsquema(v);
    }
    return o;
  }
  return s;
}

export interface LlamadaApi {
  proveedor: ProveedorId;
  modelo: string;
  env: NodeJS.ProcessEnv;
  fetchFn: typeof fetch;
}

export interface RespuestaChat {
  status: number;
  mensaje: Mensaje | null;
  tokens: number;
  error: string | undefined;
  reintentarEn: number | undefined;
}

export async function chat(
  c: LlamadaApi,
  mensajes: Mensaje[],
  tools: unknown[],
  signal: AbortSignal,
): Promise<RespuestaChat> {
  const p = PROVEEDORES[c.proveedor];
  const key = claveDe(c.env, c.proveedor);
  const r = await c.fetchFn(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'User-Agent': 'OfficeAI-R',
      'x-opencode-session': 'officeai-r',
    },
    body: JSON.stringify({
      model: c.modelo,
      messages: mensajes,
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    }),
  });
  let j: Record<string, unknown> = {};
  try {
    j = obj(await r.json());
  } catch {
    j = {};
  }
  const retry = Number(r.headers.get('retry-after'));
  if (r.status !== 200) {
    const e = obj(j['error']);
    const msg = String(e['message'] ?? j['message'] ?? `HTTP ${r.status}`);
    return {
      status: r.status,
      mensaje: null,
      tokens: 0,
      error: msg.slice(0, 300),
      reintentarEn: Number.isFinite(retry) && retry > 0 ? retry : undefined,
    };
  }
  const choice = obj((Array.isArray(j['choices']) ? j['choices'] : [])[0]);
  const m = obj(choice['message']);
  return {
    status: 200,
    mensaje: {
      role: 'assistant',
      content: typeof m['content'] === 'string' ? m['content'] : null,
      ...(Array.isArray(m['tool_calls'])
        ? { tool_calls: m['tool_calls'] as NonNullable<Mensaje['tool_calls']> }
        : {}),
    },
    tokens: Number(obj(j['usage'])['total_tokens']) || 0,
    error: undefined,
    reintentarEn: undefined,
  };
}

const esLimite = (status: number, msg: string): boolean =>
  status === 429 || /quota|rate.?limit|exhausted|too many|usage limit|insufficient/i.test(msg);

export function crearAdaptadorApi(
  ctx: ContextoMotor,
  sel: { proveedor: ProveedorId; modelo: string },
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch = fetch,
): EjecutarAgenteFn {
  return async (i: EjecutarAgenteInput): Promise<ResultadoAgente> => {
    const llamada: LlamadaApi = { ...sel, env, fetchFn };
    const abort = AbortSignal.any([
      ...(i.signal ? [i.signal] : []),
      AbortSignal.timeout(i.timeout),
    ]);
    let cliente: Client | null = null;
    let tokens = 0;
    let turnos = 0;
    const base = { modelo_usado: `${sel.proveedor}/${sel.modelo}` };
    try {
      let tools: unknown[] = [];
      if (i.agente.herramientas.length > 0) {
        cliente = new Client({ name: 'officeai-r-runner', version: '1.0.0' });
        await cliente.connect(
          new StdioClientTransport({
            command: ctx.mcp.command,
            args: ctx.mcp.args,
            env: { ...getDefaultEnvironment(), ...i.mcpEnv },
          }),
        );
        const lista = await cliente.listTools();
        tools = lista.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description ?? '',
            parameters: limpiarEsquema(t.inputSchema),
          },
        }));
      }
      const sinWeb = i.agente.webSearch
        ? '\n\nNOTA: en este motor no hay búsqueda web nativa; usa obscura_extract para leer páginas y las demás herramientas.'
        : '';
      const mensajes: Mensaje[] = [
        { role: 'system', content: i.prompt + sinWeb },
        { role: 'user', content: i.mensaje },
      ];
      let ultimo = '';
      for (let t = 0; t < Math.max(1, i.agente.maxTurnos); t++) {
        turnos++;
        const r = await chat(llamada, mensajes, tools, abort);
        tokens += r.tokens;
        if (!r.mensaje) {
          const msg = r.error ?? `HTTP ${r.status}`;
          if (esLimite(r.status, msg))
            return {
              ...base,
              ok: false,
              salida: ultimo,
              limite_plan: true,
              ...(r.reintentarEn
                ? { reset_en: Math.floor(Date.now() / 1000) + r.reintentarEn }
                : {}),
              error: `${sel.proveedor}: límite de uso (${msg})`,
              tokens,
              turnos,
            };
          return {
            ...base,
            ok: false,
            salida: ultimo,
            error:
              r.status === 401 || r.status === 403
                ? `${sel.proveedor}: llave rechazada (${msg})`
                : `${sel.proveedor}: ${msg}`,
            tokens,
            turnos,
          };
        }
        mensajes.push(r.mensaje);
        if (r.mensaje.content) ultimo = r.mensaje.content;
        const llamadas = r.mensaje.tool_calls ?? [];
        if (llamadas.length === 0 || !cliente) break;
        for (const tc of llamadas) {
          let args: Record<string, unknown> = {};
          try {
            args = obj(JSON.parse(tc.function.arguments || '{}'));
          } catch {
            args = {};
          }
          i.onProgreso?.({ tipo: 'herramienta', nombre: tc.function.name });
          let texto: string;
          try {
            const res = await cliente.callTool({ name: tc.function.name, arguments: args });
            const partes = Array.isArray(res.content) ? res.content : [];
            texto = partes.map((p) => String(obj(p)['text'] ?? '')).join('\n');
            if (res.isError) texto = `ERROR: ${texto}`;
          } catch (e) {
            texto = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
          }
          mensajes.push({ role: 'tool', tool_call_id: tc.id, content: texto.slice(0, 20000) });
        }
      }
      return { ...base, ok: true, salida: ultimo, tokens, turnos };
    } catch (e) {
      if (i.signal?.aborted)
        return { ...base, ok: false, salida: '', abortado: true, error: 'Detenido por el dueño' };
      if (abort.aborted)
        return {
          ...base,
          ok: false,
          salida: '',
          timeout: true,
          error: `Tiempo agotado (${Math.round(i.timeout / 1000)} s)`,
        };
      return {
        ...base,
        ok: false,
        salida: '',
        error: `${sel.proveedor}: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      try {
        await cliente?.close();
      } catch {
        /* ya cerrado */
      }
    }
  };
}
