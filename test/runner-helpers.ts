import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { openDb } from '../src/server/db';
import { crearRunner } from '../src/server/offices';
import { CONFIG_POR_DEFECTO, crearEjecutor, type ConfigRunner } from '../src/server/runner/motor';
import { EventBus } from '../src/server/services/events';
import { FakeMailer, TOKEN, UI } from './helpers';

export const FAKE = resolve('test/fixtures/fake-claude.mjs');

export interface Llamada {
  agente: string;
  pid: number;
  mensaje: string;
  herramientas: string[];
  modelo?: string;
  esfuerzo?: string;
  maxTurns?: string;
  placesKey?: string;
  prompt?: string;
}

export interface Opciones {
  escenario?: Record<string, unknown>;
  cfg?: Partial<ConfigRunner>;
  env?: NodeJS.ProcessEnv;
}

/** Servidor real (puerto efímero) + runner conectado a un CLI simulado. Sin plan, sin Places, sin Resend. */
export async function montar(o: Opciones = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'runner-'));
  const tokenFile = join(dir, 'agent.token');
  writeFileSync(tokenFile, TOKEN);
  const log = join(dir, 'log.jsonl');
  const esc = join(dir, 'escenario.json');
  writeFileSync(esc, JSON.stringify(o.escenario ?? {}));
  const db = openDb(':memory:');
  const bus = new EventBus();
  const mailer = new FakeMailer();
  const server: Server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const puerto = (server.address() as { port: number }).port;
  const cfg: ConfigRunner = { ...CONFIG_POR_DEFECTO, ...o.cfg };
  const ejecutar = crearEjecutor(cfg, {
    workDir: join(dir, 'work'),
    mcp: { command: 'no-se-usa', args: [] },
    bin: process.execPath,
    binArgs: [FAKE],
    env: { FAKE_SCENARIO: esc, FAKE_LOG: log },
  });
  const runner = crearRunner({
    db,
    bus,
    mailer,
    from: 'info@mail.acitmx.net',
    baseUrl: 'http://127.0.0.1:5174',
    raiz: resolve('.'),
    puerto,
    tokenFile,
    env: o.env ?? {},
    cfg,
    ejecutar,
  });
  const app = createApp({
    db,
    bus,
    mailer,
    from: 'info@mail.acitmx.net',
    baseUrl: 'http://127.0.0.1:5174',
    agentToken: TOKEN,
    uiOrigins: [UI],
    env: { NODE_ENV: 'test' },
    runner,
  });
  server.on('request', app);
  const api = request(app);
  return {
    db,
    bus,
    mailer,
    runner,
    app,
    log,
    dir,
    post: (u: string, b?: object) =>
      api
        .post(u)
        .set('Origin', UI)
        .send(b ?? {}),
    get: (u: string) => api.get(u).set('Origin', UI),
    cambiarEscenario: (e: Record<string, unknown>) => writeFileSync(esc, JSON.stringify(e)),
    llamadas: (): Llamada[] =>
      existsSync(log)
        ? readFileSync(log, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as Llamada)
        : [],
    cerrar: () => {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type Montaje = Awaited<ReturnType<typeof montar>>;

export const corridaBody = (max = 2) => ({ zona: 'CDMX', giro: 'Cualquiera', max_empresas: max });

export const vivo = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
