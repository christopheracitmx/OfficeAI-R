import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app';
import { openDb } from './db';
import { EventBus } from './services/events';
import { DisabledMailer, ResendMailer, type Mailer } from './services/mailer';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env['CRM_PORT'] ?? 4010);
const dbPath = resolve(process.env['CRM_DB_PATH'] ?? './data/crm.db');
const from = process.env['RESEND_FROM'] ?? 'info@mail.acitmx.net';

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

const uiOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5174', 'http://localhost:5174'];

const app = createApp({
  db: openDb(dbPath),
  bus: new EventBus(),
  mailer,
  from,
  baseUrl: 'http://127.0.0.1:5174',
  agentToken: agentToken(),
  uiOrigins,
  env: process.env,
});

// Solo local: jamás exponer a la red.
app.listen(port, '127.0.0.1', () => {
  console.info(`CRM ACITMX escuchando en http://127.0.0.1:${port} (DB: ${dbPath})`);
  if (!process.env['RESEND_API_KEY']) console.warn('Aviso: RESEND_API_KEY vacío; los correos fallarán de forma controlada.');
});
