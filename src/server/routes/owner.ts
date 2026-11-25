import { Router } from 'express';
import { z } from 'zod';
import { AGENTES } from '../../shared/domain';
import {
  configPatch,
  corridaInput,
  destinatarioInput,
  empresaInput,
  noContactarInput,
  prospectoPatch,
} from '../../shared/schemas';
import * as admin from '../services/admin';
import { dashboard, detalleProspecto, listarDirectorio, listarProspectos, patchProspecto } from '../services/consultas';
import { cambiarEtapa, upsertEmpresa } from '../services/empresas';
import { assertDestinoPermitido, procesarEnvios } from '../services/mailer';
import { ah, HttpError, idParam, parse, qstr, type Deps } from './util';

export function ownerRouter(d: Deps): Router {
  const r = Router();
  const { db } = d;

  r.get('/dashboard', ah((_q, res) => void res.json(dashboard(db))));

  r.get('/estado', ah((_q, res) => {
    const cfg = admin.getConfig(db);
    const mes = new Date().toISOString().slice(0, 7);
    const usado = (db.prepare("SELECT contador FROM places_uso WHERE mes=? AND sku='pro'").get(mes) as { contador: number } | undefined)?.contador ?? 0;
    const corrida = db.prepare("SELECT * FROM corridas WHERE estado='en_curso' LIMIT 1").get() ?? null;
    res.json({
      motor_ia: cfg.motor_ia,
      places: { usado, tope: cfg.places_tope_pro, mes },
      resend_configurado: Boolean(d.env?.['RESEND_API_KEY']),
      remitente: d.from,
      corrida_activa: corrida,
    });
  }));

  // ---- Prospectos
  r.get('/prospectos', ah((q, res) => {
    res.json(
      listarProspectos(db, {
        ...(qstr(q.query['estado']) ? { estado: qstr(q.query['estado'])! } : {}),
        ...(qstr(q.query['nivel']) ? { nivel: qstr(q.query['nivel'])! } : {}),
        ...(qstr(q.query['zona']) ? { zona: qstr(q.query['zona'])! } : {}),
        ...(qstr(q.query['giro']) ? { giro: qstr(q.query['giro'])! } : {}),
        ...(qstr(q.query['metodo']) ? { metodo: qstr(q.query['metodo'])! } : {}),
        ...(qstr(q.query['q']) ? { q: qstr(q.query['q'])! } : {}),
        sinVer: q.query['sinVer'] === '1',
      }),
    );
  }));

  r.get('/prospectos/:id', ah((q, res) => {
    const det = detalleProspecto(db, idParam(q));
    if (!det) throw new HttpError(404, 'Prospecto no encontrado');
    res.json(det);
  }));

  r.patch('/prospectos/:id', ah((q, res) => {
    const out = patchProspecto(db, idParam(q), 'owner', parse(prospectoPatch, q.body));
    if (!out.ok) throw new HttpError(out.status, out.error);
    res.json({ ok: true });
  }));

  r.post('/prospectos/:id/reenviar', ah(async (q, res) => {
    const id = idParam(q);
    const falló = db.prepare("UPDATE envios_email SET estado='pendiente' WHERE prospecto_id=? AND estado='fallido'").run(id);
    const out = await procesarEnvios(db, d.mailer, id, { from: d.from, baseUrl: d.baseUrl });
    res.json({ reintentados: falló.changes, ...out });
  }));

  // ---- Directorio
  r.get('/directorio', ah((q, res) => {
    res.json(
      listarDirectorio(db, {
        ...(qstr(q.query['etapa']) ? { etapa: qstr(q.query['etapa'])! } : {}),
        ...(qstr(q.query['metodo']) ? { metodo: qstr(q.query['metodo'])! } : {}),
        ...(qstr(q.query['zona']) ? { zona: qstr(q.query['zona'])! } : {}),
        ...(qstr(q.query['q']) ? { q: qstr(q.query['q'])! } : {}),
      }),
    );
  }));

  r.post('/directorio', ah((q, res) => {
    const input = parse(empresaInput, { ...(q.body as object), metodo_descubrimiento: 'manual' });
    const out = upsertEmpresa(db, input);
    if (out.status === 'rechazada') throw new HttpError(422, `Empresa rechazada: ${out.motivo}`);
    res.status(out.status === 'creada' ? 201 : 200).json(out);
  }));

  r.post('/empresas/:id/descartar', ah((q, res) => {
    const motivo = parse(z.object({ motivo: z.string().trim().min(2).max(300) }), q.body).motivo;
    cambiarEtapa(db, { empresa_id: idParam(q), etapa: 'descartada', motivo });
    res.json({ ok: true });
  }));

  // ---- Actividad
  r.get('/actividad', ah((q, res) => {
    const where: string[] = [];
    const params: unknown[] = [];
    const corrida = Number(q.query['corrida_id']);
    if (Number.isInteger(corrida) && corrida > 0) (where.push('corrida_id = ?'), params.push(corrida));
    const ag = qstr(q.query['agente']);
    if (ag && (AGENTES as readonly string[]).includes(ag)) (where.push('agente = ?'), params.push(ag));
    const lim = Math.min(Number(q.query['limit']) || 100, 500);
    res.json(
      db.prepare(`SELECT * FROM actividad_agentes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).all(...params, lim),
    );
  }));

  // ---- Corridas
  r.get('/corridas', ah((_q, res) => void res.json(admin.listarCorridas(db))));
  r.post('/corridas', ah((q, res) => {
    const out = admin.crearCorrida(db, parse(corridaInput, q.body), admin.getConfig(db).motor_ia);
    if (!out.ok) throw new HttpError(409, out.error);
    res.status(201).json(out);
  }));
  r.post('/corridas/:id/detener', ah((q, res) => {
    if (!admin.cerrarCorrida(db, idParam(q), 'detenida', 'Detenida por el dueño'))
      throw new HttpError(404, 'No hay corrida en curso con ese id');
    res.json({ ok: true });
  }));

  // ---- Configuración
  r.get('/config', ah((_q, res) => void res.json(admin.getConfig(db))));
  r.patch('/config', ah((q, res) => {
    admin.patchConfig(db, parse(configPatch, q.body));
    res.json(admin.getConfig(db));
  }));

  r.get('/config/destinatarios', ah((_q, res) => void res.json(admin.listarDestinatarios(db))));
  r.post('/config/destinatarios', ah((q, res) => {
    try {
      res.status(201).json({ id: admin.crearDestinatario(db, parse(destinatarioInput, q.body)) });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(409, 'Ese correo ya está en la lista');
    }
  }));
  r.patch('/config/destinatarios/:id', ah((q, res) => {
    const body = parse(destinatarioInput.partial(), q.body);
    if (!admin.editarDestinatario(db, idParam(q), body)) throw new HttpError(404, 'Destinatario no encontrado');
    res.json({ ok: true, sin_activos: admin.activosDestinatarios(db) === 0 });
  }));
  r.delete('/config/destinatarios/:id', ah((q, res) => {
    if (!admin.eliminarDestinatario(db, idParam(q))) throw new HttpError(404, 'Destinatario no encontrado');
    res.json({ ok: true, sin_activos: admin.activosDestinatarios(db) === 0 });
  }));
  r.post('/config/destinatarios/:id/prueba', ah(async (q, res) => {
    const fila = db.prepare('SELECT email FROM destinatarios_internos WHERE id = ?').get(idParam(q)) as { email: string } | undefined;
    if (!fila) throw new HttpError(404, 'Destinatario no encontrado');
    try {
      assertDestinoPermitido(db, fila.email);
      const out = await d.mailer.send({
        from: d.from,
        to: fila.email,
        subject: 'ACITMX Prospecting Office · correo de prueba',
        text: 'Este es un correo de prueba. Si lo recibes, las alertas internas funcionan.',
        html: '<p>Este es un correo de prueba. Si lo recibes, las alertas internas funcionan.</p>',
      });
      res.json({ ok: true, id: out.id });
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : 'No se pudo enviar');
    }
  }));

  r.get('/config/no-contactar', ah((_q, res) => void res.json(admin.listarNoContactar(db))));
  r.post('/config/no-contactar', ah((q, res) => void res.status(201).json({ id: admin.crearNoContactar(db, parse(noContactarInput, q.body)) })));
  r.delete('/config/no-contactar/:id', ah((q, res) => {
    if (!admin.eliminarNoContactar(db, idParam(q))) throw new HttpError(404, 'No encontrado');
    res.json({ ok: true });
  }));

  r.get('/config/giros', ah((_q, res) => void res.json(admin.listarGiros(db))));
  r.post('/config/giros', ah((q, res) => {
    const nombre = parse(z.object({ nombre: z.string().trim().min(2).max(80) }), q.body).nombre;
    res.status(201).json({ id: admin.crearGiro(db, nombre) });
  }));

  return r;
}
