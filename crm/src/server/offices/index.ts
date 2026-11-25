import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db } from '../db';
import type { OficinaDef } from '../runner/estado';
import { crearEjecutor, leerEngineYaml, type ConfigRunner } from '../runner/motor';
import { ArchivosPrompts, Prompts } from '../runner/prompts';
import { Runner } from '../runner/runner';
import type { EjecutarAgenteFn } from '../runner/types';
import { cargarWorkflow } from '../runner/workflow';
import type { EventBus } from '../services/events';
import type { Mailer } from '../services/mailer';
import { sembrarOficina, PromptsBd } from './cerebro-bd';
import { CANDADOS_PROSPECCION, OFFICE_ID, oficinaProspeccion } from './prospeccion';

export interface OpcionesRunner {
  db: Db;
  bus: EventBus;
  mailer: Mailer;
  from: string;
  baseUrl: string;
  /** Carpeta del paquete crm (donde viven config/ y data/). */
  raiz: string;
  /** Puerto y archivo de token con los que el proceso MCP de cada agente habla con el CRM. */
  puerto: number;
  tokenFile: string;
  env: NodeJS.ProcessEnv;
  /** Para tests: configuración y ejecutor de motor ya resueltos. */
  cfg?: ConfigRunner;
  ejecutar?: EjecutarAgenteFn;
}

/** Carga las oficinas de config/offices/* y arma el runner. Las oficinas nuevas solo agregan su carpeta (y su gancho si lo necesitan). */
export function crearRunner(o: OpcionesRunner): Runner {
  const dirOficinas = resolve(o.raiz, 'config', 'offices');
  const cfg = o.cfg ?? leerEngineYaml(resolve(o.raiz, 'config', 'engine.yaml'));
  const oficinas: Record<string, OficinaDef> = {};
  const candados: Record<string, string> = {};
  const ids = existsSync(dirOficinas)
    ? readdirSync(dirOficinas, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(dirOficinas, d.name, 'workflow.json')))
        .map((d) => d.name)
    : [];
  for (const id of ids) {
    const wf = cargarWorkflow(dirOficinas, id);
    sembrarOficina(o.db, dirOficinas, wf);
    if (id === OFFICE_ID) {
      oficinas[id] = oficinaProspeccion(wf, { mailer: o.mailer, from: o.from, baseUrl: o.baseUrl });
      candados[id] = CANDADOS_PROSPECCION;
    } else oficinas[id] = { workflow: wf, ganchos: {} };
  }
  const tsx = resolve(o.raiz, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const ejecutar =
    o.ejecutar ??
    crearEjecutor(cfg, {
      workDir: resolve(o.raiz, 'data', 'runner'),
      mcp: { command: process.execPath, args: [tsx, resolve(o.raiz, 'src', 'mcp', 'index.ts')] },
    });
  const capacidades = new Set<string>();
  if (o.env['GOOGLE_PLACES_API_KEY'] && !cfg.capacidades_off.includes('places'))
    capacidades.add('places');
  const runner = new Runner({
    db: o.db,
    bus: o.bus,
    ejecutar,
    prompts: new Prompts(new PromptsBd(o.db, new ArchivosPrompts(dirOficinas)), candados),
    cfg,
    oficinas,
    mcpEnvBase: { CRM_URL: `http://127.0.0.1:${o.puerto}`, CRM_AGENT_TOKEN_FILE: o.tokenFile },
    capacidades,
  });
  runner.validar();
  return runner;
}
