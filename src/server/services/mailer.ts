import { Resend } from 'resend';
import type { Db } from '../db';
import { nowIso } from '../db';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<{ id: string }>;
}

export class ResendMailer implements Mailer {
  private readonly client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async send(msg: MailMessage): Promise<{ id: string }> {
    const { data, error } = await this.client.emails.send({
      from: msg.from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    if (error || !data) throw new Error(error?.message ?? 'Resend no devolvió id');
    return { id: data.id };
  }
}

/** Sin API key configurada: el envío falla de forma controlada y el prospecto queda guardado. */
export class DisabledMailer implements Mailer {
  async send(): Promise<{ id: string }> {
    throw new Error('Resend no está configurado (falta RESEND_API_KEY en .env)');
  }
}

export class DestinoNoPermitidoError extends Error {}

/** GUARDIA DE SEGURIDAD: solo se envía a destinatarios internos activos de la tabla. */
export function assertDestinoPermitido(db: Db, email: string): void {
  const fila = db
    .prepare('SELECT 1 AS ok FROM destinatarios_internos WHERE email = ? COLLATE NOCASE AND activo = 1')
    .get(email);
  if (!fila) throw new DestinoNoPermitidoError(`Destinatario no permitido: ${email}`);
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ReporteMail {
  asunto: string;
  texto: string;
  html: string;
}

export function armarReporte(p: {
  empresa: string;
  nivel: string | null;
  score: number | null;
  reporte_md: string;
  url: string;
}): ReporteMail {
  const asunto = `ACITMX · Nuevo prospecto: ${p.empresa}${p.nivel ? ` (Nivel ${p.nivel}, ${p.score})` : ''}`;
  const texto = `${p.reporte_md}\n\n— Ver en el CRM: ${p.url}\n(Este correo es una alerta interna; el expediente completo está en el CRM.)`;
  const html =
    `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0F3D47;max-width:640px">` +
    `<h2 style="color:#007F7C;margin:0 0 12px">Nuevo prospecto: ${esc(p.empresa)}</h2>` +
    `<div style="white-space:pre-wrap;line-height:1.5">${esc(p.reporte_md)}</div>` +
    `<p style="margin-top:20px"><a href="${esc(p.url)}" style="color:#007F7C">Ver en el CRM</a></p>` +
    `<p style="color:#4B6670;font-size:12px">Alerta interna de ACITMX Prospecting Office. El expediente completo está en el CRM.</p></div>`;
  return { asunto, texto, html };
}

/** Envía los correos pendientes de un prospecto. Un fallo NUNCA pierde el prospecto. */
export async function procesarEnvios(
  db: Db,
  mailer: Mailer,
  prospectoId: number,
  opts: { from: string; baseUrl: string },
): Promise<{ enviados: number; fallidos: number }> {
  const p = db
    .prepare(
      `SELECT p.id, p.nivel, p.score, p.reporte_md, e.nombre AS empresa
       FROM prospectos p JOIN empresas e ON e.id = p.empresa_id WHERE p.id = ?`,
    )
    .get(prospectoId) as
    | { id: number; nivel: string | null; score: number | null; reporte_md: string | null; empresa: string }
    | undefined;
  if (!p || !p.reporte_md) return { enviados: 0, fallidos: 0 };
  const mail = armarReporte({
    empresa: p.empresa,
    nivel: p.nivel,
    score: p.score,
    reporte_md: p.reporte_md,
    url: `${opts.baseUrl}/prospectos/${p.id}`,
  });
  const pendientes = db
    .prepare(
      "SELECT id, destinatario FROM envios_email WHERE prospecto_id = ? AND estado IN ('pendiente','fallido')",
    )
    .all(prospectoId) as { id: number; destinatario: string }[];
  let enviados = 0;
  let fallidos = 0;
  for (const envio of pendientes) {
    try {
      assertDestinoPermitido(db, envio.destinatario);
      const r = await mailer.send({
        from: opts.from,
        to: envio.destinatario,
        subject: mail.asunto,
        text: mail.texto,
        html: mail.html,
      });
      db.prepare(
        "UPDATE envios_email SET estado='enviado', resend_id=?, error=NULL, intentos=intentos+1, actualizado_en=? WHERE id=?",
      ).run(r.id, nowIso(), envio.id);
      enviados++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE envios_email SET estado='fallido', error=?, intentos=intentos+1, actualizado_en=? WHERE id=?",
      ).run(msg.slice(0, 400), nowIso(), envio.id);
      fallidos++;
    }
  }
  return { enviados, fallidos };
}
