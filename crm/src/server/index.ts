import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cerrarLimpio, escuchar } from './arranque';
import { createApp } from './app';
import { openDb } from './db';
import { crearRunner } from './offices';
import { EventBus } from './services/events';
import { comprobarClaudeReal, diagnosticar } from './services/diagnostico';
import { DisabledMailer, ResendMailer, type Mailer } from './services/mailer';

// Raíz del proyecto (carpeta crm): las rutas NO dependen del directorio desde el que se lance.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(resolve(RAIZ, '.env'))) process.loadEnvFile(resolve(RAIZ, '.env'));

const port = Number(process.env['CRM_PORT'] ?? 4010);
const dbPath = resolve(RAIZ, process.env['CRM_DB_PATH'] ?? 'data/crm.db');
// Sin RESEND_FROM se usa el remitente de pruebas de Resend (solo entrega al correo dueño de la cuenta de Resend).
const from = process.env['RESEND_FROM']?.trim() || 'onboarding@resend.dev';

/** Token que comparten el servidor y el proceso MCP (archivo local, no versionado). */
function agentToken(): string {
  const f = resolve(dirname(dbPath), 'agent.token');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  mkdirSync(dirname(f), { recursive: true });
  const t = randomBytes(24).toString('hex');
  writeFileSync(f, t, { mode: 0o600 });
  return t;
}

const mailer: Mailer = process.env['RESEND_API_KEY']
  ? new ResendMailer(process.env['RESEND_API_KEY'])
  : new DisabledMailer();

const uiOrigins = [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  'http://127.0.0.1:5174',
  'http://localhost:5174',
];

const db = openDb(dbPath, { destinatarioInicial: process.env['CRM_DESTINATARIO_INICIAL'] });
const bus = new EventBus();
const token = agentToken();
const baseUrl = 'http://127.0.0.1:5174';

// Runner: orquesta las oficinas (config/offices/*) con el motor de config/engine.yaml.
// Solo arranca una corrida cuando el dueño la inicia desde la UI; al levantar el servidor no corre nada.
const runner = crearRunner({
  db,
  bus,
  mailer,
  from,
  baseUrl,
  raiz: RAIZ,
  puerto: port,
  tokenFile: resolve(dirname(dbPath), 'agent.token'),
  env: process.env,
});
const huerfanas = runner.recuperarHuerfanas();
if (huerfanas > 0)
  console.warn(
    `Aviso: ${huerfanas} corrida(s) quedaron en curso al cerrar el servidor; marcadas con error.`,
  );

const app = createApp({
  db,
  bus,
  mailer,
  from,
  baseUrl,
  agentToken: token,
  uiOrigins,
  env: process.env,
  runner,
  dbModo: 'real',
  raiz: RAIZ,
  comprobarClaude: comprobarClaudeReal,
});

// Solo local: jamás exponer a la red. Si el puerto está ocupado, sale con error claro (código 1).
let server;
try {
  server = await escuchar(app, port);
} catch (e) {
  console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  db.close();
  process.exit(1);
}
console.info(`CRM OfficeAI-R escuchando en http://127.0.0.1:${port}`);
console.info(`Base de datos (real): ${dbPath}`);
if (!process.env['RESEND_API_KEY'])
  console.warn('Aviso: RESEND_API_KEY vacío; los correos fallarán de forma controlada.');
const diag = await diagnosticar(db, RAIZ, process.env, comprobarClaudeReal);
for (const a of [diag.claude.aviso, diag.obscura.aviso, diag.destinatarios.aviso])
  if (a) console.warn(`AVISO: ${a}`);

// Cierre limpio: vuelca el WAL y cierra la base.
for (const senal of ['SIGINT', 'SIGTERM'] as const)
  process.once(senal, () => {
    void cerrarLimpio(server, db).then(() => process.exit(0));
  });
