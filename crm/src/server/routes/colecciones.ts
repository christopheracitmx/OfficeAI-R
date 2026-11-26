import { Router } from 'express';
import { coleccionInput, coleccionPatch, registroInput } from '../../shared/colecciones';
import {
  coleccionOError,
  crearColeccion,
  editarColeccion,
  estadoColeccion,
  listarColecciones,
} from '../services/colecciones';
import { coleccionCsv } from '../services/colecciones-csv';
import {
  archivarRegistro,
  editarRegistro,
  historialRegistro,
  listarRegistros,
  upsertRegistro,
} from '../services/colecciones-registros';
import { registrarCambio } from '../services/cambios';
import { KbError } from '../services/kb';
import { ah, HttpError, idParam, oficinaDe, parse, qstr, type Deps } from './util';

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id inválido');
  return n;
};

/** «Datos» por oficina: colecciones definidas por el dueño, sus registros (sin borrado físico) y CSV. */
export function coleccionesRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;

  r.get(
    '/colecciones',
    ah((q, res) => {
      res.json(listarColecciones(db, oficinaDe(q), q.query['archivadas'] === '1'));
    }),
  );

  r.post(
    '/colecciones',
    ah(async (q, res) => {
      const i = parse(coleccionInput, q.body);
      res.status(201).json(await dom(() => crearColeccion(db, oficinaDe(q), i)));
    }),
  );

  r.get(
    '/colecciones/:id',
    ah(async (q, res) => {
      res.json(await dom(() => coleccionOError(db, oficinaDe(q), idParam(q))));
    }),
  );

  r.patch(
    '/colecciones/:id',
    ah(async (q, res) => {
      const p = parse(coleccionPatch, q.body);
      res.json(await dom(() => editarColeccion(db, oficinaDe(q), idParam(q), p)));
    }),
  );

  for (const [ruta, estado] of [
    ['archivar', 'archivada'],
    ['restaurar', 'activa'],
  ] as const)
    r.post(
      `/colecciones/:id/${ruta}`,
      ah(async (q, res) => {
        res.json(await dom(() => estadoColeccion(db, oficinaDe(q), idParam(q), estado)));
      }),
    );

  r.get(
    '/colecciones/:id/registros',
    ah(async (q, res) => {
      const estado = qstr(q.query['estado']);
      res.json(
        await dom(() =>
          listarRegistros(db, oficinaDe(q), idParam(q), {
            q: qstr(q.query['q']),
            estado: estado === 'archivado' || estado === 'todos' ? estado : 'activo',
            limite: Number(q.query['limite']) || undefined,
            desde: Number(q.query['desde']) || undefined,
          }),
        ),
      );
    }),
  );

  r.post(
    '/colecciones/:id/registros',
    ah(async (q, res) => {
      const i = parse(registroInput, q.body);
      const out = await dom(() => upsertRegistro(db, oficinaDe(q), idParam(q), i, 'dueño'));
      res.status(out.accion === 'creado' ? 201 : 200).json(out);
    }),
  );

  r.patch(
    '/colecciones/:id/registros/:rid',
    ah(async (q, res) => {
      const i = parse(registroInput, q.body);
      res.json(
        await dom(() => editarRegistro(db, oficinaDe(q), idParam(q), num(q.params['rid']), i)),
      );
    }),
  );

  for (const [ruta, archivar] of [
    ['archivar', true],
    ['restaurar', false],
  ] as const)
    r.post(
      `/colecciones/:id/registros/:rid/${ruta}`,
      ah(async (q, res) => {
        await dom(() =>
          archivarRegistro(db, oficinaDe(q), idParam(q), num(q.params['rid']), archivar),
        );
        res.json({ ok: true });
      }),
    );

  r.get(
    '/colecciones/:id/registros/:rid/historial',
    ah(async (q, res) => {
      res.json(
        await dom(() => historialRegistro(db, oficinaDe(q), idParam(q), num(q.params['rid']))),
      );
    }),
  );

  r.get(
    '/colecciones/:id/csv',
    ah(async (q, res) => {
      const office = oficinaDe(q);
      const csv = await dom(() => coleccionCsv(db, office, idParam(q)));
      const c = coleccionOError(db, office, idParam(q));
      registrarCambio(db, office, 'coleccion', String(c.id), 'exportó CSV', c.nombre);
      const nombre = c.nombre.replace(/[^\w-]+/g, '_').slice(0, 40) || 'coleccion';
      res
        .type('text/csv; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="${nombre}.csv"`)
        .send(csv);
    }),
  );

  return r;
}
