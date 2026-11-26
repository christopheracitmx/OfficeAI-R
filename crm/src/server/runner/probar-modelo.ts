import { chat } from './adaptador-api';
import { claveDe, type ProveedorId } from './proveedores';

export interface ResultadoPrueba {
  ok: boolean;
  ms: number;
  respuesta?: string;
  tokens?: number;
  /** ¿El modelo supo pedir una herramienta (llamada de función)? Imprescindible para los agentes. */
  herramientas?: boolean;
  error?: string;
}

const ECO = {
  type: 'function',
  function: {
    name: 'eco',
    description: 'Devuelve el texto recibido.',
    parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
};

/** Prueba mínima (2 llamadas cortas): responde y sabe usar herramientas. Sin datos del CRM. */
export async function probarModelo(
  proveedor: ProveedorId,
  modelo: string,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoPrueba> {
  const t0 = Date.now();
  if (proveedor === 'claude')
    return { ok: true, ms: 0, respuesta: 'Claude usa tu sesión de Claude Code (ver diagnóstico).' };
  if (!claveDe(env, proveedor)) return { ok: false, ms: 0, error: 'Falta la llave en crm\.env' };
  const c = { proveedor, modelo, env, fetchFn };
  const signal = AbortSignal.timeout(60_000);
  try {
    const a = await chat(
      c,
      [{ role: 'user', content: 'Responde únicamente con la palabra: LISTO' }],
      [],
      signal,
    );
    if (!a.mensaje) return { ok: false, ms: Date.now() - t0, error: a.error ?? `HTTP ${a.status}` };
    const b = await chat(
      c,
      [{ role: 'user', content: 'Llama a la herramienta eco con el texto "hola".' }],
      [ECO],
      signal,
    );
    return {
      ok: true,
      ms: Date.now() - t0,
      respuesta: (a.mensaje.content ?? '').trim().slice(0, 200),
      tokens: a.tokens + b.tokens,
      herramientas: (b.mensaje?.tool_calls?.length ?? 0) > 0,
      ...(b.mensaje ? {} : { error: `Prueba de herramientas: ${b.error ?? `HTTP ${b.status}`}` }),
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}
