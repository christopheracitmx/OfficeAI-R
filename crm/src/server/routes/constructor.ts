import { Router } from 'express';
import { z } from 'zod';
import { FASES } from '../../shared/constructor';
import {
  ARQUITECTA_BASE,
  OFICINA_EDIFICIO,
  PROMPT_ARQUITECTA,
} from '../services/constructor-arquitecta';
import {
  crearSesion,
  disponibilidadIa,
  editarSesion,
  estimadoTurno,
  leerSesion,
  listarSesiones,
  turnoIa,
  vistaPrevia,
  type Sesion,
} from '../services/constructor-sesion';
import { crearPiso, descartarSesion, pruebaControlada } from '../services/constructor-crear';
import { listarPlantillas } from '../services/galeria';
import { KbError } from '../services/kb';
import { guardarPrompt, promptActivo } from '../services/prompts-db';
import { ah, HttpError, idParam, parse, type Deps } from './util';
import type { MotorLibre } from '../services/reflexion';

async function dom<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** «Nuevo piso»: asistente conversacional (IA) o formulario guiado (sin IA) que termina en un paquete validado. */
export function constructorRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  let ocupado = false;

  const motor = (): MotorLibre | null => {
    const ru = d.runner;
    if (!ru) return null;
    return {
      motor: ru.motor,
      modeloBase: ru.cfg.modelo,
      llamar: (i) => ru.llamarLibre(i),
    };
  };
  const conMotor = (): MotorLibre => {
    const m = motor();
    if (!m) throw new HttpError(409, 'El motor de IA no está activo en este servidor');
    return m;
  };
  /** Una sola llamada de IA del asistente a la vez (evita gastar plan por doble clic). */
  const exclusivo = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (ocupado) throw new HttpError(409, 'El asistente ya está trabajando: espera su respuesta');
    ocupado = true;
    try {
      return await fn();
    } finally {
      ocupado = false;
    }
  };
  const vista = (s: Sesion) => ({
    ...s,
    fases: FASES,
    estimado_turno_tokens: estimadoTurno(s),
    ia: disponibilidadIa(db, motor(), s.turnos),
  });
  const sid = (q: Parameters<typeof idParam>[0]) => idParam(q);

  r.get(
    '/constructor/estado',
    ah((_q, res) => {
      res.json({
        ia: disponibilidadIa(db, motor()),
        plantillas: listarPlantillas(db),
        fases: FASES,
        sesiones: listarSesiones(db).map((s) => ({
          id: s.id,
          nombre: s.borrador.nombre ?? null,
          fase: s.fase,
          modo: s.modo,
        })),
      });
    }),
  );

  r.get(
    '/constructor/prompt',
    ah((_q, res) => {
      res.json({ texto: promptActivo(db, OFICINA_EDIFICIO, PROMPT_ARQUITECTA) ?? ARQUITECTA_BASE });
    }),
  );
  r.put(
    '/constructor/prompt',
    ah((q, res) => {
      const b = parse(z.object({ texto: z.string().trim().min(50).max(12000) }), q.body);
      const version = guardarPrompt(
        db,
        OFICINA_EDIFICIO,
        PROMPT_ARQUITECTA,
        b.texto,
        'Editado por el dueño',
      );
      res.json({ version });
    }),
  );

  r.post(
    '/constructor/sesiones',
    ah(async (q, res) => {
      const b = parse(
        z.object({
          modo: z.enum(['ia', 'formulario']).default('ia'),
          plantilla: z.string().trim().max(40).optional(),
        }),
        q.body,
      );
      res.status(201).json(vista(await dom(() => crearSesion(db, b))));
    }),
  );
  r.get(
    '/constructor/sesiones/:id',
    ah(async (q, res) => void res.json(vista(await dom(() => leerSesion(db, sid(q)))))),
  );

  r.post(
    '/constructor/sesiones/:id/turno',
    ah(async (q, res) => {
      const b = parse(z.object({ texto: z.string().max(2000) }), q.body);
      const out = await exclusivo(() => dom(() => turnoIa(db, conMotor(), sid(q), b.texto)));
      res.json({ ...vista(out.sesion), rechazos: out.rechazos });
    }),
  );

  r.patch(
    '/constructor/sesiones/:id',
    ah(async (q, res) => {
      const b = parse(
        z.object({
          parche: z.record(z.string(), z.unknown()).optional(),
          fase: z.number().int().min(1).max(FASES.length).optional(),
          modo: z.enum(['ia', 'formulario']).optional(),
        }),
        q.body,
      );
      const out = await dom(() => editarSesion(db, sid(q), b));
      res.json({ ...vista(out.sesion), rechazos: out.rechazos });
    }),
  );

  r.get(
    '/constructor/sesiones/:id/vista-previa',
    ah(async (q, res) => void res.json(await dom(() => vistaPrevia(db, sid(q))))),
  );

  r.post(
    '/constructor/sesiones/:id/prueba',
    ah(async (q, res) => {
      const b = parse(z.object({ confirmar: z.boolean().default(false) }), q.body);
      const out = await exclusivo(() =>
        dom(() => pruebaControlada(db, conMotor(), sid(q), b.confirmar)),
      );
      res.json({ respuesta: out.respuesta, tokens: out.tokens, sesion: vista(out.sesion) });
    }),
  );

  r.post(
    '/constructor/sesiones/:id/crear',
    ah(async (q, res) => {
      const b = parse(
        z.object({ aprobado: z.boolean(), confirmar_relajar: z.boolean().default(false) }),
        q.body,
      );
      const out = await dom(() =>
        crearPiso(db, sid(q), { aprobado: b.aprobado, confirmarRelajar: b.confirmar_relajar }),
      );
      d.runner?.alta(out.office_id);
      res.status(201).json({ office_id: out.office_id, advertencias: out.advertencias });
    }),
  );

  r.post(
    '/constructor/sesiones/:id/descartar',
    ah(async (q, res) => void res.json(vista(await dom(() => descartarSesion(db, sid(q)))))),
  );
  return r;
}
