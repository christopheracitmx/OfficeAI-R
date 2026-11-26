/** API del Personalizador (solo el dueño: pasa por el control de Origin). La oficina viene de x-office-id / ?office_id. */
import { Router } from 'express';
import { z } from 'zod';
import { ENTIDADES, type Entidad } from '../../shared/oficina3d/composicion';
import {
  deshacer,
  estadoApariencias,
  guardarCapa,
  leerCapa,
  rehacer,
  restablecer,
  restaurarVersion,
} from '../services/apariencias';
import {
  ACCIONES_EQUIPO,
  accionEquipo,
  aleatorioEntidad,
  type AccionEquipo,
} from '../services/apariencias-equipo';
import {
  borrarPreset,
  crearPreset,
  duplicarPreset,
  exportarPreset,
  importarPreset,
  listarPresets,
} from '../services/apariencias-presets';
import { KbError } from '../services/kb';
import { ah, HttpError, oficinaDe, parse, type Deps } from './util';

const entidadSchema = z.enum(ENTIDADES);
const idEntidad = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[\w.\- ]+$/);
const campos = z.record(z.string(), z.unknown());
const capaBody = z.object({
  preset: z.number().int().positive().nullable().optional(),
  overrides: campos,
  nota: z.string().max(80).optional(),
});
const semillaSchema = z.number().int().min(0).max(4294967295).optional();

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

export function aparienciasRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  const semilla = (s?: number): number => s ?? Math.floor(Math.random() * 4294967296);
  const presetId = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id de preset inválido');
    return n;
  };

  r.get(
    '/apariencias',
    ah(async (q, res) => void res.json(await dom(() => estadoApariencias(db, oficinaDe(q))))),
  );

  // ---- Presets
  r.get(
    '/apariencias/presets',
    ah((q, res) => {
      const t =
        typeof q.query['tipo'] === 'string' ? entidadSchema.safeParse(q.query['tipo']) : null;
      res.json(listarPresets(db, oficinaDe(q), t?.success ? t.data : undefined));
    }),
  );
  r.post(
    '/apariencias/presets',
    ah(async (q, res) => {
      const b = parse(z.object({ tipo: entidadSchema, nombre: z.string(), json: campos }), q.body);
      res
        .status(201)
        .json(await dom(() => crearPreset(db, oficinaDe(q), b.tipo, b.nombre, b.json)));
    }),
  );
  r.post(
    '/apariencias/presets/importar',
    ah(async (q, res) => {
      const b = parse(z.object({ contenido: z.unknown() }), q.body);
      res.status(201).json(await dom(() => importarPreset(db, oficinaDe(q), b.contenido)));
    }),
  );
  r.post(
    '/apariencias/presets/:id/duplicar',
    ah(async (q, res) => {
      const id = presetId(q.params['id']);
      res.status(201).json(await dom(() => duplicarPreset(db, oficinaDe(q), id)));
    }),
  );
  r.get(
    '/apariencias/presets/:id/exportar',
    ah(async (q, res) => {
      const id = presetId(q.params['id']);
      res.json(await dom(() => exportarPreset(db, oficinaDe(q), id)));
    }),
  );
  r.delete(
    '/apariencias/presets/:id',
    ah(async (q, res) => {
      const id = presetId(q.params['id']);
      await dom(() => borrarPreset(db, oficinaDe(q), id));
      res.json({ ok: true });
    }),
  );

  // ---- Equipo (todos los personajes de la oficina)
  r.post(
    '/apariencias/equipo',
    ah(async (q, res) => {
      const b = parse(
        z.object({ accion: z.enum(ACCIONES_EQUIPO), semilla: semillaSchema }),
        q.body,
      );
      const o = oficinaDe(q);
      res.json(await dom(() => accionEquipo(db, o, b.accion as AccionEquipo, semilla(b.semilla))));
    }),
  );

  // ---- Una entidad (personaje, sala u oficina)
  const ent = (params: Record<string, unknown>) => ({
    entidad: parse(entidadSchema, params['entidad']) as Entidad,
    id: parse(idEntidad, params['entidadId']),
  });
  const ruta = '/apariencias/:entidad/:entidadId';
  r.get(
    ruta,
    ah(async (q, res) => {
      const { entidad, id } = ent(q.params);
      res.json(await dom(() => leerCapa(db, oficinaDe(q), entidad, id)));
    }),
  );
  r.put(
    ruta,
    ah(async (q, res) => {
      const { entidad, id } = ent(q.params);
      const b = parse(capaBody, q.body);
      const o = oficinaDe(q);
      await dom(() => guardarCapa(db, o, entidad, id, b, b.nota ?? 'guardó cambios'));
      res.json(leerCapa(db, o, entidad, id));
    }),
  );
  const accion = (
    nombre: string,
    fn: (o: string, e: Entidad, id: string, body: unknown) => unknown,
  ) =>
    r.post(
      `${ruta}/${nombre}`,
      ah(async (q, res) => {
        const { entidad, id } = ent(q.params);
        const o = oficinaDe(q);
        await dom(() => fn(o, entidad, id, q.body));
        res.json(leerCapa(db, o, entidad, id));
      }),
    );
  accion('deshacer', (o, e, id) => deshacer(db, o, e, id));
  accion('rehacer', (o, e, id) => rehacer(db, o, e, id));
  accion('restablecer', (o, e, id) => restablecer(db, o, e, id));
  accion('restaurar', (o, e, id, body) =>
    restaurarVersion(
      db,
      o,
      e,
      id,
      parse(z.object({ version: z.number().int().positive() }), body).version,
    ),
  );
  accion('aleatorio', (o, e, id, body) =>
    aleatorioEntidad(
      db,
      o,
      e,
      id,
      semilla(parse(z.object({ semilla: semillaSchema }), body ?? {}).semilla),
    ),
  );
  return r;
}
