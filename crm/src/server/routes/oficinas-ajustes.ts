import { Router, type Request } from 'express';
import { z } from 'zod';
import { CANDADOS } from '../../shared/candados';
import { CATALOGO, HERRAMIENTAS_GENERICAS } from '../../shared/catalogo';
import { officeIdSchema } from '../../shared/oficinas';
import { herramientasPermitidas } from '../offices/herramientas';
import {
  activarArchivos,
  agregarCarpeta,
  estadoArchivos,
  quitarCarpeta,
  revertirMovimiento,
} from '../services/archivos';
import { registrarCambio } from '../services/cambios';
import { candadosRelajados, fijarCandados } from '../services/candados';
import { KbError } from '../services/kb';
import { oficinaActivaOError } from '../services/oficinas';
import { ah, HttpError, parse, type Deps } from './util';

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Ajustes por oficina: catálogo de herramientas, herramientas permitidas, correo, archivos (sandbox) y candados. */
export function ajustesRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  const oficina = (req: Request): string => {
    const id = parse(officeIdSchema, req.params['id']);
    oficinaActivaOError(db, id);
    return id;
  };
  /** Las herramientas efectivas cambian: el runner de la oficina se reconstruye (si no hay corrida en curso). */
  const refrescar = (id: string): void => {
    try {
      d.runner?.alta(id);
    } catch {
      /* corrida en curso: se aplicará en la siguiente alta */
    }
  };

  r.get(
    '/catalogo-herramientas',
    ah((_q, res) => void res.json({ herramientas: CATALOGO, candados: CANDADOS })),
  );

  r.get(
    '/oficinas/:id/ajustes',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      const f = db
        .prepare(
          'SELECT herramientas_json, archivos_activo, correo_activo FROM oficinas WHERE id = ?',
        )
        .get(id) as {
        herramientas_json: string | null;
        archivos_activo: number;
        correo_activo: number;
      };
      res.json({
        herramientas_efectivas: herramientasPermitidas(db, id),
        herramientas_configuradas: f.herramientas_json
          ? (JSON.parse(f.herramientas_json) as string[])
          : null,
        archivos_activo: f.archivos_activo === 1,
        correo_activo: f.correo_activo === 1,
        candados_relajados: candadosRelajados(db, id),
      });
    }),
  );

  r.put(
    '/oficinas/:id/ajustes',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      const b = parse(
        z.object({
          correo_activo: z.boolean().optional(),
          herramientas: z.array(z.string().max(60)).max(30).optional(),
        }),
        q.body,
      );
      if (b.herramientas) {
        const malas = b.herramientas.filter((h) => !HERRAMIENTAS_GENERICAS.includes(h));
        if (malas.length > 0)
          throw new HttpError(422, `Herramientas fuera del catálogo genérico: ${malas.join(', ')}`);
        db.prepare('UPDATE oficinas SET herramientas_json = ? WHERE id = ?').run(
          JSON.stringify([...new Set(b.herramientas)]),
          id,
        );
        registrarCambio(
          db,
          id,
          'herramientas',
          null,
          'cambió las herramientas permitidas',
          b.herramientas.join(', '),
        );
      }
      if (b.correo_activo !== undefined) {
        db.prepare('UPDATE oficinas SET correo_activo = ? WHERE id = ?').run(
          b.correo_activo ? 1 : 0,
          id,
        );
        registrarCambio(
          db,
          id,
          'correo',
          null,
          b.correo_activo ? 'activó el correo de avisos' : 'desactivó el correo de avisos',
        );
      }
      refrescar(id);
      res.json({ ok: true });
    }),
  );

  r.put(
    '/oficinas/:id/candados',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      const b = parse(
        z.object({
          relajados: z.array(z.string().max(40)).max(10),
          confirmar: z.boolean().default(false),
        }),
        q.body,
      );
      res.json({ relajados: await dom(() => fijarCandados(db, id, b.relajados, b.confirmar)) });
    }),
  );

  // ---- Archivos (sandbox): carpetas autorizadas, activación y registro de cambios
  r.get(
    '/oficinas/:id/archivos',
    ah(async (q, res) => {
      res.json(await dom(() => estadoArchivos(db, oficina(q))));
    }),
  );

  r.put(
    '/oficinas/:id/archivos',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      const { activo } = parse(z.object({ activo: z.boolean() }), q.body);
      await dom(() => activarArchivos(db, id, activo));
      refrescar(id);
      res.json(estadoArchivos(db, id));
    }),
  );

  r.post(
    '/oficinas/:id/archivos/carpetas',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      const { ruta } = parse(z.object({ ruta: z.string().min(3).max(500) }), q.body);
      await dom(() => agregarCarpeta(db, id, ruta));
      res.status(201).json(estadoArchivos(db, id));
    }),
  );

  r.delete(
    '/oficinas/:id/archivos/carpetas/:cid',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      await dom(() => quitarCarpeta(db, id, Number(q.params['cid'])));
      refrescar(id);
      res.json(estadoArchivos(db, id));
    }),
  );

  r.post(
    '/oficinas/:id/archivos/log/:lid/revertir',
    ah(async (q, res) => {
      const id = await dom(() => oficina(q));
      await dom(() => revertirMovimiento(db, id, Number(q.params['lid'])));
      res.json(estadoArchivos(db, id));
    }),
  );

  return r;
}
