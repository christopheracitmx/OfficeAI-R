/**
 * Proveedores de IA seleccionables a mano (sin ruteo automático): Claude (CLI, plan Pro), Gemini y OpenCode Go
 * (API con llave en .env). Detecta si hay llave y qué modelos ofrece cada una.
 */
export type ProveedorId = 'claude' | 'gemini' | 'opencode_go';
export const PROVEEDORES_IDS: readonly ProveedorId[] = ['claude', 'gemini', 'opencode_go'];

export const MODELO_CLAUDE = 'claude-sonnet-5-5';

export interface ProveedorDef {
  id: ProveedorId;
  nombre: string;
  /** Variable de .env con la llave (null = sin llave: usa la sesión del CLI). */
  envKey: string | null;
  /** URL base compatible con chat/completions de OpenAI (solo los de API). */
  baseUrl: string | null;
  nota: string;
}

export const PROVEEDORES: Record<ProveedorId, ProveedorDef> = {
  claude: {
    id: 'claude',
    nombre: 'Claude (plan Pro)',
    envKey: null,
    baseUrl: null,
    nota: 'Usa tu sesión de Claude Code. Solo el modelo Sonnet.',
  },
  gemini: {
    id: 'gemini',
    nombre: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    nota: 'Llave de Google AI Studio. La capa gratuita tiene límites por minuto y por día; si pagas después, la misma llave habilita más modelos.',
  },
  opencode_go: {
    id: 'opencode_go',
    nombre: 'OpenCode Go',
    envKey: 'OPENCODE_API_KEY',
    baseUrl: 'https://opencode.ai/inference/go/v1',
    nota: 'Suscripción Go ($10/mes): una bolsa de uso compartida entre sus modelos.',
  },
};

export interface ModeloInfo {
  id: string;
  nombre: string;
  contexto?: number | undefined;
  /** Límite mensual en USD del plan (OpenCode Go), si la API lo informa. */
  limite_mensual_usd?: number | undefined;
}

export interface EstadoProveedor {
  id: ProveedorId;
  nombre: string;
  nota: string;
  /** Variable de .env que debe contener la llave. */
  env_key: string | null;
  conectado: boolean;
  motivo?: string;
}

const llave = (env: NodeJS.ProcessEnv, p: ProveedorDef): string =>
  p.envKey ? (env[p.envKey] ?? '').trim() : '';

export function claveDe(env: NodeJS.ProcessEnv, id: ProveedorId): string {
  return llave(env, PROVEEDORES[id]);
}

/** ¿Hay llave configurada? (Claude siempre figura conectado: su sesión la valida el diagnóstico.) Nunca devuelve la llave. */
export function estadoProveedores(env: NodeJS.ProcessEnv): EstadoProveedor[] {
  return PROVEEDORES_IDS.map((id) => {
    const p = PROVEEDORES[id];
    const conectado = p.envKey === null ? true : llave(env, p) !== '';
    return {
      id,
      nombre: p.nombre,
      nota: p.nota,
      env_key: p.envKey,
      conectado,
      ...(conectado ? {} : { motivo: `Falta ${p.envKey} en crm\\.env` }),
    };
  });
}

type FetchFn = typeof fetch;

async function pedirJson(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
): Promise<{ status: number; json: unknown }> {
  const r = await fetchFn(url, { ...init, signal: AbortSignal.timeout(20_000) });
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return { status: r.status, json };
}

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' ? (x as Record<string, unknown>) : {};

/** Modelos de texto/chat con herramientas que la llave puede usar (consulta en vivo a la API del proveedor). */
export async function listarModelos(
  id: ProveedorId,
  env: NodeJS.ProcessEnv,
  fetchFn: FetchFn = fetch,
): Promise<ModeloInfo[]> {
  if (id === 'claude') return [{ id: MODELO_CLAUDE, nombre: 'Claude Sonnet 5.5' }];
  const key = claveDe(env, id);
  if (!key) throw new Error(`Falta ${PROVEEDORES[id].envKey} en crm\\.env`);
  if (id === 'gemini') {
    const out: ModeloInfo[] = [];
    let token = '';
    for (let i = 0; i < 5; i++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
      const { status, json } = await pedirJson(fetchFn, url, {
        headers: { 'x-goog-api-key': key },
      });
      if (status === 400 || status === 401 || status === 403)
        throw new Error('Google rechazó la llave (revisa GEMINI_API_KEY)');
      if (status !== 200) throw new Error(`Google respondió ${status}`);
      const j = obj(json);
      for (const m of (Array.isArray(j['models']) ? j['models'] : []) as unknown[]) {
        const mo = obj(m);
        const metodos = Array.isArray(mo['supportedGenerationMethods'])
          ? (mo['supportedGenerationMethods'] as string[])
          : [];
        const nombreCompleto = String(mo['name'] ?? '');
        const mid = nombreCompleto.replace(/^models\//, '');
        if (!metodos.includes('generateContent') || !/^gemini/i.test(mid)) continue;
        if (/embedding|aqa|imagen|tts|image|live|vision-only/i.test(mid)) continue;
        out.push({
          id: mid,
          nombre: String(mo['displayName'] ?? mid),
          contexto: typeof mo['inputTokenLimit'] === 'number' ? mo['inputTokenLimit'] : undefined,
        });
      }
      token = typeof j['nextPageToken'] === 'string' ? j['nextPageToken'] : '';
      if (!token) break;
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }
  // OpenCode Go
  const { status, json } = await pedirJson(fetchFn, `${PROVEEDORES.opencode_go.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'OfficeAI-R' },
  });
  if (status === 401 || status === 403)
    throw new Error('OpenCode rechazó la llave (revisa OPENCODE_API_KEY)');
  if (status !== 200) throw new Error(`OpenCode respondió ${status}`);
  const datos = obj(json)['data'];
  const lista: ModeloInfo[] = [];
  for (const m of (Array.isArray(datos) ? datos : []) as unknown[]) {
    const mo = obj(m);
    const tipo = mo['type'];
    if (typeof tipo === 'string' && tipo !== 'chat') continue;
    const mid = String(mo['id'] ?? '');
    if (!mid) continue;
    const limite = obj(mo['limit'])['context'];
    const mensual = obj(mo['go'])['monthly_usage'];
    lista.push({
      id: mid,
      nombre: String(mo['name'] ?? mid),
      contexto: typeof limite === 'number' ? limite : undefined,
      limite_mensual_usd: typeof mensual === 'number' ? mensual : undefined,
    });
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
