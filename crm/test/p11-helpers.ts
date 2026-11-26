import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterEach } from 'vitest';
import { createApp } from '../src/server/app';
import { openDb, type Db } from '../src/server/db';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { importarOverture } from '../src/server/fuentes/import-overture';
import { EventBus } from '../src/server/services/events';
import { FakeMailer, TOKEN, UI } from './helpers';

export const FX = (n: string): string => resolve('test/fixtures', n);
export const OVERPASS = JSON.parse(readFileSync(FX('overpass-muestra.json'), 'utf8')) as unknown;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

export const dirTemporal = (prefijo = 'p11-'): string => {
  const d = mkdtempSync(join(tmpdir(), prefijo));
  dirs.push(d);
  return d;
};

export const bd = (): Db => openDb(':memory:');

export async function conDatasets(db: Db): Promise<void> {
  // Las muestras son pequeñas: sin filtro de precalificación (en producción el mínimo por defecto es 70).
  db.prepare("UPDATE configuracion SET valor='0' WHERE clave='fuentes_pre_score_min'").run();
  await importarDenue(db, [FX('denue-muestra.csv')], { version: 'muestra-2026-05' });
  await importarOverture(db, FX('overture-muestra.geojsonl'), { version: '2026-11-18.0' });
}

/** Respuesta simulada de fetch (sin red). */
export const resp = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

export interface FetchSim {
  fn: typeof fetch;
  llamadas: { url: string; init?: RequestInit | undefined }[];
  maxSimultaneas: () => number;
}

/** fetch simulado: cada respuesta de la lista se entrega en orden; la última se repite. */
export function fetchSim(
  respuestas: (() => Response | Promise<Response>)[],
  retardoMs = 0,
): FetchSim {
  const llamadas: FetchSim['llamadas'] = [];
  let activas = 0;
  let max = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    activas++;
    max = Math.max(max, activas);
    try {
      if (retardoMs) await new Promise((r) => setTimeout(r, retardoMs));
      const i = Math.min(llamadas.length - 1, respuestas.length - 1);
      return await respuestas[i]!();
    } finally {
      activas--;
    }
  }) as typeof fetch;
  return { fn, llamadas, maxSimultaneas: () => max };
}

export const sinEspera = (): { fn: (ms: number) => Promise<void>; esperas: number[] } => {
  const esperas: number[] = [];
  return { fn: async (ms) => void esperas.push(ms), esperas };
};

/** App real con BD en memoria y la red de las fuentes simulada. */
export function appFuentes(o: {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  dirDatasets?: string;
}) {
  const db = bd();
  const esp = sinEspera();
  const app = createApp({
    db,
    bus: new EventBus(),
    mailer: new FakeMailer(),
    from: 'info@mail.acitmx.net',
    baseUrl: 'http://127.0.0.1:5174',
    agentToken: TOKEN,
    uiOrigins: [UI],
    env: { NODE_ENV: 'test', ...o.env },
    fuentes: {
      ...(o.fetchFn ? { fetchFn: o.fetchFn } : {}),
      esperar: esp.fn,
      ...(o.dirDatasets ? { dirDatasets: o.dirDatasets } : {}),
    },
  });
  const api = request(app);
  const dueno = (office?: string) => {
    const con = (r: request.Test) => (office ? r.set('x-office-id', office) : r);
    return {
      get: (u: string) => con(api.get(u).set('Origin', UI)),
      post: (u: string, b?: object) =>
        con(
          api
            .post(u)
            .set('Origin', UI)
            .send(b ?? {}),
        ),
      patch: (u: string, b?: object) =>
        con(
          api
            .patch(u)
            .set('Origin', UI)
            .send(b ?? {}),
        ),
      put: (u: string, b?: object) =>
        con(
          api
            .put(u)
            .set('Origin', UI)
            .send(b ?? {}),
        ),
    };
  };
  const agente = (office = 'prospeccion') => ({
    post: (u: string, b?: object) =>
      api
        .post(`/api/agent${u}`)
        .set('x-agent-token', TOKEN)
        .set('x-agent-name', 'Cartografo')
        .set('x-office-id', office)
        .send(b ?? {}),
  });
  return { db, app, dueno, agente };
}

/** Copia las muestras a una carpeta de datasets temporal (data/datasets/<fuente>/). */
export function carpetaDatasets(): string {
  const base = dirTemporal('p11-ds-');
  mkdirSync(join(base, 'denue'), { recursive: true });
  mkdirSync(join(base, 'overture'), { recursive: true });
  copyFileSync(FX('denue-muestra.csv'), join(base, 'denue', 'denue-muestra.csv'));
  copyFileSync(
    FX('overture-muestra.geojsonl'),
    join(base, 'overture', 'overture-muestra.geojsonl'),
  );
  return base;
}
