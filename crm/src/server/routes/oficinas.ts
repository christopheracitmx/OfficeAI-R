import { Router } from 'express';
import { z } from 'zod';
import {
  oficinaCrearInput,
  oficinaPatchInput,
  oficinaReordenarInput,
  officeIdSchema,
  type OficinaResumen,
} from '../../shared/oficinas';
import { cargarWorkflowOficina } from '../offices/cargador';
import { herramientasNoPermitidas } from '../offices/herramientas';
import { validarConsultas, validarWorkflow, type Workflow } from '../runner/workflow';
import { registrarCambio } from '../services/cambios';
import { KbError } from '../services/kb';
import { crearOficina } from '../services/oficina-crear';
import {
  archivarOficina,
  definicionDe,
  listarOficinas,
  obtenerOficina,
  pisoDe,
  reordenarOficinas,
  renombrarOficina,
  restaurarOficina,
} from '../services/oficinas';
import { ah, HttpError, parse, type Deps } from './util';

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Edificio: pisos (oficinas). Crear (vacía o duplicando), renombrar, reordenar, archivar/restaurar; nunca se borra. */
export function oficinasRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  const dir = d.dirOficinas ?? `${process.cwd()}/config/offices`;

  const workflowDe = (id: string): Workflow | null => {
    try {
      return d.runner?.oficina(id)?.workflow ?? cargarWorkflowOficina(db, dir, id);
    } catch {
      return null;
    }
  };

  function resumen(id: string): OficinaResumen {
    const o = obtenerOficina(db, id)!;
    const n = (sql: string, ...a: unknown[]): number =>
      (db.prepare(sql).get(...a) as { n: number }).n;
    const ultima = db
      .prepare(
        'SELECT id, estado, iniciada_en, terminada_en FROM corridas WHERE office_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(id) as OficinaResumen['ultima_corrida'] | undefined;
    const tokens = (oficina?: string): number =>
      (
        db
          .prepare(
            `SELECT COALESCE(SUM(tokens_estimados),0) AS n FROM salidas_agente
             WHERE tipo = 'paso' AND creado_en >= datetime('now','-7 days') ${oficina ? 'AND office_id = ?' : ''}`,
          )
          .get(...(oficina ? [oficina] : [])) as { n: number }
      ).n;
    const total = tokens();
    const wf = workflowDe(id);
    const mal = wf ? herramientasNoPermitidas(wf, id) : [];
    const advertencias = [
      ...(wf ? [] : ['El workflow no se pudo cargar: edítalo en la vista avanzada']),
      ...(mal.length > 0
        ? [`El flujo usa herramientas no permitidas en esta oficina: ${mal.join(', ')}`]
        : []),
    ];
    return {
      ...o,
      piso: pisoDe(db, id),
      agentes: n('SELECT COUNT(*) AS n FROM agentes WHERE office_id = ? AND activo = 1', id),
      ultima_corrida: ultima ?? null,
      corrida_activa:
        n("SELECT COUNT(*) AS n FROM corridas WHERE office_id = ? AND estado = 'en_curso'", id) > 0,
      pendientes_aprendizaje: n(
        "SELECT COUNT(*) AS n FROM lecciones WHERE office_id = ? AND estado = 'propuesta'",
        id,
      ),
      uso_pct: total > 0 ? Math.round((tokens(id) / total) * 100) : 0,
      ejecutable: advertencias.length === 0 && o.estado === 'activa',
      advertencias,
    };
  }

  const existente = (id: string): string => {
    const i = parse(officeIdSchema, id);
    if (!obtenerOficina(db, i)) throw new HttpError(404, `Oficina desconocida: ${i}`);
    return i;
  };

  r.get(
    '/oficinas',
    ah((q, res) => {
      const todas = q.query['archivadas'] === '1';
      res.json(
        listarOficinas(db, todas)
          .filter((o) => todas || o.estado === 'activa')
          .map((o) => ({ ...resumen(o.id), office_id: o.id, titulo: o.nombre })),
      );
    }),
  );

  r.post(
    '/oficinas',
    ah(async (q, res) => {
      const i = parse(oficinaCrearInput, q.body);
      const id = await dom(() => crearOficina(db, i, workflowDe));
      d.runner?.alta(id);
      res.status(201).json(resumen(id));
    }),
  );

  r.put(
    '/oficinas/orden',
    ah(async (q, res) => {
      const i = parse(oficinaReordenarInput, q.body);
      await dom(() => reordenarOficinas(db, i.orden));
      res.json(listarOficinas(db).map((o) => resumen(o.id)));
    }),
  );

  r.get(
    '/oficinas/:id',
    ah((q, res) => void res.json(resumen(existente(String(q.params['id']))))),
  );

  r.patch(
    '/oficinas/:id',
    ah(async (q, res) => {
      const id = existente(String(q.params['id']));
      await dom(() => renombrarOficina(db, id, parse(oficinaPatchInput, q.body)));
      res.json(resumen(id));
    }),
  );

  r.post(
    '/oficinas/:id/archivar',
    ah(async (q, res) => {
      const id = existente(String(q.params['id']));
      if (d.runner?.estaActiva(id))
        throw new HttpError(409, 'Hay una corrida en curso en esta oficina; deténla primero');
      await dom(() => archivarOficina(db, id));
      res.json(resumen(id));
    }),
  );

  r.post(
    '/oficinas/:id/restaurar',
    ah(async (q, res) => {
      const id = existente(String(q.params['id']));
      await dom(() => restaurarOficina(db, id));
      res.json(resumen(id));
    }),
  );

  /** Planta 3D validada con el esquema zod; si la oficina no tiene, se genera una mínima válida. */
  r.get(
    '/oficinas/:id/definicion',
    ah((q, res) => {
      const def = definicionDe(db, existente(String(q.params['id'])));
      if (!def) throw new HttpError(404, 'Sin definición');
      res.json(def);
    }),
  );

  /** Vista avanzada: el workflow como JSON. Solo es editable si vive en la base (no si viene de archivo). */
  r.get(
    '/oficinas/:id/workflow',
    ah((q, res) => {
      const id = existente(String(q.params['id']));
      const o = obtenerOficina(db, id)!;
      res.json({
        editable: o.workflow_ref === 'bd',
        ref: o.workflow_ref,
        workflow: workflowDe(id),
      });
    }),
  );

  r.put(
    '/oficinas/:id/workflow',
    ah(async (q, res) => {
      const id = existente(String(q.params['id']));
      const o = obtenerOficina(db, id)!;
      if (o.workflow_ref !== 'bd')
        throw new HttpError(
          409,
          'Este workflow viene de archivo (solo lectura). Duplica la oficina para editarlo.',
        );
      if (d.runner?.estaActiva(id))
        throw new HttpError(409, 'Hay una corrida en curso en esta oficina');
      const { workflow } = parse(z.object({ workflow: z.unknown() }), q.body);
      let wf: Workflow;
      try {
        wf = validarWorkflow(workflow, id);
        validarConsultas(db, wf);
      } catch (e) {
        throw new HttpError(
          400,
          `Workflow inválido: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      db.prepare('UPDATE oficinas SET workflow_json = ? WHERE id = ?').run(JSON.stringify(wf), id);
      registrarCambio(db, id, 'workflow', id, 'editó el workflow', wf.titulo);
      d.runner?.alta(id);
      res.json({ ok: true, advertencias: resumen(id).advertencias });
    }),
  );

  return r;
}
