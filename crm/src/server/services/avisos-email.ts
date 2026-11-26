import type { Db } from '../db';
import { nowIso } from '../db';
import { assertDestinoPermitido, type Mailer } from './mailer';

/** Tope de correos de aviso por oficina y hora (evita que un agente en bucle llene la bandeja). */
export const TOPE_CORREOS_HORA = 10;

export interface ResultadoCorreo {
  activo: boolean;
  enviados: number;
  fallidos: number;
  omitido?: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Correo de aviso interno de una oficina. Patrón outbox: se guarda ANTES de enviar. Solo a
 * destinatarios internos activos (GUARDIA del mailer) y solo si el dueño activó el correo del piso.
 */
export async function enviarAvisoCorreo(
  db: Db,
  mailer: Mailer,
  opts: { from: string; office: string; agente: string; asunto: string; texto: string },
): Promise<ResultadoCorreo> {
  const o = db
    .prepare('SELECT nombre, correo_activo AS c FROM oficinas WHERE id = ?')
    .get(opts.office) as { nombre: string; c: number } | undefined;
  if (!o || o.c !== 1) return { activo: false, enviados: 0, fallidos: 0 };
  const hora = new Date(Date.now() - 3600_000).toISOString();
  const enviadosHora = (
    db
      .prepare('SELECT COUNT(*) AS n FROM avisos_email WHERE office_id = ? AND creado_en >= ?')
      .get(opts.office, hora) as { n: number }
  ).n;
  const destinos = db
    .prepare('SELECT email FROM destinatarios_internos WHERE activo = 1 ORDER BY id')
    .all() as { email: string }[];
  if (destinos.length === 0)
    return {
      activo: true,
      enviados: 0,
      fallidos: 0,
      omitido: 'No hay destinatarios internos activos',
    };
  if (enviadosHora + destinos.length > TOPE_CORREOS_HORA)
    return {
      activo: true,
      enviados: 0,
      fallidos: 0,
      omitido: `Tope de ${TOPE_CORREOS_HORA} correos por hora alcanzado`,
    };
  const t = nowIso();
  const ins = db.prepare(
    'INSERT INTO avisos_email (office_id, agente, destinatario, asunto, texto, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?)',
  );
  const filas = destinos.map((d) =>
    Number(
      ins.run(opts.office, opts.agente, d.email, opts.asunto, opts.texto, t, t).lastInsertRowid,
    ),
  );
  const asunto = `${o.nombre} · ${opts.asunto}`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px"><h3>${esc(opts.asunto)}</h3><p style="white-space:pre-wrap">${esc(opts.texto)}</p><p style="color:#666;font-size:12px">Aviso interno de la oficina «${esc(o.nombre)}» (agente ${esc(opts.agente)}).</p></div>`;
  let enviados = 0;
  let fallidos = 0;
  for (const [i, d] of destinos.entries()) {
    try {
      assertDestinoPermitido(db, d.email);
      const r = await mailer.send({
        from: opts.from,
        to: d.email,
        subject: asunto,
        text: `${opts.texto}\n\n— Aviso interno de la oficina «${o.nombre}».`,
        html,
      });
      db.prepare(
        "UPDATE avisos_email SET estado='enviado', resend_id=?, intentos=intentos+1, actualizado_en=? WHERE id=?",
      ).run(r.id, nowIso(), filas[i]);
      enviados++;
    } catch (e) {
      db.prepare(
        "UPDATE avisos_email SET estado='fallido', error=?, intentos=intentos+1, actualizado_en=? WHERE id=?",
      ).run((e instanceof Error ? e.message : String(e)).slice(0, 300), nowIso(), filas[i]);
      fallidos++;
    }
  }
  return { activo: true, enviados, fallidos };
}
