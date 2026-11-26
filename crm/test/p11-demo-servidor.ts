/**
 * Servidor de DEMOSTRACIÓN de las fuentes de descubrimiento (P11): BD temporal, datasets de muestra, red de
 * las fuentes SIMULADA y CLI de Claude SIMULADO. No usa Claude real, ni plan, ni internet, ni correo. Uso:
 *   npx tsx test/p11-demo-servidor.ts <ruta-bd-temporal> [--puerto=4099]
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/server/app';
import { cerrarLimpio, escuchar } from '../src/server/arranque';
import { openDb } from '../src/server/db';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { importarOverture } from '../src/server/fuentes/import-overture';
import { crearRunner } from '../src/server/offices';
import { CONFIG_POR_DEFECTO, crearEjecutor } from '../src/server/runner/motor';
import { EventBus } from '../src/server/services/events';
import type { Mailer } from '../src/server/services/mailer';

const [ruta, ...resto] = process.argv.slice(2);
if (!ruta) throw new Error('Falta la ruta de la BD temporal');
const puerto = Number(resto.find((a) => a.startsWith('--puerto='))?.split('=')[1] ?? 4099);
if (puerto === 4010) throw new Error('4010 es el puerto del CRM real: usa otro para la demo');
if (/crm\.db$/i.test(ruta)) throw new Error('La demo nunca usa la base real del CRM');

const mailer: Mailer = { send: () => Promise.reject(new Error('Correo deshabilitado en la demo')) };
const db = openDb(resolve(ruta));
await importarDenue(db, [resolve('test/fixtures/denue-muestra.csv')], {
  version: 'DENUE 2026/05 (muestra)',
  fecha_dataset: '2026-05-29',
});
await importarOverture(db, resolve('test/fixtures/overture-muestra.geojsonl'), {
  version: '2026-11-18.0 (muestra)',
});
// Un uso previo para que la UI muestre contadores.
db.prepare(
  "INSERT INTO fuentes_uso (fuente_id, mes, contador) VALUES ('denue_api', strftime('%Y-%m','now'), 37)",
).run();

const bus = new EventBus();
const dirSim = mkdtempSync(join(tmpdir(), 'p11-sim-'));
const escenario = join(dirSim, 'escenario.json');
// El Guardián «se cuelga» para que la corrida siga activa y se vea el panel de fuentes.
writeFileSync(escenario, JSON.stringify({ colgar: 'Guardian' }));
const cfg = { ...CONFIG_POR_DEFECTO };
const ejecutar = crearEjecutor(cfg, {
  workDir: join(dirSim, 'work'),
  mcp: { command: 'no-se-usa', args: [] },
  bin: process.execPath,
  binArgs: [resolve('test/fixtures/fake-claude.mjs')],
  env: { FAKE_SCENARIO: escenario },
});
const env = { NODE_ENV: 'test', DENUE_TOKEN: 'token-de-demostracion' };
const runner = crearRunner({
  cfg,
  ejecutar,
  db,
  bus,
  mailer,
  from: 'demo@localhost',
  baseUrl: 'http://127.0.0.1:5174',
  raiz: resolve('.'),
  puerto,
  tokenFile: resolve(ruta + '.token'),
  env,
});
const fetchSimulado = (async () =>
  new Response(JSON.stringify({ elements: [] }), {
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;
const app = createApp({
  db,
  bus,
  mailer,
  from: 'demo@localhost',
  baseUrl: 'http://127.0.0.1:5174',
  agentToken: 'demo',
  uiOrigins: [`http://127.0.0.1:${puerto}`, 'http://127.0.0.1:5174', 'http://localhost:5174'],
  env,
  runner,
  dbModo: 'demo',
  fuentes: { fetchFn: fetchSimulado },
});

let server: Awaited<ReturnType<typeof escuchar>>;
try {
  server = await escuchar(app, puerto);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  db.close();
  process.exit(1);
}
console.info(`Demo P11 en http://127.0.0.1:${puerto} (BD temporal ${ruta})`);
for (const senal of ['SIGINT', 'SIGTERM'] as const)
  process.once(senal, () => {
    void cerrarLimpio(server, db).then(() => process.exit(0));
  });
