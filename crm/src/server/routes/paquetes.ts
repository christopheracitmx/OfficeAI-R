import { Router } from 'express';
import { z } from 'zod';
import { officeIdSchema } from '../../shared/oficinas';
import { cargarWorkflowOficina } from '../offices/cargador';
import { listarPlantillas, paqueteDePlantilla } from '../services/galeria';
import { KbError } from '../services/kb';
import { idDesdeNombre, obtenerOficina } from '../services/oficinas';
import { crearOficinaDesdePaquete } from '../services/paquete-crear';
import { exportarPaquete } from '../services/paquete-export';
import { diferencias, resumenDe, validarPaquete } from '../services/paquete-validar';
import { ah, HttpError, parse, type Deps } from './util';

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Paquetes de oficina (exportar/importar con vista previa) y galería de plantillas base. */
export function paquetesRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  const dir = d.dirOficinas ?? `${process.cwd()}/config/offices`;
  const leerWf = (id: string) => {
    try {
      return d.runner?.oficina(id)?.workflow ?? cargarWorkflowOficina(db, dir, id);
    } catch {
      return null;
    }
  };

  r.get(
    '/oficinas/:id/exportar',
    ah(async (q, res) => {
      const id = parse(officeIdSchema, q.params['id']);
      const p = await dom(() => exportarPaquete(db, id, leerWf));
      const nombre = id.replace(/[^\w-]+/g, '_');
      res
        .type('application/json; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="paquete-${nombre}.json"`)
        .send(JSON.stringify(p, null, 2));
    }),
  );

  /** Valida el paquete SIN crear nada y muestra qué se crearía (y las diferencias con otra oficina si se pide). */
  r.post(
    '/paquetes/vista-previa',
    ah(async (q, res) => {
      const b = parse(
        z.object({
          paquete: z.unknown(),
          nombre: z.string().trim().min(2).max(60).optional(),
          comparar_con: officeIdSchema.optional(),
        }),
        q.body,
      );
      const nombre =
        b.nombre ??
        (b.paquete as { office?: { nombre?: string } } | null)?.office?.nombre ??
        'Nuevo piso';
      const id = idDesdeNombre(db, nombre);
      const v = validarPaquete(db, b.paquete, id);
      if (!v.paquete)
        return void res.json({ ok: false, errores: v.errores, advertencias: v.advertencias });
      const resumen = resumenDe(v.paquete);
      let dif = null;
      if (b.comparar_con) {
        if (!obtenerOficina(db, b.comparar_con))
          throw new HttpError(404, 'Oficina a comparar desconocida');
        const base = await dom(() => exportarPaquete(db, b.comparar_con!, leerWf));
        dif = diferencias(resumen, resumenDe(base));
      }
      res.json({
        ok: v.ok,
        errores: v.errores,
        advertencias: v.advertencias,
        id_propuesto: id,
        resumen,
        diferencias: dif,
        requiere_confirmar_candados: v.paquete.candados.relajados.length > 0,
      });
    }),
  );

  r.post(
    '/paquetes/importar',
    ah(async (q, res) => {
      const b = parse(
        z.object({
          paquete: z.unknown(),
          nombre: z.string().trim().min(2).max(60).optional(),
          confirmar_relajar: z.boolean().default(false),
        }),
        q.body,
      );
      const out = await dom(() =>
        crearOficinaDesdePaquete(db, b.paquete, {
          nombre: b.nombre,
          confirmarRelajar: b.confirmar_relajar,
          origen: 'importado',
        }),
      );
      d.runner?.alta(out.id);
      res.status(201).json(out);
    }),
  );

  r.get(
    '/galeria',
    ah((_q, res) => void res.json(listarPlantillas(db))),
  );

  r.post(
    '/galeria/:plantilla/crear',
    ah(async (q, res) => {
      const b = parse(z.object({ nombre: z.string().trim().min(2).max(60).optional() }), q.body);
      const out = await dom(() =>
        crearOficinaDesdePaquete(db, paqueteDePlantilla(db, String(q.params['plantilla'])), {
          nombre: b.nombre,
          origen: `galeria:${String(q.params['plantilla'])}`,
        }),
      );
      d.runner?.alta(out.id);
      res.status(201).json(out);
    }),
  );

  return r;
}
