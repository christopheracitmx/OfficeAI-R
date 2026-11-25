import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsGemini, argsOpencode, configOpencode } from '../src/server/runner/alternos';
import {
  argsClaude,
  escribirMcpConfig,
  lecturaVacia,
  leerLineaClaude,
  resultadoClaude,
} from '../src/server/runner/claude';
import { leerEngineYaml, parsearEngineYaml } from '../src/server/runner/motor';
import type { ContextoMotor, EjecutarAgenteInput } from '../src/server/runner/types';

const ctx: ContextoMotor = {
  workDir: resolve('data/runner-test'),
  mcp: { command: 'C:\\x\\node.exe', args: ['C:\\x y\\cli.mjs', 'idx.ts'] },
  modelo: 'claude-sonnet-5-5',
  esfuerzo: 'low',
};
const entrada: EjecutarAgenteInput = {
  officeId: 'prospeccion',
  agente: {
    id: 'Rastreador',
    roles: ['Rastreador'],
    prompts: ['rastreador'],
    herramientas: ['obscura_extract', 'crm_actividad'],
    webSearch: true,
    maxTurnos: 30,
  },
  prompt: 'PROMPT "con comillas"\ny saltos',
  mensaje: 'empresa_id=1 — tarea',
  mcpEnv: { CRM_AGENT: 'Rastreador' },
  timeout: 1000,
};

describe('engine.yaml', () => {
  it('el archivo real del proyecto es válido y trae los valores esperados', () => {
    expect(leerEngineYaml(resolve('config/engine.yaml'))).toMatchObject({
      engine: 'claude-code',
      modelo: 'claude-sonnet-5-5',
      esfuerzo: 'low',
      agrupar_pasos: true,
      capacidades_off: [],
      timeout_paso_min: 10,
    });
  });
  it('trae Sonnet 5.5, esfuerzo bajo y agrupación por defecto', () => {
    const c = parsearEngineYaml('engine: claude-code\n');
    expect(c).toMatchObject({
      engine: 'claude-code',
      modelo: 'claude-sonnet-5-5',
      esfuerzo: 'low',
      agrupar_pasos: true,
    });
  });
  it('permite cambiar modelo, esfuerzo, topes y capacidades apagadas', () => {
    const c = parsearEngineYaml(
      'engine: claude-code # motor\nmodelo: claude-opus-x\nesfuerzo: medium\nagrupar_pasos: false\ncapacidades_off: places, otra\ntimeout_paso_min: 3\n',
    );
    expect(c).toMatchObject({ modelo: 'claude-opus-x', esfuerzo: 'medium', agrupar_pasos: false });
    expect(c.capacidades_off).toEqual(['places', 'otra']);
    expect(c.timeout_paso_min).toBe(3);
  });
  it('otros motores no heredan el modelo de Claude y rechazan motores desconocidos', () => {
    expect(parsearEngineYaml('engine: opencode\n').modelo).toBeUndefined();
    expect(parsearEngineYaml('engine: gemini\nmodelo: gemini-x\n').modelo).toBe('gemini-x');
    expect(() => parsearEngineYaml('engine: chatgpt\n')).toThrow(/no válido/);
  });
});

describe('adaptador claude-code (flags verificadas en el spike)', () => {
  it('construye los argumentos reales y deja el mensaje fuera (va por stdin)', () => {
    const a = argsClaude(ctx, entrada, 'mcp.json');
    for (const f of [
      '-p',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--disable-slash-commands',
    ])
      expect(a).toContain(f);
    expect(a[a.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(a[a.indexOf('--model') + 1]).toBe('claude-sonnet-5-5');
    expect(a[a.indexOf('--effort') + 1]).toBe('low');
    expect(a[a.indexOf('--max-turns') + 1]).toBe('30');
    expect(a[a.indexOf('--system-prompt') + 1]).toBe(entrada.prompt);
    expect(argsClaude({ ...ctx, promptModo: 'agregar' }, entrada, 'm.json')).toContain(
      '--append-system-prompt',
    );
    expect(a[a.indexOf('--tools') + 1]).toBe('WebSearch');
    const permitidas = a.slice(a.indexOf('--allowedTools') + 1);
    expect(permitidas).toEqual([
      'mcp__acitmx-crm__obscura_extract',
      'mcp__acitmx-crm__crm_actividad',
      'WebSearch',
    ]);
    expect(a.join(' ')).not.toContain(entrada.mensaje);
    // Los variádicos van al final: nada los sigue.
    expect(a.indexOf('--allowedTools')).toBeGreaterThan(a.indexOf('--tools'));
  });
  it('sin búsqueda web no da herramientas built-in', () => {
    const a = argsClaude(
      ctx,
      { ...entrada, agente: { ...entrada.agente, webSearch: false } },
      'm.json',
    );
    expect(a[a.indexOf('--tools') + 1]).toBe('');
  });
  it('escribe el JSON de MCP con rutas con espacios y barras intactas', () => {
    const f = escribirMcpConfig(ctx, entrada);
    const j = JSON.parse(readFileSync(f, 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
    };
    expect(j.mcpServers['acitmx-crm']!.args[0]).toBe('C:\\x y\\cli.mjs');
    expect(j.mcpServers['acitmx-crm']!.env['CRM_AGENT']).toBe('Rastreador');
  });

  const leer = (lineas: object[], codigo = 1, stderr = '') => {
    const st = lecturaVacia();
    for (const l of lineas) leerLineaClaude(JSON.stringify(l), st);
    return resultadoClaude(st, codigo, stderr);
  };
  it('éxito, error de turnos y límite por texto / 429 / rate_limit_event', () => {
    expect(
      leer(
        [{ type: 'result', subtype: 'success', is_error: false, result: 'listo', num_turns: 2 }],
        0,
      ),
    ).toMatchObject({ ok: true, salida: 'listo', turnos: 2 });
    const mt = leer([
      {
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        errors: ['Reached maximum number of turns (1)'],
      },
    ]);
    expect(mt.ok).toBe(false);
    expect(mt.limite_plan).toBeUndefined();
    expect(
      leer([
        {
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: "You've hit your usage limit",
        },
      ]).limite_plan,
    ).toBe(true);
    expect(
      leer([
        {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          api_error_status: 429,
          result: 'x',
        },
      ]).limite_plan,
    ).toBe(true);
    expect(
      leer([
        { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 123 } },
        { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'x' },
      ]),
    ).toMatchObject({ limite_plan: true, reset_en: 123 });
    expect(
      leer(
        [
          { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } },
          { type: 'result', subtype: 'success', is_error: false, result: 'ok' },
        ],
        0,
      ).limite_plan,
    ).toBeUndefined();
  });
  it('sin resultado: usa stderr; MCP fallido es error; 529 no es límite de plan', () => {
    expect(leer([], 1, 'Error: Claude AI usage limit reached|1795644000').limite_plan).toBe(true);
    expect(leer([], 1, 'overloaded_error 529').limite_plan).toBeUndefined();
    const mcp = leer(
      [
        {
          type: 'system',
          subtype: 'init',
          mcp_servers: [{ name: 'acitmx-crm', status: 'failed' }],
        },
        { type: 'result', subtype: 'success', is_error: false, result: 'no pude' },
      ],
      0,
    );
    expect(mcp.ok).toBe(false);
    expect(mcp.error).toContain('MCP');
  });
  it('detecta quota_exceeded en resultados de herramientas y suma tokens', () => {
    const r = leer(
      [
        {
          type: 'user',
          message: { content: [{ type: 'tool_result', content: 'quota_exceeded' }] },
        },
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'x',
          usage: {
            input_tokens: 1,
            output_tokens: 2,
            cache_creation_input_tokens: 3,
            cache_read_input_tokens: 4,
          },
        },
      ],
      0,
    );
    expect(r).toMatchObject({ ok: true, cuota_agotada: true, tokens: 10 });
  });
});

describe('adaptadores opencode y gemini (solo construcción, sin verificar en vivo)', () => {
  it('opencode: mensaje con system prompt y MCP inline solo del CRM', () => {
    const a = argsOpencode({ ...ctx, modelo: undefined }, entrada);
    expect(a.slice(0, 4)).toEqual(['run', '--format', 'json', '--auto']);
    expect(a.at(-1)).toContain('PROMPT');
    expect(a.at(-1)).toContain(entrada.mensaje);
    const cfg = JSON.parse(configOpencode(ctx, entrada)) as {
      mcp: Record<string, { command: string[] }>;
    };
    expect(Object.keys(cfg.mcp)).toEqual(['acitmx-crm']);
  });
  it('gemini: -p con json y yolo', () => {
    const a = argsGemini(ctx, entrada);
    expect(a[0]).toBe('-p');
    expect(a).toContain('--yolo');
  });
});
