import type { Request, Router } from 'express';
import { z } from 'zod';
import { registroAgenteInput } from '../../shared/colecciones';
import { herramientaPermitida } from '../offices/herramientas';
import { archivosLeer, archivosListar, archivosMoverCuarentena } from '../services/archivos';
import { coleccionPorNombre, listarColecciones } from '../services/colecciones';
import { listarRegistros, upsertRegistro } from '../services/colecciones-registros';
import { corridaActivaId } from '../services/admin';
import { registrarActividad } from '../services/events';
import { KbError } from '../services/kb';
import { agenteDe, oficinaAgente } from './agente-util';
import { ah, HttpError, parse, qstr, type Deps } from './util';

/** Tope de registros y de caracteres que devuelve una búsqueda a un agente (cuida el plan). */
const TOPE_BUSQUEDA = 20;

async function dom<T>(fn: () => T): Promise<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof KbError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Herramientas genéricas de agente: coleccion_* y archivos_*. Cada ruta exige que la oficina tenga la herramienta. */
export function agentHerramientas(r: Router, d: Deps): void {
  const { db, bus } = d;
  const exigir = (q: Request, herramienta: string): string => {
    const o = oficinaAgente(q);
    if (!herramientaPermitida(db, o, herramienta))
      throw new HttpError(403, `La herramienta ${herramienta} no está permitida en esta oficina`);
    return o;
  };
  const coleccion = (o: string, nombre: string | undefined) => {
    const c = nombre ? coleccionPorNombre(db, o, nombre) : undefined;
    if (!c || c.estado !== 'activa')
      throw new HttpError(404, `No existe la colección «${nombre ?? ''}» en esta oficina`);
    return c;
  };

  r.get(
    '/coleccion/listar',
    ah((q, res) => {
      const o = exigir(q, 'coleccion_listar');
      res.json(
        listarColecciones(db, o).map((c) => ({
          nombre: c.nombre,
          descripcion: c.descripcion,
          clave: c.clave,
          registros: c.registros,
          campos: c.campos.map((f) => ({
            nombre: f.nombre,
            tipo: f.tipo,
            requerido: f.requerido,
            ...(f.opciones ? { opciones: f.opciones } : {}),
          })),
        })),
      );
    }),
  );

  r.get(
    '/coleccion/buscar',
    ah(async (q, res) => {
      const o = exigir(q, 'coleccion_buscar');
      const c = coleccion(o, qstr(q.query['coleccion']));
      const lim = Math.min(Math.max(Number(q.query['limite']) || 10, 1), TOPE_BUSQUEDA);
      const out = await dom(() =>
        listarRegistros(db, o, c.id, { q: qstr(q.query['texto']), limite: lim }),
      );
      res.json({
        coleccion: c.nombre,
        total: out.total,
        registros: out.registros.map((x) => ({
          id: x.id,
          datos: x.datos,
          fuente_url: x.fuente_url,
        })),
      });
    }),
  );

  r.post(
    '/coleccion/upsert',
    ah(async (q, res) => {
      const o = exigir(q, 'coleccion_upsert');
      const b = parse(registroAgenteInput, q.body);
      const c = coleccion(o, b.coleccion);
      const agente = agenteDe(q);
      const out = await dom(() =>
        upsertRegistro(
          db,
          o,
          c.id,
          { datos: b.datos, fuente_url: b.fuente_url, nota: b.nota ?? null },
          agente,
        ),
      );
      registrarActividad(db, bus, {
        agente,
        accion: `${out.accion} un registro en «${c.nombre}»`,
        entidad: 'coleccion',
        entidad_id: out.id,
        office_id: o,
        corrida_id: corridaActivaId(db, o),
      });
      res.status(out.accion === 'creado' ? 201 : 200).json(out);
    }),
  );

  r.get(
    '/archivos/listar',
    ah(async (q, res) => {
      const o = exigir(q, 'archivos_listar');
      res.json(await dom(() => archivosListar(db, o, qstr(q.query['ruta']), agenteDe(q))));
    }),
  );

  r.get(
    '/archivos/leer',
    ah(async (q, res) => {
      const o = exigir(q, 'archivos_leer');
      const ruta = qstr(q.query['ruta']);
      if (!ruta) throw new HttpError(400, 'Falta ruta');
      res.json(await dom(() => archivosLeer(db, o, ruta, agenteDe(q))));
    }),
  );

  r.post(
    '/archivos/mover-cuarentena',
    ah(async (q, res) => {
      const o = exigir(q, 'archivos_mover_cuarentena');
      const b = parse(
        z.object({ ruta: z.string().min(3).max(1000), motivo: z.string().trim().min(3).max(300) }),
        q.body,
      );
      const out = await dom(() => archivosMoverCuarentena(db, o, b.ruta, b.motivo, agenteDe(q)));
      registrarActividad(db, bus, {
        agente: agenteDe(q),
        accion: 'movió un archivo a cuarentena',
        detalle: b.motivo,
        office_id: o,
        corrida_id: corridaActivaId(db, o),
      });
      res.status(201).json(out);
    }),
  );
}
