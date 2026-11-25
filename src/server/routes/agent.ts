import type { Request } from 'express';
import { Router } from 'express';
import { AGENTES } from '../../shared/domain';
import {
  contactoInput,
  empresaInput,
  etapaInput,
  fichaInput,
  hallazgoInput,
  propuestasInput,
  reporteInput,
  revisionQaInput,
  scoreInput,
} from '../../shared/schemas';
import { corridaActivaId } from '../services/admin';
import {
  agregarContacto,
  buscarEnDirectorio,
  cambiarEtapa,
  guardarFicha,
  registrarBusqueda,
  upsertEmpresa,
} from '../services/empresas';
import { expedienteEmpresa } from '../services/expediente';
import { registrarActividad } from '../services/events';
import {
  guardarPropuestas,
  guardarReporte,
  guardarScore,
  registrarQa,
} from '../services/prospectos';
import { z } from 'zod';
import { agentExtra } from './agent-extra';
import { ah, HttpError, idParam, parse, qstr, type Deps } from './util';

function agenteDe(req: Request): string {
  const n = req.header('x-agent-name') ?? '';
  return (AGENTES as readonly string[]).includes(n) ? n : 'Coordinador';
}

export function agentRouter(d: Deps): Router {
  const r = Router();
  const { db, bus } = d;

  // Autenticación de agentes: token compartido con el proceso MCP.
  r.use((req, _res, next) => {
    if (req.header('x-agent-token') !== d.agentToken)
      return next(new HttpError(401, 'Token de agente inválido'));
    next();
  });

  const log = (req: Request, accion: string, entidad?: string, id?: number, detalle?: string) =>
    registrarActividad(db, bus, {
      agente: agenteDe(req),
      accion,
      entidad,
      entidad_id: id,
      detalle,
      corrida_id: (
        db.prepare("SELECT id FROM corridas WHERE estado='en_curso' LIMIT 1").get() as
          { id: number } | undefined
      )?.id,
    });

  r.get(
    '/corrida',
    ah((_q, res) => {
      res.json(db.prepare("SELECT * FROM corridas WHERE estado='en_curso' LIMIT 1").get() ?? null);
    }),
  );

  r.get(
    '/directorio/buscar',
    ah((q, res) => {
      res.json(
        buscarEnDirectorio(db, {
          ...(qstr(q.query['texto']) ? { texto: qstr(q.query['texto'])! } : {}),
          ...(qstr(q.query['dominio']) ? { dominio: qstr(q.query['dominio'])! } : {}),
          ...(qstr(q.query['consulta']) ? { consulta: qstr(q.query['consulta'])! } : {}),
          ...(qstr(q.query['metodo']) ? { metodo: qstr(q.query['metodo'])! } : {}),
        }),
      );
    }),
  );

  r.post(
    '/busquedas',
    ah((q, res) => {
      const b = parse(
        z.object({
          metodo: z.string().min(2).max(40),
          consulta: z.string().min(2).max(300),
          resultados: z.number().int().min(0),
          nuevas: z.number().int().min(0),
        }),
        q.body,
      );
      registrarBusqueda(db, b);
      res.status(201).json({ ok: true });
    }),
  );

  r.get(
    '/expediente/:id',
    ah((q, res) => {
      const sec = qstr(q.query['secciones']);
      const ex = expedienteEmpresa(db, idParam(q), sec ? sec.split(',') : undefined);
      if (!ex) throw new HttpError(404, 'Empresa no encontrada');
      res.json(ex);
    }),
  );

  r.post(
    '/empresas',
    ah((q, res) => {
      const e = parse(empresaInput, q.body);
      const out = upsertEmpresa(db, { ...e, corrida_id: e.corrida_id ?? corridaActivaId(db) });
      if (out.status === 'rechazada') {
        log(
          q,
          'rechazó empresa',
          undefined,
          undefined,
          `${(q.body as { nombre?: string }).nombre ?? '?'} · ${out.motivo}`,
        );
        res.status(200).json(out);
        return;
      }
      log(
        q,
        out.status === 'creada' ? 'registró empresa' : 'ya la teníamos',
        'empresa',
        out.id,
        (q.body as { nombre?: string }).nombre,
      );
      res.status(out.status === 'creada' ? 201 : 200).json(out);
    }),
  );

  r.post(
    '/hallazgos',
    ah((q, res) => {
      const h = parse(hallazgoInput, q.body);
      const out = upsertEmpresa(db, {
        ...h,
        corrida_id: h.corrida_id ?? corridaActivaId(db),
        metodo_descubrimiento: 'hallazgo_oportunista',
      });
      if (out.status !== 'rechazada') log(q, 'hallazgo oportunista', 'empresa', out.id, h.nombre);
      res.status(out.status === 'creada' ? 201 : 200).json(out);
    }),
  );

  r.post(
    '/contactos',
    ah((q, res) => {
      try {
        const c = agregarContacto(db, parse(contactoInput, q.body));
        log(q, 'guardó contacto', 'empresa', (q.body as { empresa_id: number }).empresa_id);
        res.status(c.nuevo ? 201 : 200).json(c);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(422, e instanceof Error ? e.message : 'Contacto inválido');
      }
    }),
  );

  r.post(
    '/ficha',
    ah((q, res) => {
      const f = parse(fichaInput, q.body);
      try {
        guardarFicha(db, f);
      } catch (e) {
        throw new HttpError(404, e instanceof Error ? e.message : 'Error');
      }
      log(q, 'guardó ficha de empresa', 'empresa', f.empresa_id);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/etapa',
    ah((q, res) => {
      const e = parse(etapaInput, q.body);
      try {
        cambiarEtapa(db, e);
      } catch (err) {
        throw new HttpError(404, err instanceof Error ? err.message : 'Error');
      }
      log(q, `etapa → ${e.etapa}`, 'empresa', e.empresa_id, e.motivo);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/propuestas',
    ah((q, res) => {
      const p = parse(propuestasInput, q.body);
      const prospecto_id = guardarPropuestas(db, {
        ...p,
        corrida_id: p.corrida_id ?? corridaActivaId(db),
      });
      log(q, 'armó propuestas y paquetes', 'empresa', p.empresa_id);
      res.status(201).json({ prospecto_id });
    }),
  );

  r.post(
    '/score',
    ah((q, res) => {
      const s = parse(scoreInput, q.body);
      const out = guardarScore(db, s);
      log(q, `calificó ${s.score} (nivel ${out.nivel})`, 'prospecto', s.prospecto_id);
      res.json(out);
    }),
  );

  r.post(
    '/reporte',
    ah((q, res) => {
      const rep = parse(reporteInput, q.body);
      guardarReporte(db, rep);
      log(q, 'redactó el reporte', 'prospecto', rep.prospecto_id);
      res.json({ ok: true });
    }),
  );

  r.post(
    '/qa',
    ah((q, res) => {
      const qa = parse(revisionQaInput, q.body);
      const out = registrarQa(db, qa);
      log(
        q,
        qa.aprobado ? `${qa.etapa.toUpperCase()} aprobó` : `${qa.etapa.toUpperCase()} devolvió`,
        'prospecto',
        qa.prospecto_id,
        (qa.motivos ?? []).join(' | ').slice(0, 300),
      );
      res.json(out);
    }),
  );

  agentExtra(r, d, log);

  return r;
}
