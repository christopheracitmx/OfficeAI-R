import { Router } from 'express';
import { z } from 'zod';
import {
  ESFUERZOS,
  MODELOS_REFLEXION,
  casoInput,
  casoPatch,
  evaluacionInput,
  feedbackInput,
  leccionInput,
  leccionPatch,
  reflexionInput,
} from '../../shared/aprendizaje';
import { crearCaso, editarCaso, listarCasos } from '../services/casos-dorados';
import { desempeno } from '../services/desempeno';
import {
  ejecutarEvaluacion,
  estimarEvaluacion,
  leerEvaluacion,
  listarEvaluaciones,
  type MotorEvaluacion,
} from '../services/evaluacion';
import {
  guardarEtiquetas,
  leerEtiquetas,
  listarFeedback,
  registrarFeedbackManual,
} from '../services/feedback';
import { KbError } from '../services/kb';
import {
  cambiarEstado,
  conteoLecciones,
  crearLeccion,
  editarLeccion,
  historialLeccion,
  listarLecciones,
  restaurarVersion,
} from '../services/lecciones';
import { ejecutarReflexion, estimarReflexion } from '../services/reflexion';
import { ah, HttpError, idParam, parse, qstr, type Deps } from './util';

const office = (q: { query: Record<string, unknown> }): string =>
  qstr(q.query['office_id']) ?? 'prospeccion';

/** Traduce los errores del dominio a HTTP. */
async function dom<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Feedback, lecciones, reflexión a petición, desempeño y casos dorados (rutas del dueño). */
export function aprendizajeRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  let ocupado = false;

  const motor = (): MotorEvaluacion => {
    const ru = d.runner;
    if (!ru) throw new HttpError(409, 'El runner no está activo en este servidor');
    return {
      motor: ru.motor,
      modeloBase: ru.cfg.modelo,
      llamar: (i) => ru.llamarLibre(i),
      promptDe: (o, p, e) => ru.promptFinal(o, p, e),
    };
  };
  /** Una sola llamada de IA a la vez (reflexión o evaluación): evita gastar plan por doble clic. */
  const exclusivo = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (ocupado) throw new HttpError(409, 'Ya hay una reflexión o evaluación en curso');
    ocupado = true;
    try {
      return await fn();
    } finally {
      ocupado = false;
    }
  };

  // ---- Feedback
  r.get(
    '/feedback',
    ah((q, res) => {
      const p = Number(q.query['prospecto_id']);
      res.json(
        listarFeedback(db, office(q), {
          agente: qstr(q.query['agente']),
          origen: qstr(q.query['origen']),
          prospecto_id: Number.isInteger(p) && p > 0 ? p : undefined,
          limit: Number(q.query['limit']) || undefined,
        }),
      );
    }),
  );
  r.post(
    '/feedback',
    ah(async (q, res) => {
      const i = parse(feedbackInput, q.body);
      res.status(201).json({ id: await dom(() => registrarFeedbackManual(db, i)) });
    }),
  );
  r.get(
    '/feedback-etiquetas',
    ah((_q, res) => void res.json(leerEtiquetas(db))),
  );
  r.put(
    '/feedback-etiquetas',
    ah((q, res) => {
      const { etiquetas } = parse(
        z.object({ etiquetas: z.array(z.string().max(80)).max(30) }),
        q.body,
      );
      res.json(guardarEtiquetas(db, etiquetas));
    }),
  );

  // ---- Lecciones
  r.get(
    '/lecciones',
    ah(
      (q, res) =>
        void res.json(
          listarLecciones(db, office(q), {
            estado: qstr(q.query['estado']),
            agente: qstr(q.query['agente']),
            tipo: qstr(q.query['tipo']),
            origen: qstr(q.query['origen']),
            q: qstr(q.query['q']),
          }),
        ),
    ),
  );
  r.get(
    '/lecciones-conteo',
    ah((q, res) => void res.json(conteoLecciones(db, office(q)))),
  );
  r.post(
    '/lecciones',
    ah(async (q, res) => {
      const i = parse(leccionInput, { office_id: office(q), ...(q.body as object) });
      res.status(201).json(await dom(() => crearLeccion(db, i, 'manual')));
    }),
  );
  r.patch(
    '/lecciones/:id',
    ah(async (q, res) => {
      const p = parse(leccionPatch, q.body);
      res.json(await dom(() => editarLeccion(db, idParam(q), p)));
    }),
  );
  r.post(
    '/lecciones/:id/:accion',
    ah(async (q, res) => {
      const accion = parse(
        z.enum(['aprobar', 'descartar', 'archivar', 'reabrir']),
        q.params['accion'],
      );
      res.json(await dom(() => cambiarEstado(db, idParam(q), accion)));
    }),
  );
  r.get(
    '/lecciones/:id/historial',
    ah(async (q, res) => void res.json(await dom(() => historialLeccion(db, idParam(q))))),
  );
  r.post(
    '/lecciones-restaurar/:id',
    ah(async (q, res) => {
      const { version } = parse(z.object({ version: z.number().int().positive() }), q.body);
      res.json(await dom(() => restaurarVersion(db, idParam(q), version)));
    }),
  );

  // ---- Reflexión (solo a petición, con estimado y confirmación)
  const opcionesIA = (q: { query: Record<string, unknown> }) => ({
    modelo: z.enum(MODELOS_REFLEXION).safeParse(q.query['modelo']).data,
    esfuerzo: z.enum(ESFUERZOS).safeParse(q.query['esfuerzo']).data,
  });
  r.get(
    '/reflexion/estimado',
    ah((q, res) => {
      const o = opcionesIA(q);
      res.json(
        estimarReflexion(
          db,
          office(q),
          o.modelo ?? d.runner?.cfg.modelo ?? 'claude-sonnet-5-5',
          o.esfuerzo ?? 'low',
        ),
      );
    }),
  );
  r.post(
    '/reflexion',
    ah(async (q, res) => {
      const i = parse(reflexionInput, q.body);
      res.json(await exclusivo(() => dom(() => ejecutarReflexion(db, motor(), i.office_id, i))));
    }),
  );

  // ---- Desempeño
  r.get(
    '/desempeno',
    ah((q, res) => void res.json(desempeno(db, office(q)))),
  );

  // ---- Casos dorados y evaluaciones
  r.get(
    '/casos-dorados',
    ah((q, res) => void res.json(listarCasos(db, office(q)))),
  );
  r.post(
    '/casos-dorados',
    ah(async (q, res) => {
      const i = parse(casoInput, { office_id: office(q), ...(q.body as object) });
      res.status(201).json(await dom(() => crearCaso(db, i)));
    }),
  );
  r.patch(
    '/casos-dorados/:id',
    ah(async (q, res) => {
      const p = parse(casoPatch, q.body);
      res.json(await dom(() => editarCaso(db, idParam(q), p)));
    }),
  );
  r.get(
    '/evaluaciones',
    ah((q, res) => void res.json(listarEvaluaciones(db, office(q)))),
  );
  r.get(
    '/evaluaciones-estimado',
    ah((q, res) => {
      const m = motor();
      const o = opcionesIA(q);
      res.json(
        estimarEvaluacion(db, m, office(q), o.modelo ?? m.modeloBase ?? 'claude-sonnet-5-5'),
      );
    }),
  );
  r.get(
    '/evaluaciones/:id',
    ah(async (q, res) => void res.json(await dom(() => leerEvaluacion(db, idParam(q))))),
  );
  r.post(
    '/evaluaciones',
    ah(async (q, res) => {
      const i = parse(evaluacionInput, q.body);
      res
        .status(201)
        .json(await exclusivo(() => dom(() => ejecutarEvaluacion(db, motor(), i.office_id, i))));
    }),
  );

  return r;
}
