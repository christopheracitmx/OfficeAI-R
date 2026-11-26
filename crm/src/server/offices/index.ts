import { resolve } from 'node:path';
import type { Db } from '../db';
import type { OficinaDef } from '../runner/estado';
import { RunnerEdificio } from '../runner/edificio';
import { crearEjecutor, leerEngineYaml, type ConfigRunner } from '../runner/motor';
import { ArchivosPrompts, Prompts } from '../runner/prompts';
import { Runner } from '../runner/runner';
import type { EjecutarAgenteFn } from '../runner/types';
import type { EventBus } from '../services/events';
import type { Mailer } from '../services/mailer';
import { obtenerOficina, sembrarDefiniciones } from '../services/oficinas';
import { cargarWorkflowOficina, sincronizarOficinasArchivo } from './cargador';
import { sembrarOficina, PromptsBd } from './cerebro-bd';
import { herramientasNoPermitidas, herramientasPermitidas } from './herramientas';
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

/**
 * Arma el edificio: lee las oficinas de la tabla `oficinas` (las carpetas config/offices/* nuevas se
 * dan de alta solas), crea un Runner por oficina y una cola global de llamadas de IA.
 */
export function crearRunner(o: OpcionesRunner): RunnerEdificio {
  const dirOficinas = resolve(o.raiz, 'config', 'offices');
  const cfg = o.cfg ?? leerEngineYaml(resolve(o.raiz, 'config', 'engine.yaml'));
  sincronizarOficinasArchivo(o.db, dirOficinas);
  const tsx = resolve(o.raiz, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const motor =
    o.ejecutar ??
    crearEjecutor(cfg, {
      workDir: resolve(o.raiz, 'data', 'runner'),
      mcp: { command: process.execPath, args: [tsx, resolve(o.raiz, 'src', 'mcp', 'index.ts')] },
    });
  const edificio = new RunnerEdificio(cfg, o.db);
  const ejecutar = edificio.cola.envolver(motor);
  const capacidades = new Set<string>();
  if (o.env['GOOGLE_PLACES_API_KEY'] && !cfg.capacidades_off.includes('places'))
    capacidades.add('places');
  // Los candados por oficina: prospección los suyos; el resto, los base (Prompts.armar).
  const candados: Record<string, string> = { [OFFICE_ID]: CANDADOS_PROSPECCION };
  const prompts = new Prompts(new PromptsBd(o.db, new ArchivosPrompts(dirOficinas)), candados);

  edificio.fabrica = (id) => {
    const wf = cargarWorkflowOficina(o.db, dirOficinas, id);
    if (!wf) throw new Error(`Oficina desconocida: ${id}`);
    sembrarOficina(o.db, dirOficinas, wf);
    const def: OficinaDef =
      id === OFFICE_ID
        ? oficinaProspeccion(wf, { mailer: o.mailer, from: o.from, baseUrl: o.baseUrl })
        : { workflow: wf, ganchos: {}, herramientas: herramientasPermitidas(o.db, id) };
    return new Runner({
      db: o.db,
      bus: o.bus,
      ejecutar,
      prompts,
      cfg,
      oficinas: { [id]: def },
      mcpEnvBase: { CRM_URL: `http://127.0.0.1:${o.puerto}`, CRM_AGENT_TOKEN_FILE: o.tokenFile },
      capacidades,
    });
  };
  edificio.validarInicio = (id) => {
    const of = obtenerOficina(o.db, id);
    if (!of || of.estado !== 'activa') throw new Error('La oficina está archivada');
    const wf = edificio.oficina(id)?.workflow;
    const mal = wf ? herramientasNoPermitidas(o.db, wf, id) : [];
    if (mal.length > 0)
      throw new Error(
        `El flujo usa herramientas no permitidas en esta oficina (${mal.join(', ')}). Edítalo en la vista avanzada.`,
      );
  };

  const filas = o.db.prepare('SELECT id FROM oficinas ORDER BY orden').all() as { id: string }[];
  for (const { id } of filas) {
    try {
      edificio.alta(id);
    } catch (e) {
      if (id === OFFICE_ID) throw e;
      console.warn(
        `[edificio] La oficina ${id} no se cargó: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  sembrarDefiniciones(o.db);
  edificio.validar();
  return edificio;
}
