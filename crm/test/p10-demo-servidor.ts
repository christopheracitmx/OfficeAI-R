/**
 * Servidor de DEMOSTRACIÓN del Constructor «Nuevo piso» (P10b): BD temporal y CLI de Claude SIMULADO
 * (test/fixtures/fake-claude.mjs). No usa Claude real, ni plan, ni correo. Uso:
 *   npx tsx test/p10-demo-servidor.ts <ruta-bd-temporal> [--puerto=4099]
 */
import { resolve } from 'node:path';
import { createApp } from '../src/server/app';
import { cerrarLimpio, escuchar } from '../src/server/arranque';
import { openDb } from '../src/server/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearRunner } from '../src/server/offices';
import { CONFIG_POR_DEFECTO, crearEjecutor } from '../src/server/runner/motor';
import { EventBus } from '../src/server/services/events';
import type { Mailer } from '../src/server/services/mailer';

const [ruta, ...resto] = process.argv.slice(2);
if (!ruta) throw new Error('Falta la ruta de la BD temporal');
const puerto = Number(resto.find((a) => a.startsWith('--puerto='))?.split('=')[1] ?? 4099);
if (puerto === 4010) throw new Error('4010 es el puerto del CRM real: usa otro para la demo');

const mailer: Mailer = {
  send: () => Promise.reject(new Error('Correo deshabilitado en la demo')),
};
if (/crm\.db$/i.test(ruta)) throw new Error('La demo nunca usa la base real del CRM');
const db = openDb(resolve(ruta));
const bus = new EventBus();
const dirSim = mkdtempSync(join(tmpdir(), 'p10-sim-'));
const escenario = join(dirSim, 'escenario.json');
const sal = (mensaje: string, fase: number, borrador: object = {}, listo = false) =>
  JSON.stringify({ mensaje, fase, borrador, listo });
const ag = (rol: string, area: string, tarea: string, extra: object = {}) => ({
  rol,
  area,
  tarea,
  es_qa: false,
  herramientas: [],
  web: false,
  ...extra,
});
writeFileSync(
  escenario,
  JSON.stringify({
    libre_segun_prompt: [
      {
        contiene: '#T1',
        salida: sal('Perfecto. ¿Qué datos recibe el piso y dónde quieres guardarlos?', 2, {
          nombre: 'Facturas del mes',
          objetivo: 'Clasificar las facturas que llegan cada mes',
          entregable: 'Una tabla de facturas con su categoría',
        }),
      },
      {
        contiene: '#T2',
        salida: sal('Te propongo un equipo de cuatro. ¿Lo revisas?', 3, {
          entrada: 'PDF de facturas en una carpeta',
          salida: 'Tabla de facturas',
          almacenamiento: 'Colección Facturas',
          agentes: [
            ag('Clasificadora', 'Captura', 'Clasificar cada factura', {
              herramientas: ['coleccion_upsert', 'enviar_whatsapp'],
            }),
            ag('Capturista', 'Captura', 'Capturar los datos de cada factura'),
            ag('Contador', 'Revisión', 'Revisar los importes y sumar totales'),
            ag('Auditora', 'Revisión', 'Revisar que cada registro tenga fuente', { es_qa: true }),
          ],
          colecciones: [
            {
              nombre: 'Facturas',
              campos: [
                { nombre: 'folio', etiqueta: 'Folio', tipo: 'texto', requerido: true },
                { nombre: 'importe', etiqueta: 'Importe', tipo: 'numero', requerido: false },
              ],
              clave: 'folio',
            },
          ],
          devoluciones_max: 1,
          items_max: 4,
        }),
      },
      {
        contiene: '#T3',
        salida: sal('Listo: revisa la vista previa 3D y aprueba el piso.', 7, {}, true),
      },
      {
        contiene: 'Es una PRUEBA',
        salida: 'Tomaría cada factura, la clasificaría y la guardaría con su fuente.',
      },
    ],
  }),
);
const cfg = { ...CONFIG_POR_DEFECTO };
const ejecutar = crearEjecutor(cfg, {
  workDir: join(dirSim, 'work'),
  mcp: { command: 'no-se-usa', args: [] },
  bin: process.execPath,
  binArgs: [resolve('test/fixtures/fake-claude.mjs')],
  env: { FAKE_SCENARIO: escenario },
});
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
  env: {},
});
const app = createApp({
  db,
  bus,
  mailer,
  from: 'demo@localhost',
  baseUrl: 'http://127.0.0.1:5174',
  agentToken: 'demo',
  uiOrigins: [`http://127.0.0.1:${puerto}`, 'http://127.0.0.1:5174', 'http://localhost:5174'],
  env: { NODE_ENV: 'test' },
  runner,
  dbModo: 'demo',
});

let server: Awaited<ReturnType<typeof escuchar>>;
try {
  server = await escuchar(app, puerto);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  db.close();
  process.exit(1);
}
console.info(`Demo 3D en http://127.0.0.1:${puerto} (BD temporal ${ruta})`);
// Siempre se cierra (Ctrl+C / terminar el proceso): la demo nunca queda viva por accidente.
for (const senal of ['SIGINT', 'SIGTERM'] as const)
  process.once(senal, () => {
    void cerrarLimpio(server, db).then(() => process.exit(0));
  });
