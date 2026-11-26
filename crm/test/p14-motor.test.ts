import { describe, expect, it } from 'vitest';
import { crearDespachador } from '../src/server/runner/despachador';
import { chat } from '../src/server/runner/adaptador-api';
import { estadoProveedores, listarModelos } from '../src/server/runner/proveedores';
import { leerSeleccion } from '../src/server/services/motor-seleccion';
import { appFuentes, fetchSim, resp } from './p11-helpers';

const GEMINI = {
  models: [
    {
      name: 'models/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      inputTokenLimit: 1048576,
      supportedGenerationMethods: ['generateContent'],
    },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/text-bison', supportedGenerationMethods: ['generateContent'] },
  ],
};
const OPENCODE = {
  object: 'list',
  data: [
    {
      id: 'kimi-k3',
      name: 'Kimi K3',
      type: 'chat',
      limit: { context: 256000 },
      go: { monthly_usage: 15 },
    },
    { id: 'text-embedding-3-small', name: 'Embedding', type: 'embedding' },
  ],
};

describe('Motor de IA: proveedores y modelos', () => {
  it('detecta qué llaves hay sin mostrarlas; Claude siempre disponible', () => {
    const e = estadoProveedores({ GEMINI_API_KEY: 'secreto' });
    expect(e.map((p) => [p.id, p.conectado])).toEqual([
      ['claude', true],
      ['gemini', true],
      ['opencode_go', false],
    ]);
    expect(JSON.stringify(e)).not.toContain('secreto');
  });

  it('lista solo los modelos de Gemini con generateContent y los de chat de OpenCode Go', async () => {
    const g = fetchSim([() => resp(GEMINI)]);
    const m = await listarModelos('gemini', { GEMINI_API_KEY: 'k' }, g.fn);
    expect(m.map((x) => x.id)).toEqual(['gemini-2.5-flash']);
    expect(g.llamadas[0]!.url).toContain('generativelanguage.googleapis.com/v1beta/models');
    const o = fetchSim([() => resp(OPENCODE)]);
    const mo = await listarModelos('opencode_go', { OPENCODE_API_KEY: 'k' }, o.fn);
    expect(mo).toEqual([
      { id: 'kimi-k3', nombre: 'Kimi K3', contexto: 256000, limite_mensual_usd: 15 },
    ]);
    expect(o.llamadas[0]!.url).toBe('https://opencode.ai/inference/go/v1/models');
  });

  it('una llave rechazada da un error claro', async () => {
    const g = fetchSim([() => resp({ error: {} }, 403)]);
    await expect(listarModelos('gemini', { GEMINI_API_KEY: 'k' }, g.fn)).rejects.toThrow(/rechaz/);
  });

  it('API del dueño: lista, selecciona y rechaza modelos que la llave no tiene', async () => {
    const f = fetchSim([() => resp(GEMINI)]);
    const t = appFuentes({ env: { GEMINI_API_KEY: 'k' }, fetchFn: f.fn });
    const lista = (await t.dueno().get('/api/motor')).body;
    expect(lista.seleccion).toEqual({ proveedor: 'claude', modelo: 'claude-sonnet-5-5' });
    const gem = lista.proveedores.find((p: { id: string }) => p.id === 'gemini');
    expect(gem.modelos.map((m: { id: string }) => m.id)).toEqual(['gemini-2.5-flash']);
    expect(
      (await t.dueno().put('/api/motor/seleccion', { proveedor: 'opencode_go', modelo: 'x' }))
        .status,
    ).toBe(400);
    expect(
      (await t.dueno().put('/api/motor/seleccion', { proveedor: 'gemini', modelo: 'no-existe' }))
        .status,
    ).toBe(400);
    const ok = await t
      .dueno()
      .put('/api/motor/seleccion', { proveedor: 'gemini', modelo: 'gemini-2.5-flash' });
    expect(ok.body).toEqual({ proveedor: 'gemini', modelo: 'gemini-2.5-flash' });
    expect(leerSeleccion(t.db)).toEqual({ proveedor: 'gemini', modelo: 'gemini-2.5-flash' });
  });
});

describe('Despachador y adaptador de API', () => {
  const agente = {
    id: 'X',
    roles: ['X'],
    prompts: [],
    herramientas: [],
    webSearch: false,
    maxTurnos: 3,
  };
  const entrada = {
    officeId: 'prospeccion',
    agente,
    prompt: 'sys',
    mensaje: 'hola',
    mcpEnv: {},
    timeout: 5000,
  };
  const ctx = { workDir: '.', mcp: { command: 'node', args: [] } };

  it('con Claude seleccionado usa el motor de Claude; con Gemini, la API con el modelo elegido', async () => {
    const t = appFuentes({ env: {} });
    let claude = 0;
    const f = fetchSim([
      () =>
        resp({
          choices: [{ message: { role: 'assistant', content: 'listo' } }],
          usage: { total_tokens: 42 },
        }),
    ]);
    const d = crearDespachador({
      db: t.db,
      env: { GEMINI_API_KEY: 'k' },
      ctx,
      claude: async () => (claude++, { ok: true, salida: 'claude' }),
      fetchFn: f.fn,
    });
    expect((await d(entrada)).salida).toBe('claude');
    t.db
      .prepare(
        "INSERT INTO configuracion (clave, valor) VALUES ('motor_proveedor','gemini'),('motor_modelo','gemini-2.5-flash')",
      )
      .run();
    const r = await d(entrada);
    expect(r).toMatchObject({
      ok: true,
      salida: 'listo',
      tokens: 42,
      modelo_usado: 'gemini/gemini-2.5-flash',
    });
    expect(claude).toBe(1);
    const cuerpo = JSON.parse(String(f.llamadas[0]!.init!.body)) as { model: string };
    expect(cuerpo.model).toBe('gemini-2.5-flash');
    expect(f.llamadas[0]!.url).toContain('/v1beta/openai/chat/completions');
  });

  it('sin llave o sin modelo el paso falla con un mensaje claro, sin caer a Claude', async () => {
    const t = appFuentes({ env: {} });
    t.db
      .prepare("INSERT INTO configuracion (clave, valor) VALUES ('motor_proveedor','opencode_go')")
      .run();
    const d = crearDespachador({
      db: t.db,
      env: {},
      ctx,
      claude: async () => ({ ok: true, salida: 'claude' }),
    });
    expect((await d(entrada)).error).toContain('llave');
  });

  it('un 429 se reporta como límite de uso (no cambia de motor solo)', async () => {
    const f = fetchSim([() => resp({ error: { message: 'quota exceeded' } }, 429)]);
    const r = await chat(
      { proveedor: 'gemini', modelo: 'm', env: { GEMINI_API_KEY: 'k' }, fetchFn: f.fn },
      [{ role: 'user', content: 'x' }],
      [],
      AbortSignal.timeout(1000),
    );
    expect(r.status).toBe(429);
    expect(r.error).toContain('quota');
  });
});
