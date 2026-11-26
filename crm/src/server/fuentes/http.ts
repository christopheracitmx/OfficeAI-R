import type { CtxFuente } from './tipos';

export class ErrorFuente extends Error {
  constructor(
    mensaje: string,
    public readonly estado?: number,
  ) {
    super(mensaje);
  }
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Quita secretos (token en la URL) de cualquier texto que vaya a un log, un error o la UI. */
export const sinSecretos = (texto: string, secretos: string[]): string =>
  secretos.filter(Boolean).reduce((t, s) => t.split(s).join('***'), texto);

export interface OpcionesPedir {
  init?: RequestInit;
  /** Intentos totales (reintentos acotados). */
  intentos?: number;
  timeoutMs?: number;
  /** Espera tras 429/406/5xx antes de reintentar. */
  esperaMs?: number;
  secretos?: string[];
}

/** GET/POST JSON con timeout, reintentos acotados y errores sin secretos. NO cuenta cuota (lo hace el adaptador). */
export async function pedirJson(
  ctx: CtxFuente,
  url: string,
  o: OpcionesPedir = {},
): Promise<unknown> {
  const f = ctx.fetchFn ?? fetch;
  const esperar = ctx.esperar ?? dormir;
  const intentos = Math.max(1, o.intentos ?? 2);
  const secretos = o.secretos ?? [];
  let ultimo = 'sin respuesta';
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await f(url, { ...o.init, signal: AbortSignal.timeout(o.timeoutMs ?? 30000) });
      if (res.ok) return await res.json();
      ultimo = `HTTP ${res.status}`;
      // Errores que no mejoran reintentando: se corta de inmediato.
      if (res.status === 401 || res.status === 403 || res.status === 404)
        throw new ErrorFuente(ultimo, res.status);
      if (i < intentos) await esperar(o.esperaMs ?? 30000);
    } catch (e) {
      if (e instanceof ErrorFuente)
        throw new ErrorFuente(sinSecretos(e.message, secretos), e.estado);
      ultimo = sinSecretos(e instanceof Error ? e.message : String(e), secretos);
      if (i < intentos) await esperar(o.esperaMs ?? 30000);
    }
  }
  throw new ErrorFuente(`La fuente no respondió (${ultimo})`);
}
