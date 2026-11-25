import { Router } from 'express';
import { corridaGenericaInput, corridaInput } from '../../shared/schemas';
import { leerCorrida, progresoDe } from '../runner/datos';
import { estadoPlan, estimarCorrida } from '../runner/plan';
import * as admin from '../services/admin';
import { obtenerOficina } from '../services/oficinas';
import { ah, HttpError, idParam, oficinaDe, parse, qstr, type Deps } from './util';

/** Corridas, control del runner (iniciar/detener/reanudar/progreso) y salidas por agente. Rutas del dueño. */
export function corridasRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;

  /** Límites del plan: lo que informa el CLI (porcentaje, reinicio) o, si no hay, el estimado con tokens. */
  r.get(
    '/plan',
    ah((_q, res) => void res.json(estadoPlan(db))),
  );

  /** Consumo estimado de una corrida ANTES de iniciarla (empresas x tokens medios recientes). */
  r.get(
    '/corridas/estimado',
    ah((q, res) => {
      const n = Math.min(Math.max(Math.trunc(Number(q.query['max_empresas']) || 10), 1), 50);
      res.json(estimarCorrida(db, oficinaDe(q), n));
    }),
  );

  r.get(
    '/corridas',
    ah((q, res) => {
      res.json(admin.listarCorridas(db, oficinaDe(q)));
    }),
  );

  /** Registra la corrida y, si hay runner, arranca el pipeline. Nada corre sin esta acción del dueño. */
  r.post(
    '/corridas',
    ah((q, res) => {
      const officeId = String((q.body as { office_id?: unknown })?.office_id ?? 'prospeccion');
      const generica = officeId !== 'prospeccion';
      const input = generica ? parse(corridaGenericaInput, q.body) : parse(corridaInput, q.body);
      const piso = obtenerOficina(db, input.office_id);
      if (!piso || (d.runner && !d.runner.oficina(input.office_id)))
        throw new HttpError(400, `Oficina desconocida: ${input.office_id}`);
      if (piso.estado !== 'activa')
        throw new HttpError(409, `La oficina «${piso.nombre}» está archivada`);
      const items =
        'max_empresas' in input ? input.max_empresas : Number(input.params['max_items']) || 1;
      const est = estimarCorrida(db, input.office_id, items);
      if (est.requiere_confirmacion && !input.confirmado)
        return void res.status(409).json({
          error: `Consumo estimado ≈ ${est.tokens.toLocaleString('es-MX')} tokens, sobre el umbral de ${est.umbral.toLocaleString('es-MX')}. Confirma para iniciar.`,
          codigo: 'requiere_confirmacion',
          estimado: est,
        });
      const motor = d.runner?.motor ?? admin.getConfig(db).motor_ia;
      const out =
        'params' in input
          ? admin.crearCorridaGenerica(db, input.office_id, input.params, motor)
          : admin.crearCorrida(db, input, motor, input.office_id);
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
      res.status(201).json({ ...out, runner: d.runner?.estado(input.office_id) ?? null });
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
        // Reanudar tras una pausa por reserva es una decisión explícita del dueño: no se vuelve a pausar.
        d.runner.iniciar(id, { ignorarReserva: true });
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
      const vivo = d.runner?.estado(c.office_id);
      res.json({
        corrida: c,
        runner: vivo?.corrida_id === c.id ? vivo : null,
        progreso: wf ? progresoDe(db, wf, c) : [],
      });
    }),
  );

  /** Lo que ha producido cada agente (panel del agente). `prospecto_id` enlaza la salida con el prospecto de la empresa. */
  r.get(
    '/salidas',
    ah((q, res) => {
      const where: string[] = ['s.office_id = ?'];
      const params: unknown[] = [oficinaDe(q)];
      for (const [col, key] of [
        ['s.agente', 'agente'],
        ['s.corrida_id', 'corrida_id'],
        ['s.item_id', 'item_id'],
        ['s.resultado', 'resultado'],
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
            `SELECT s.id, s.office_id, s.corrida_id, s.agente, s.rol, s.paso, s.item_id, s.tipo, s.resumen,
                    s.tokens_estimados, s.duracion_ms, s.resultado, s.prompt_tokens, s.turnos, s.herramientas, s.creado_en,
                    (SELECT p.id FROM prospectos p WHERE s.office_id = 'prospeccion' AND p.empresa_id = s.item_id) AS prospecto_id
             FROM salidas_agente s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT ?`,
          )
          .all(...params, lim),
      );
    }),
  );

  r.get(
    '/salidas/:id',
    ah((q, res) => {
      const fila = db.prepare('SELECT * FROM salidas_agente WHERE id = ?').get(idParam(q));
      if (!fila) throw new HttpError(404, 'Salida no encontrada');
      res.json(fila);
    }),
  );

  /** Consumo por agente (llamadas, tokens y tiempo medios) para medir y recortar gasto del plan. */
  r.get(
    '/salidas-resumen',
    ah((q, res) => {
      const o = oficinaDe(q);
      const c = qstr(q.query['corrida_id']);
      res.json(
        db
          .prepare(
            `SELECT agente, COUNT(*) AS llamadas, SUM(tokens_estimados) AS tokens, CAST(AVG(tokens_estimados) AS INTEGER) AS tokens_medio,
                    CAST(AVG(prompt_tokens) AS INTEGER) AS prompt_medio, CAST(AVG(duracion_ms) AS INTEGER) AS ms_medio,
                    SUM(resultado != 'ok') AS no_ok
             FROM salidas_agente WHERE office_id = ? AND tipo = 'paso' ${c ? 'AND corrida_id = ?' : ''}
             GROUP BY agente ORDER BY tokens DESC`,
          )
          .all(...(c ? [o, c] : [o])),
      );
    }),
  );

  return r;
}
