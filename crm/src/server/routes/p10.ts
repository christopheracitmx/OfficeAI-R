import { Router } from 'express';
import { coleccionesRouter } from './colecciones';
import { constructorRouter } from './constructor';
import { paquetesRouter } from './paquetes';
import type { Deps } from './util';

/** Rutas del dueño de la fase P10: colecciones, paquetes/galería y Constructor «Nuevo piso». */
export function p10Router(d: Deps): Router {
  const r = Router();
  r.use(coleccionesRouter(d));
  r.use(paquetesRouter(d));
  r.use(constructorRouter(d));
  return r;
}
