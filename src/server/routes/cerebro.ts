import { Router } from 'express';
import { z } from 'zod';
import {
  habilidadInput,
  habilidadPatch,
  kbDocInput,
  kbDocPatch,
  kbProductoInput,
  kbProductoPatch,
  promptInput,
} from '../../shared/cerebro';
import {
  asignarHabilidad,
  crearHabilidad,
  editarHabilidad,
  listarHabilidades,
  restaurarHabilidad,
  versionesHabilidad,
} from '../services/habilidades';
import { listarCambios } from '../services/cambios';
import {
  KbError,
  crearDoc,
  editarDoc,
  leerDoc,
  listarDocs,
  restaurarDoc,
  versionesDoc,
} from '../services/kb';
import {
  activarProducto,
  guardarProducto,
  importarCsv,
  listarProductos,
} from '../services/kb-productos';
import {
  GLOBAL,
  estimarTokens,
  guardarPrompt,
  listarPrompts,
  restaurarPrompt,
  versionesPrompt,
} from '../services/prompts-db';
import { ah, HttpError, idParam, parse, qstr, type Deps } from './util';

const OFICINA = 'prospeccion';
const office = (q: { query: Record<string, unknown> }): string =>
  qstr(q.query['office_id']) ?? OFICINA;

/** Traduce los errores del dominio a HTTP. */
const kb = async <T>(fn: () => T): Promise<T> => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
};

/** Biblioteca, prompts, habilidades, agentes y registro de cambios (rutas del dueño). */
export function cerebroRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;

  // ---- Biblioteca: documentos
  r.get(
    '/kb/docs',
    ah((q, res) => {
      const act = qstr(q.query['activo']);
      res.json(
        listarDocs(db, office(q), {
          tipo: qstr(q.query['tipo']),
          q: qstr(q.query['q']),
          activo: act === undefined ? undefined : act === '1',
        }),
      );
    }),
  );
  r.post(
    '/kb/docs',
    ah(async (q, res) => {
      const i = parse(kbDocInput, { office_id: office(q), ...(q.body as object) });
      res.status(201).json(await kb(() => crearDoc(db, i)));
    }),
  );
  r.get(
    '/kb/docs/:id',
    ah((q, res) => {
      const doc = leerDoc(db, idParam(q));
      if (!doc) throw new HttpError(404, 'Documento no encontrado');
      res.json(doc);
    }),
  );
  r.patch(
    '/kb/docs/:id',
    ah(async (q, res) => {
      const p = parse(kbDocPatch, q.body);
      res.json(await kb(() => editarDoc(db, idParam(q), p)));
    }),
  );
  r.get(
    '/kb/docs/:id/versiones',
    ah((q, res) => void res.json(versionesDoc(db, idParam(q)))),
  );
  r.post(
    '/kb/docs/:id/restaurar',
    ah(async (q, res) => {
      const { version } = parse(z.object({ version: z.number().int().positive() }), q.body);
      res.json(await kb(() => restaurarDoc(db, idParam(q), version)));
    }),
  );

  // ---- Biblioteca: productos (sin precios)
  r.get(
    '/kb/productos',
    ah((q, res) => void res.json(listarProductos(db, office(q), qstr(q.query['q'])))),
  );
  r.post(
    '/kb/productos',
    ah(async (q, res) => {
      const i = parse(kbProductoInput, { office_id: office(q), ...(q.body as object) });
      res.status(201).json(await kb(() => guardarProducto(db, i)));
    }),
  );
  r.patch(
    '/kb/productos/:id',
    ah(async (q, res) => {
      const { activo, ...resto } = parse(kbProductoPatch, q.body);
      const id = idParam(q);
      if (activo !== undefined) await kb(() => activarProducto(db, id, activo));
      if (Object.keys(resto).length > 0) {
        const act = db.prepare('SELECT * FROM kb_productos WHERE id = ?').get(id) as
          Record<string, string> | undefined;
        if (!act) throw new HttpError(404, 'Producto no encontrado');
        const i = parse(kbProductoInput, { ...act, ...resto });
        res.json(await kb(() => guardarProducto(db, i, id)));
      } else res.json({ ok: true });
    }),
  );
  r.post(
    '/kb/productos/importar',
    ah(async (q, res) => {
      const { csv } = parse(z.object({ csv: z.string().min(5).max(200_000) }), q.body);
      res.json(await kb(() => importarCsv(db, office(q), csv)));
    }),
  );

  // ---- Prompts (global + por rol) con versiones
  r.get(
    '/prompts',
    ah((q, res) => void res.json(listarPrompts(db, office(q)))),
  );
  r.get(
    '/prompts/:nombre',
    ah((q, res) => {
      const v = versionesPrompt(db, office(q), String(q.params['nombre']));
      if (v.length === 0) throw new HttpError(404, 'Prompt no encontrado');
      res.json(v.map((x) => ({ ...x, tokens: estimarTokens(x.texto) })));
    }),
  );
  r.put(
    '/prompts/:nombre',
    ah(async (q, res) => {
      const nombre = String(q.params['nombre']);
      if (versionesPrompt(db, office(q), nombre).length === 0)
        throw new HttpError(404, 'Prompt no encontrado');
      const { texto, nota } = parse(promptInput, q.body);
      res.json({ version: guardarPrompt(db, office(q), nombre, texto, nota) });
    }),
  );
  r.post(
    '/prompts/:nombre/restaurar',
    ah(async (q, res) => {
      const { version } = parse(z.object({ version: z.number().int().positive() }), q.body);
      res.json({
        version: await kb(() =>
          restaurarPrompt(db, office(q), String(q.params['nombre']), version),
        ),
      });
    }),
  );
  r.get(
    '/prompts-pasos',
    ah((q, res) => void res.json(d.runner?.pasosDe(office(q)) ?? [])),
  );
  /** Prompt final compuesto (global + rol + lecciones + habilidades + contexto + candados) con estimado de tokens. */
  r.get(
    '/prompt-final',
    ah((q, res) => {
      const paso = qstr(q.query['paso']);
      const texto = paso ? d.runner?.promptFinal(office(q), paso) : null;
      if (!texto) throw new HttpError(404, 'Paso no encontrado');
      res.json({ texto, tokens: estimarTokens(texto), global: GLOBAL });
    }),
  );

  // ---- Habilidades
  r.get(
    '/habilidades',
    ah((q, res) => void res.json(listarHabilidades(db, office(q)))),
  );
  r.post(
    '/habilidades',
    ah(async (q, res) => {
      const i = parse(habilidadInput, { office_id: office(q), ...(q.body as object) });
      res.status(201).json(await kb(() => crearHabilidad(db, i)));
    }),
  );
  r.patch(
    '/habilidades/:id',
    ah(async (q, res) => {
      const p = parse(habilidadPatch, q.body);
      res.json(await kb(() => editarHabilidad(db, idParam(q), p)));
    }),
  );
  r.get(
    '/habilidades/:id/versiones',
    ah((q, res) => void res.json(versionesHabilidad(db, idParam(q)))),
  );
  r.post(
    '/habilidades/:id/restaurar',
    ah(async (q, res) => {
      const { version } = parse(z.object({ version: z.number().int().positive() }), q.body);
      res.json(await kb(() => restaurarHabilidad(db, idParam(q), version)));
    }),
  );
  r.put(
    '/habilidades/:id/agentes',
    ah(async (q, res) => {
      const { agentes } = parse(z.object({ agentes: z.array(z.string().max(60)).max(40) }), q.body);
      await kb(() => asignarHabilidad(db, idParam(q), agentes));
      res.json({ ok: true });
    }),
  );

  // ---- Agentes y registro de cambios
  r.get(
    '/agentes',
    ah(
      (q, res) =>
        void res.json(
          db.prepare('SELECT * FROM agentes WHERE office_id = ? ORDER BY rowid').all(office(q)),
        ),
    ),
  );
  r.get(
    '/cambios',
    ah((q, res) => void res.json(listarCambios(db, office(q), Number(q.query['limit']) || 100))),
  );
  return r;
}
