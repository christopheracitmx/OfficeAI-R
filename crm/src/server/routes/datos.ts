import { Router } from 'express';
import { z } from 'zod';
import { prospectosCsv } from '../services/csv';
import { KbError } from '../services/kb';
import {
  crearRespaldoManual,
  listarRespaldos,
  registrarRestauracion,
  restaurarRespaldo,
} from '../services/respaldos';
import { ah, HttpError, oficinaDe, parse, qstr, type Deps } from './util';

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Exportar a CSV y respaldo/restauración manual de la base. Va montado ANTES de /prospectos/:id. */
export function datosRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;

  r.get(
    '/prospectos/export.csv',
    ah((q, res) => {
      const f = {
        ...(qstr(q.query['estado']) ? { estado: qstr(q.query['estado'])! } : {}),
        ...(qstr(q.query['nivel']) ? { nivel: qstr(q.query['nivel'])! } : {}),
        ...(qstr(q.query['zona']) ? { zona: qstr(q.query['zona'])! } : {}),
        ...(qstr(q.query['giro']) ? { giro: qstr(q.query['giro'])! } : {}),
        ...(qstr(q.query['metodo']) ? { metodo: qstr(q.query['metodo'])! } : {}),
        ...(qstr(q.query['q']) ? { q: qstr(q.query['q'])! } : {}),
        sinVer: q.query['sinVer'] === '1',
        office_id: oficinaDe(q),
      };
      const fecha = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="prospectos-${fecha}.csv"`);
      res.send(prospectosCsv(db, f));
    }),
  );

  r.get(
    '/respaldos',
    ah(async (_q, res) => void res.json(await dom(() => listarRespaldos(db)))),
  );
  r.post(
    '/respaldos',
    ah(async (_q, res) => void res.status(201).json(await dom(() => crearRespaldoManual(db)))),
  );
  r.post(
    '/respaldos/restaurar',
    ah(async (q, res) => {
      const i = parse(
        z.object({ archivo: z.string().max(200), confirmacion: z.string().max(40) }),
        q.body,
      );
      const out = await dom(() => restaurarRespaldo(db, i.archivo, i.confirmacion));
      registrarRestauracion(db, out);
      res.json(out);
    }),
  );
  return r;
}
