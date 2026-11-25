/**
 * Servidor de DEMOSTRACIÓN para la oficina 3D (no es parte de la app ni de vitest).
 * BD temporal + eventos SSE simulados con las acciones reales del runner. No envía correos,
 * no usa Claude ni Places. Uso:
 *   npx tsx test/p7-demo-servidor.ts <ruta-bd-temporal> [--sin-eventos] [--puerto=4099]
 */
import { resolve } from 'node:path';
import { createApp } from '../src/server/app';
import { cerrarLimpio, escuchar } from '../src/server/arranque';
import { openDb } from '../src/server/db';
import { crearRunner } from '../src/server/offices';
import { EventBus, registrarActividad } from '../src/server/services/events';
import type { Mailer } from '../src/server/services/mailer';

const [ruta, ...resto] = process.argv.slice(2);
if (!ruta) throw new Error('Falta la ruta de la BD temporal');
const puerto = Number(resto.find((a) => a.startsWith('--puerto='))?.split('=')[1] ?? 4099);
if (puerto === 4010) throw new Error('4010 es el puerto del CRM real: usa otro para la demo');
const sinEventos = resto.includes('--sin-eventos');
const conAprendizaje = resto.includes('--aprendizaje');

const mailer: Mailer = {
  send: () => Promise.reject(new Error('Correo deshabilitado en la demo')),
};
if (/crm\.db$/i.test(ruta)) throw new Error('La demo nunca usa la base real del CRM');
const db = openDb(resolve(ruta));
const bus = new EventBus();
const runner = crearRunner({
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
if (conAprendizaje && !db.prepare('SELECT 1 FROM feedback LIMIT 1').get())
  (await import('./p65-demo-datos')).sembrarDemo(db);
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

const GUION: [string, string, string?][] = [
  ['Coordinador', 'inició la corrida', '#1 · Prospección'],
  ['Cartografo', 'recibió una tarea', 'Descubrir empresas en Naucalpan'],
  ['Explorador', 'recibió una tarea', 'Nichos: logística'],
  ['Cartografo', 'buscó en la web'],
  ['Explorador', 'leyó una página'],
  ['Cartografo', 'registró empresa', 'Logística Ejemplo del Valle'],
  ['Cartografo', 'terminó su tarea', 'ok'],
  ['Guardian', 'recibió una tarea', 'Filtrar duplicados'],
  ['Explorador', 'registró empresa', 'Distribuidora Demo Norte'],
  ['Guardian', 'terminó su tarea', 'ok'],
  ['Rastreador', 'leyó una página'],
  ['Rastreador', 'guardó contacto', 'contacto@ejemplo.mx'],
  ['Analista', 'recibió una tarea', 'Ficha de la empresa'],
  ['Rastreador', 'terminó su tarea', 'ok'],
  ['Analista', 'guardó ficha de empresa'],
  ['Analista', 'terminó su tarea', 'ok'],
  ['Estratega', 'recibió una tarea', 'Elegir familias Lenovo/Aruba'],
  ['Armador', 'armó propuestas y paquetes'],
  ['Armador', 'terminó su tarea', 'ok'],
  ['QA-1', 'QA1 devolvió', 'Falta justificar el paquete de red'],
  ['Armador', 'recibió una tarea', 'Corregir devolución'],
  ['Armador', 'terminó su tarea', 'ok'],
  ['QA-1', 'QA1 aprobó'],
  ['Calificador', 'calificó 82 (nivel A)'],
  ['Calificador', 'terminó su tarea', 'ok'],
  ['Redactor', 'redactó el reporte'],
  ['Redactor', 'terminó su tarea', 'ok'],
  ['QA-2', 'QA2 aprobó'],
  ['QA-2', 'guardó el prospecto en el CRM'],
];

let temporizador: ReturnType<typeof setInterval> | undefined;
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
    clearInterval(temporizador);
    void cerrarLimpio(server, db).then(() => process.exit(0));
  });
if (!sinEventos) {
  let i = 0;
  temporizador = setInterval(() => {
    const [agente, accion, detalle] = GUION[i % GUION.length]!;
    registrarActividad(db, bus, { agente, accion, detalle, office_id: 'prospeccion' });
    i++;
  }, 1300);
}
