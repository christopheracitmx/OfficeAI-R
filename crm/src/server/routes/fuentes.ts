import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { importarDenue } from '../fuentes/import-denue';
import { importarOverture } from '../fuentes/import-overture';
import {
  activarFuente,
  crearCtx,
  estadoFuentes,
  FUENTES,
  FUENTES_DESCARTADAS,
  fuentePorId,
} from '../fuentes/registro';
import { nowIso } from '../db';
import { ah, HttpError, oficinaDe, parse, type Deps } from './util';

const patchInput = z.object({
  activa: z.boolean().optional(),
  tope_mensual: z.number().int().min(0).max(1_000_000).optional(),
});
const configInput = z.object({
  tamano_min: z.number().int().min(0).max(1000).optional(),
  incluir_sin_tamano: z.boolean().optional(),
});
const importarInput = z.object({
  archivos: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  version: z.string().trim().min(1).max(60),
  fecha_dataset: z.string().trim().max(40).optional(),
  estrato_min: z.number().int().min(1).max(7).optional(),
  confianza_min: z.number().min(0).max(1).optional(),
  reemplazar: z.boolean().optional(),
});

/** Carpeta de datasets locales: data/datasets/<fuente> junto a la base (o la que fije la prueba). */
function dirDatasets(d: Deps, fuente: string): string {
  const base =
    d.fuentes?.dirDatasets ??
    (d.db.name && d.db.name !== ':memory:' ? join(dirname(resolve(d.db.name)), 'datasets') : null);
  if (!base) throw new HttpError(400, 'Esta base no tiene carpeta de datasets (modo memoria)');
  return join(base, fuente === 'denue_local' ? 'denue' : 'overture');
}

export function fuentesRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;
  const env = d.env ?? process.env;

  r.get(
    '/fuentes',
    ah((q, res) => {
      const office = oficinaDe(q);
      const cfg = (k: string) =>
        (
          db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(k) as
            { valor: string } | undefined
        )?.valor;
      res.json({
        fuentes: estadoFuentes(db, office, env),
        descartadas: FUENTES_DESCARTADAS,
        config: {
          tamano_min: Number(cfg('fuentes_tamano_min') ?? 11),
          incluir_sin_tamano: cfg('fuentes_incluir_sin_tamano') !== '0',
        },
      });
    }),
  );

  r.patch(
    '/fuentes-config',
    ah((q, res) => {
      const b = parse(configInput, q.body);
      const up = db.prepare(
        'INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en',
      );
      if (b.tamano_min !== undefined) up.run('fuentes_tamano_min', String(b.tamano_min), nowIso());
      if (b.incluir_sin_tamano !== undefined)
        up.run('fuentes_incluir_sin_tamano', b.incluir_sin_tamano ? '1' : '0', nowIso());
      res.json({ ok: true });
    }),
  );

  r.patch(
    '/fuentes/:id',
    ah((q, res) => {
      const f = fuentePorId(String(q.params['id']));
      if (!f) throw new HttpError(404, 'Fuente desconocida');
      const b = parse(patchInput, q.body);
      if (b.activa !== undefined) activarFuente(db, f.id, oficinaDe(q), b.activa);
      if (b.tope_mensual !== undefined) {
        if (f.tope_defecto === null)
          throw new HttpError(400, 'Las fuentes locales no tienen tope: no consumen cuota');
        db.prepare(
          'INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en',
        ).run(`fuente_tope_${f.id}`, String(b.tope_mensual), nowIso());
      }
      res.json({ ok: true });
    }),
  );

  // «Probar conexión»: 1 consulta mínima (cuenta contra el tope de la fuente).
  r.post(
    '/fuentes/:id/probar',
    ah(async (q, res) => {
      const f = fuentePorId(String(q.params['id']));
      if (!f) throw new HttpError(404, 'Fuente desconocida');
      res.json(
        await f.probar(
          crearCtx(db, env, f, { fetchFn: d.fuentes?.fetchFn, esperar: d.fuentes?.esperar }),
        ),
      );
    }),
  );

  r.get(
    '/fuentes/:id/archivos',
    ah((q, res) => {
      const f = fuentePorId(String(q.params['id']));
      if (!f || f.tipo !== 'dataset_local') throw new HttpError(404, 'Esta fuente no usa archivos');
      const dir = dirDatasets(d, f.id);
      const ext = f.id === 'denue_local' ? /\.csv$/i : /\.(geojsonl?|jsonl|json|geojsonseq)$/i;
      const archivos = existsSync(dir)
        ? readdirSync(dir)
            .filter((n) => ext.test(n))
            .map((n) => ({
              nombre: n,
              mb: Math.round((statSync(join(dir, n)).size / 1048576) * 10) / 10,
            }))
        : [];
      res.json({ carpeta: dir, archivos });
    }),
  );

  // Importa archivos YA descargados por el dueño (solo nombres dentro de la carpeta de datasets).
  r.post(
    '/fuentes/:id/importar',
    ah(async (q, res) => {
      const f = fuentePorId(String(q.params['id']));
      if (!f || f.tipo !== 'dataset_local') throw new HttpError(404, 'Esta fuente no usa archivos');
      const b = parse(importarInput, q.body);
      const dir = dirDatasets(d, f.id);
      const rutas = b.archivos.map((n) => {
        if (/[\\/]/.test(n) || n.includes('..'))
          throw new HttpError(400, 'Nombre de archivo inválido');
        const ruta = join(dir, n);
        if (!existsSync(ruta)) throw new HttpError(404, `No existe ${n} en ${dir}`);
        return ruta;
      });
      const resumen =
        f.id === 'denue_local'
          ? await importarDenue(db, rutas, {
              version: b.version,
              fecha_dataset: b.fecha_dataset,
              estrato_min: b.estrato_min,
              reemplazar: b.reemplazar,
            })
          : await importarOverture(db, rutas[0]!, {
              version: b.version,
              fecha_dataset: b.fecha_dataset,
              confianza_min: b.confianza_min,
              reemplazar: b.reemplazar,
            });
      res.json(resumen);
    }),
  );

  // Panel de Corrida: qué aportó cada fuente (última consulta de cada una en la corrida).
  r.get(
    '/fuentes/corrida/:id',
    ah((q, res) => {
      const id = Number(q.params['id']);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id inválido');
      const office = oficinaDe(q);
      const filas = db
        .prepare(
          `SELECT fuente_id, SUM(encontrados) AS encontrados, SUM(nuevos) AS nuevos, SUM(fusionados) AS fusionados,
             SUM(rechazados) AS rechazados, MAX(id) AS ultimo_id
           FROM candidatos_fuente WHERE corrida_id = ? AND office_id = ? GROUP BY fuente_id ORDER BY MIN(id)`,
        )
        .all(id, office) as { fuente_id: string; ultimo_id: number }[];
      const estado = db.prepare('SELECT estado, detalle FROM candidatos_fuente WHERE id = ?');
      res.json(
        filas.map((f) => ({
          ...f,
          nombre: FUENTES.find((x) => x.id === f.fuente_id)?.nombre ?? f.fuente_id,
          ...(estado.get(f.ultimo_id) as { estado: string; detalle: string | null }),
        })),
      );
    }),
  );

  return r;
}
