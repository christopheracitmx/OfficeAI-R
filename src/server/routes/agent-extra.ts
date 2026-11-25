import type { Request, Router } from 'express';
import { z } from 'zod';
import { AGENTES, puedeCambiarEstado } from '../../shared/domain';
import { actividadInput, finalizarInput } from '../../shared/schemas';
import { consumirPlaces, QuotaExceededError } from '../services/admin';
import { buscarKb, leerKb } from '../services/kb-buscar';
import { registrarActividad } from '../services/events';
import { procesarEnvios } from '../services/mailer';
import { finalizarProspecto } from '../services/prospectos';
import { ah, HttpError, parse, qstr, type Deps } from './util';

type Log = (
  req: Request,
  accion: string,
  entidad?: string,
  id?: number,
  detalle?: string,
) => unknown;

/** Rutas de agente: cierre del prospecto, cuota de Places, caché de páginas y actividad. */
export function agentExtra(r: Router, d: Deps, log: Log): void {
  const { db, bus } = d;
  const agenteDe = (q: Request): string => {
    const n = q.header('x-agent-name') ?? '';
    return (AGENTES as readonly string[]).includes(n) ? n : 'Coordinador';
  };

  // Biblioteca de la oficina: fragmentos cortos con tope de caracteres (cuida el plan).
  const oficinaDe = (q: Request): string => q.header('x-office-id') || 'prospeccion';
  r.get(
    '/kb/buscar',
    ah((q, res) => {
      const texto = qstr(q.query['texto']);
      if (!texto) throw new HttpError(400, 'Falta texto');
      res.json(buscarKb(db, oficinaDe(q), texto, qstr(q.query['tipo'])));
    }),
  );
  r.get(
    '/kb/leer',
    ah((q, res) => {
      const ref = qstr(q.query['ref']);
      if (!ref) throw new HttpError(400, 'Falta ref');
      const out = leerKb(db, oficinaDe(q), ref, Math.max(0, Number(q.query['desde']) || 0));
      if (!out) throw new HttpError(404, 'No existe o está archivado');
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
}
