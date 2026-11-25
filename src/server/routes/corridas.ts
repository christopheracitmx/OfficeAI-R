import { Router } from 'express';
import { corridaInput } from '../../shared/schemas';
import { leerCorrida, progresoDe } from '../runner/datos';
import * as admin from '../services/admin';
import { ah, HttpError, idParam, parse, qstr, type Deps } from './util';

/** Corridas, control del runner (iniciar/detener/reanudar/progreso) y salidas por agente. Rutas del dueño. */
export function corridasRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;

  r.get(
    '/oficinas',
    ah((_q, res) => {
      const ids = d.runner?.oficinasIds() ?? [];
      res.json(
        ids.map((id) => ({ office_id: id, titulo: d.runner?.oficina(id)?.workflow.titulo })),
      );
    }),
  );

  r.get(
    '/corridas',
    ah((q, res) => {
      const of = qstr(q.query['office_id']);
      res.json(admin.listarCorridas(db, of));
    }),
  );

  /** Registra la corrida y, si hay runner, arranca el pipeline. Nada corre sin esta acción del dueño. */
  r.post(
    '/corridas',
    ah((q, res) => {
      const input = parse(corridaInput, q.body);
      if (d.runner && !d.runner.oficina(input.office_id))
        throw new HttpError(400, `Oficina desconocida: ${input.office_id}`);
      const out = admin.crearCorrida(
        db,
        input,
        d.runner?.motor ?? admin.getConfig(db).motor_ia,
        input.office_id,
      );
      if (!out.ok) throw new HttpError(409, out.error);
      if (d.runner) {
        try {
          d.runner.iniciar(out.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'No se pudo iniciar el runner';
          admin.cerrarCorrida(db, out.id, 'error', msg);
          throw new HttpError(409, msg);
        }
      }
      res.status(201).json({ ...out, runner: d.runner?.estado() ?? null });
    }),
  );

  r.post(
    '/corridas/:id/detener',
    ah(async (q, res) => {
      const id = idParam(q);
      if (d.runner && (await d.runner.detener(id))) return void res.json({ ok: true });
      if (!admin.cerrarCorrida(db, id, 'detenida', 'Detenida por el dueño'))
        throw new HttpError(404, 'No hay corrida en curso con ese id');
      res.json({ ok: true });
    }),
  );

  r.post(
    '/corridas/:id/reanudar',
    ah((q, res) => {
      if (!d.runner) throw new HttpError(409, 'El runner no está activo');
      const id = idParam(q);
      const out = admin.reanudarCorrida(db, id);
      if (!out.ok) throw new HttpError(409, out.error);
      try {
        d.runner.iniciar(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo reanudar';
        admin.cerrarCorrida(db, id, 'error', msg);
        throw new HttpError(409, msg);
      }
      res.json({ ok: true, runner: d.runner.estado() });
    }),
  );

  r.get(
    '/corridas/:id/progreso',
    ah((q, res) => {
      const c = leerCorrida(db, idParam(q));
      if (!c) throw new HttpError(404, 'Corrida no encontrada');
      const wf = d.runner?.oficina(c.office_id)?.workflow;
      const vivo = d.runner?.estado();
      res.json({
        corrida: c,
        runner: vivo?.corrida_id === c.id ? vivo : null,
        progreso: wf ? progresoDe(db, wf, c) : [],
      });
    }),
  );

  /** Lo que ha producido cada agente (alimenta el panel del agente en P6/P7). */
  r.get(
    '/salidas',
    ah((q, res) => {
      const where: string[] = [];
      const params: unknown[] = [];
      for (const [col, key] of [
        ['office_id', 'office_id'],
        ['agente', 'agente'],
        ['corrida_id', 'corrida_id'],
        ['item_id', 'item_id'],
      ] as const) {
        const v = qstr(q.query[key]);
        if (v) {
          where.push(`${col} = ?`);
          params.push(v);
        }
      }
      const lim = Math.min(Number(q.query['limit']) || 100, 500);
      res.json(
        db
          .prepare(
            `SELECT id, office_id, corrida_id, agente, paso, item_id, tipo, resumen, contenido, tokens_estimados, duracion_ms, resultado, creado_en
             FROM salidas_agente ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`,
          )
          .all(...params, lim),
      );
    }),
  );

  return r;
}
