import { Router } from 'express';
import { z } from 'zod';
import { probarModelo } from '../runner/probar-modelo';
import {
  estadoProveedores,
  listarModelos,
  PROVEEDORES_IDS,
  type ModeloInfo,
  type ProveedorId,
} from '../runner/proveedores';
import {
  guardarCalidad,
  guardarSeleccion,
  leerCalidad,
  leerSeleccion,
} from '../services/motor-seleccion';
import { ah, HttpError, parse, type Deps } from './util';

const prov = z.enum(PROVEEDORES_IDS as unknown as [ProveedorId, ...ProveedorId[]]);
const seleccionInput = z.object({ proveedor: prov, modelo: z.string().trim().max(120).optional() });
const probarInput = z.object({ proveedor: prov, modelo: z.string().trim().min(1).max(120) });
const calidadInput = z.object({
  proveedor: prov,
  modelo: z.string().trim().min(1).max(120),
  pct: z.number().int().min(0).max(100).nullable(),
});

const cache = new Map<string, { en: number; modelos: ModeloInfo[] }>();
const VIGENCIA_MS = 10 * 60_000;

/** Motor de IA: qué proveedores tienen llave, qué modelos ofrecen y cuál se usa (selección manual). */
export function motorRouter(d: Deps): Router {
  const r = Router();
  const env = d.env ?? process.env;
  const fetchFn = d.fuentes?.fetchFn ?? fetch;

  async function modelos(id: ProveedorId, forzar: boolean): Promise<ModeloInfo[]> {
    const c = cache.get(id);
    if (!forzar && c && Date.now() - c.en < VIGENCIA_MS) return c.modelos;
    const m = await listarModelos(id, env, fetchFn);
    cache.set(id, { en: Date.now(), modelos: m });
    return m;
  }

  r.get(
    '/motor',
    ah(async (q, res) => {
      const proveedores = await Promise.all(
        estadoProveedores(env).map(async (p) => {
          if (!p.conectado) return { ...p, modelos: [] as ModeloInfo[] };
          try {
            return { ...p, modelos: await modelos(p.id, q.query['refrescar'] === '1') };
          } catch (e) {
            return {
              ...p,
              conectado: false,
              motivo: e instanceof Error ? e.message : 'No se pudieron leer los modelos',
              modelos: [] as ModeloInfo[],
            };
          }
        }),
      );
      res.json({ seleccion: leerSeleccion(d.db), calidad: leerCalidad(d.db), proveedores });
    }),
  );

  r.put(
    '/motor/seleccion',
    ah(async (q, res) => {
      if (d.runner?.hayCorridaActiva())
        throw new HttpError(409, 'Hay una corrida en curso: cambia el motor cuando termine');
      const b = parse(seleccionInput, q.body);
      const estado = estadoProveedores(env).find((p) => p.id === b.proveedor)!;
      if (!estado.conectado) throw new HttpError(400, estado.motivo ?? 'Proveedor sin llave');
      if (b.proveedor !== 'claude') {
        if (!b.modelo) throw new HttpError(400, 'Elige un modelo');
        const lista = await modelos(b.proveedor, false).catch(() => []);
        if (lista.length > 0 && !lista.some((m) => m.id === b.modelo))
          throw new HttpError(400, 'Ese modelo no está disponible con tu llave');
      }
      guardarSeleccion(d.db, { proveedor: b.proveedor, modelo: b.modelo ?? '' });
      res.json(leerSeleccion(d.db));
    }),
  );

  r.post(
    '/motor/probar',
    ah(async (q, res) => {
      const b = parse(probarInput, q.body);
      res.json(await probarModelo(b.proveedor, b.modelo, env, fetchFn));
    }),
  );

  r.put(
    '/motor/calidad',
    ah((q, res) => {
      const b = parse(calidadInput, q.body);
      guardarCalidad(d.db, `${b.proveedor}/${b.modelo}`, b.pct);
      res.json(leerCalidad(d.db));
    }),
  );

  return r;
}
