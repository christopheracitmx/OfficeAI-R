import { Resend } from 'resend';
import type { Db } from '../db';
import { scoreMinimoCorreo } from './calidad';
import { nowIso } from '../db';
import {
  adjuntosLogo,
  envolverCorreo,
  markdownATexto,
  remitenteConNombre,
} from './email-plantilla';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string; contentId: string }[];
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
      ...(msg.attachments ? { attachments: msg.attachments } : {}),
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
    .prepare(
      'SELECT 1 AS ok FROM destinatarios_internos WHERE email = ? COLLATE NOCASE AND activo = 1',
    )
    .get(email);
  if (!fila) throw new DestinoNoPermitidoError(`Destinatario no permitido: ${email}`);
}

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
  const asunto = `Nuevo prospecto: ${p.empresa}${p.nivel ? ` · Nivel ${p.nivel}` : ''}${p.score != null ? ` (${p.score})` : ''}`;
  const texto = `Nuevo prospecto: ${p.empresa}

${markdownATexto(p.reporte_md)}

Alerta interna de ${'Prospecting Office AI'}; el expediente completo está en el CRM.`;
  const html = envolverCorreo({
    preheader: `${p.empresa}${p.nivel ? ` · Nivel ${p.nivel}` : ''}: nuevo prospecto listo para revisar en el CRM.`,
    etiqueta: 'Nuevo prospecto',
    titulo: p.empresa,
    subtitulo: 'Nuevo prospecto encontrado por tu equipo de agentes',
    nivel: p.nivel,
    score: p.score,
    cuerpoMd: p.reporte_md,
    pie: 'Alerta interna de ACITMX. El expediente completo, la evidencia y el seguimiento están en el CRM.',
  });
  return { asunto, texto, html };
}

/** Envía los correos pendientes de un prospecto. Un fallo NUNCA pierde el prospecto. */
export async function procesarEnvios(
  db: Db,
  mailer: Mailer,
  prospectoId: number,
  opts: { from: string; baseUrl: string; soloDestinatarios?: string[] },
): Promise<{ enviados: number; fallidos: number }> {
  const p = db
    .prepare(
      `SELECT p.id, p.nivel, p.score, p.reporte_md, e.nombre AS empresa
       FROM prospectos p JOIN empresas e ON e.id = p.empresa_id WHERE p.id = ?`,
    )
    .get(prospectoId) as
    | {
        id: number;
        nivel: string | null;
        score: number | null;
        reporte_md: string | null;
        empresa: string;
      }
    | undefined;
  if (!p || !p.reporte_md) return { enviados: 0, fallidos: 0 };
  // Solo se avisa de prospectos que alcanzan el score mínimo configurado (por defecto 60).
  if ((p.score ?? 0) < scoreMinimoCorreo(db)) return { enviados: 0, fallidos: 0 };
  const mail = armarReporte({
    empresa: p.empresa,
    nivel: p.nivel,
    score: p.score,
    reporte_md: p.reporte_md,
    url: `${opts.baseUrl}/prospectos/${p.id}`,
  });
  let pendientes = db
    .prepare(
      "SELECT id, destinatario FROM envios_email WHERE prospecto_id = ? AND estado IN ('pendiente','fallido')",
    )
    .all(prospectoId) as { id: number; destinatario: string }[];
  const solo = opts.soloDestinatarios?.map((e) => e.toLowerCase());
  if (solo) pendientes = pendientes.filter((e) => solo.includes(e.destinatario.toLowerCase()));
  let enviados = 0;
  let fallidos = 0;
  for (const envio of pendientes) {
    try {
      assertDestinoPermitido(db, envio.destinatario);
      const r = await mailer.send({
        from: remitenteConNombre(opts.from),
        to: envio.destinatario,
        subject: mail.asunto,
        text: mail.texto,
        html: mail.html,
        attachments: adjuntosLogo(),
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

export interface ResultadoReenvio {
  destinatario: string;
  estado: 'enviado' | 'fallido';
  error: string | null;
}

/**
 * Reenvío manual del dueño. Sin selección: a todo destinatario activo al que aún no le consta un envío correcto.
 * Con selección (ids de destinatarios_internos activos): a esos, aunque ya hayan recibido el correo.
 * Crea la fila de envío si el destinatario se agregó después de finalizar el prospecto.
 */
export async function reenviarProspecto(
  db: Db,
  mailer: Mailer,
  prospectoId: number,
  opts: { from: string; baseUrl: string; destinatarioIds?: number[] },
): Promise<{ resultados: ResultadoReenvio[]; enviados: number; fallidos: number }> {
  const activos = db
    .prepare('SELECT id, email FROM destinatarios_internos WHERE activo = 1 ORDER BY id')
    .all() as { id: number; email: string }[];
  const ids = opts.destinatarioIds;
  const elegidos = ids ? activos.filter((a) => ids.includes(a.id)) : activos;
  // Envíos fallidos a correos que ya no están en la lista activa nunca podrán salir (la guardia los bloquea):
  // se retiran para que no dejen el aviso de «correo no enviado» para siempre.
  db.prepare(
    `DELETE FROM envios_email WHERE prospecto_id = ? AND estado != 'enviado'
       AND destinatario NOT IN (SELECT email FROM destinatarios_internos WHERE activo = 1 COLLATE NOCASE)`,
  ).run(prospectoId);
  const t = nowIso();
  const objetivo: string[] = [];
  for (const d of elegidos) {
    const fila = db
      .prepare(
        'SELECT id, estado FROM envios_email WHERE prospecto_id = ? AND destinatario = ? COLLATE NOCASE',
      )
      .get(prospectoId, d.email) as { id: number; estado: string } | undefined;
    if (!fila) {
      db.prepare('INSERT INTO envios_email (prospecto_id, destinatario) VALUES (?, ?)').run(
        prospectoId,
        d.email,
      );
    } else if (ids || fila.estado !== 'enviado') {
      db.prepare("UPDATE envios_email SET estado='pendiente', actualizado_en=? WHERE id=?").run(
        t,
        fila.id,
      );
    } else continue;
    objetivo.push(d.email);
  }
  const out = await procesarEnvios(db, mailer, prospectoId, {
    from: opts.from,
    baseUrl: opts.baseUrl,
    soloDestinatarios: objetivo,
  });
  const resultados = objetivo.map((email) => {
    const f = db
      .prepare(
        'SELECT estado, error FROM envios_email WHERE prospecto_id = ? AND destinatario = ? COLLATE NOCASE',
      )
      .get(prospectoId, email) as { estado: string; error: string | null };
    return {
      destinatario: email,
      estado: f.estado === 'enviado' ? ('enviado' as const) : ('fallido' as const),
      error: f.error,
    };
  });
  return { resultados, ...out };
}
