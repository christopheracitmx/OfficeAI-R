import type { Request } from 'express';
import { Router } from 'express';
import { AGENTES, puedeCambiarEstado } from '../../shared/domain';
import {
  actividadInput,
  contactoInput,
  empresaInput,
  etapaInput,
  fichaInput,
  finalizarInput,
  hallazgoInput,
  propuestasInput,
  reporteInput,
  revisionQaInput,
  scoreInput,
} from '../../shared/schemas';
import { consumirPlaces, QuotaExceededError } from '../services/admin';
import {
  agregarContacto,
  buscarEnDirectorio,
  cambiarEtapa,
  guardarFicha,
  registrarBusqueda,
  upsertEmpresa,
} from '../services/empresas';
import { registrarActividad } from '../services/events';
import { procesarEnvios } from '../services/mailer';
import {
  finalizarProspecto,
  guardarPropuestas,
  guardarReporte,
  guardarScore,
  registrarQa,
} from '../services/prospectos';
import { ah, HttpError, parse, qstr, type Deps } from './util';
import { z } from 'zod';

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

  r.post(
    '/empresas',
    ah((q, res) => {
      const out = upsertEmpresa(db, parse(empresaInput, q.body));
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
      const out = upsertEmpresa(db, { ...h, metodo_descubrimiento: 'hallazgo_oportunista' });
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
      const prospecto_id = guardarPropuestas(db, p);
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

  r.post(
    '/finalizar',
    ah(async (q, res) => {
      const { prospecto_id } = parse(finalizarInput, q.body);
      if (!puedeCambiarEstado('agent', 'Reportado')) throw new HttpError(403, 'No permitido');
      const out = finalizarProspecto(db, prospecto_id);
      if (!out.ok) throw new HttpError(409, out.razones.join('; '));
      log(q, 'guardó el prospecto en el CRM', 'prospecto', prospecto_id);
      // Guardar primero, avisar después: un fallo de correo no deshace lo guardado.
      const envio = await procesarEnvios(db, d.mailer, prospecto_id, {
        from: d.from,
        baseUrl: d.baseUrl,
      });
      log(
        q,
        `correo: ${envio.enviados} enviado(s), ${envio.fallidos} fallido(s)`,
        'prospecto',
        prospecto_id,
      );
      res.json({ ...out, ...envio });
    }),
  );

  r.post(
    '/places/consumir',
    ah((q, res) => {
      const n = parse(z.object({ n: z.number().int().min(1).max(10).default(1) }), q.body).n;
      try {
        res.json(consumirPlaces(db, n));
      } catch (e) {
        if (e instanceof QuotaExceededError) throw new HttpError(429, e.message);
        throw e;
      }
    }),
  );

  // Caché local de páginas leídas con Obscura (TTL 7 días)
  r.get(
    '/cache',
    ah((q, res) => {
      const url = qstr(q.query['url']);
      if (!url) throw new HttpError(400, 'Falta url');
      const fila = db
        .prepare(
          "SELECT url, texto_compacto, emails, telefonos, obtenida_en FROM paginas_cache WHERE url = ? AND obtenida_en >= datetime('now','-7 days')",
        )
        .get(url);
      res.json(fila ?? null);
    }),
  );

  r.post(
    '/cache',
    ah((q, res) => {
      const c = parse(
        z.object({
          url: z.string().url().max(1000),
          texto_compacto: z.string().max(8000),
          emails: z.array(z.string()).max(20),
          telefonos: z.array(z.string()).max(20),
        }),
        q.body,
      );
      db.prepare(
        `INSERT INTO paginas_cache (url, texto_compacto, emails, telefonos, obtenida_en) VALUES (?,?,?,?,?)
       ON CONFLICT(url) DO UPDATE SET texto_compacto=excluded.texto_compacto, emails=excluded.emails,
         telefonos=excluded.telefonos, obtenida_en=excluded.obtenida_en`,
      ).run(
        c.url,
        c.texto_compacto,
        JSON.stringify(c.emails),
        JSON.stringify(c.telefonos),
        new Date().toISOString(),
      );
      res.status(201).json({ ok: true });
    }),
  );

  r.post(
    '/actividad',
    ah((q, res) => {
      const a = parse(actividadInput, { ...(q.body as object), agente: agenteDe(q) });
      res.status(201).json(registrarActividad(db, bus, a));
    }),
  );

  return r;
}
