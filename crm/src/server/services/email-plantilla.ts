/**
 * Plantilla profesional de correo interno (compatible con Outlook: tablas, estilos en línea,
 * sin flex/grid/rgba). Convierte el Markdown de los agentes a HTML y lo envuelve en un diseño
 * con encabezado de marca, título, insignia de nivel, botón al CRM y pie.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOMBRE_REMITENTE = 'Prospecting Office AI';

const C = {
  ice: '#F4F8FA',
  deep: '#0F3D47',
  teal: '#00ADA9',
  tealTxt: '#007F7C',
  txt: '#1F3A42',
  suave: '#4B6670',
  linea: '#DCE7EB',
  nivel: { A: '#1E8E5A', B: '#007F7C', C: '#B7791F', D: '#7A8A90' } as Record<string, string>,
};
const FUENTE = "font-family:'Segoe UI',Calibri,Arial,sans-serif;";

export const LOGO_CID = 'logo-acit';

/** Logo de ACIT como adjunto en línea (cid:) para que Outlook lo muestre sin bloquear imágenes remotas. */
export function adjuntosLogo(): { filename: string; content: string; contentId: string }[] {
  const f = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/logo-acit.png');
  return [
    { filename: 'logo-acit.png', content: readFileSync(f).toString('base64'), contentId: LOGO_CID },
  ];
}

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Remitente con nombre visible: «Prospecting Office AI <info@…>». */
export function remitenteConNombre(from: string): string {
  if (from.includes('<')) return from;
  return `${NOMBRE_REMITENTE} <${from}>`;
}

function enLinea(s: string): string {
  let t = esc(s);
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, a: string, u: string) => `<a href="${u}" style="color:${C.tealTxt}">${a}</a>`,
  );
  t = t.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_m, p: string, u: string) => `${p}<a href="${u}" style="color:${C.tealTxt}">${u}</a>`,
  );
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  t = t.replace(/`([^`]+)`/g, `<code style="background:${C.ice};padding:1px 4px">$1</code>`);
  return t;
}

const P = `margin:0 0 12px 0;font-size:15px;line-height:1.6;color:${C.txt};`;

/** Markdown básico (títulos, listas, negritas, enlaces, tablas, líneas) → HTML con estilos en línea. */
export function markdownAHtml(md: string): string {
  const lineas = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let lista: 'ul' | 'ol' | null = null;
  let parrafo: string[] = [];
  let tabla: string[][] = [];
  const cierraParrafo = (): void => {
    if (parrafo.length) out.push(`<p style="${P}">${enLinea(parrafo.join(' '))}</p>`);
    parrafo = [];
  };
  const cierraLista = (): void => {
    if (lista) out.push(`</${lista}>`);
    lista = null;
  };
  const cierraTabla = (): void => {
    if (!tabla.length) return;
    const [cab, ...filas] = tabla;
    const td = (c: string, th: boolean): string =>
      `<td style="padding:6px 8px;border:1px solid ${C.linea};font-size:13px;${th ? `background:${C.ice};font-weight:bold;` : ''}color:${C.txt}">${enLinea(c)}</td>`;
    out.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px 0;width:100%"><tr>${(cab ?? []).map((c) => td(c, true)).join('')}</tr>${filas.map((f) => `<tr>${f.map((c) => td(c, false)).join('')}</tr>`).join('')}</table>`,
    );
    tabla = [];
  };
  const cierraTodo = (): void => {
    cierraParrafo();
    cierraLista();
    cierraTabla();
  };
  for (const crudo of lineas) {
    const l = crudo.trimEnd();
    if (!l.trim()) {
      cierraTodo();
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      cierraParrafo();
      cierraLista();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
      tabla.push(
        l
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim()),
      );
      continue;
    }
    cierraTabla();
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      cierraTodo();
      const nivel = (h[1] ?? '#').length;
      const texto = (h[2] ?? '').replace(/^\d+\.\s+/, '');
      out.push(
        nivel <= 2
          ? `<h2 style="margin:26px 0 10px 0;padding:0 0 6px 0;font-size:17px;line-height:1.3;color:${C.deep};border-bottom:2px solid ${C.teal}">${enLinea(texto)}</h2>`
          : `<h3 style="margin:18px 0 8px 0;font-size:15px;color:${C.tealTxt}">${enLinea(texto)}</h3>`,
      );
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) {
      cierraTodo();
      out.push(`<hr style="border:0;border-top:1px solid ${C.linea};margin:18px 0">`);
      continue;
    }
    const li = /^\s*(?:[-*•]\s+|(\d+)[.)]\s+)(.*)$/.exec(l);
    if (li) {
      cierraParrafo();
      const tipo = li[1] ? 'ol' : 'ul';
      if (lista !== tipo) {
        cierraLista();
        out.push(
          `<${tipo} style="margin:0 0 14px 0;padding:0 0 0 22px;font-size:15px;line-height:1.55;color:${C.txt}">`,
        );
        lista = tipo;
      }
      out.push(`<li style="margin:0 0 6px 0">${enLinea(li[2] ?? '')}</li>`);
      continue;
    }
    cierraLista();
    parrafo.push(l.trim());
  }
  cierraTodo();
  return out.join('\n');
}

/** Texto plano legible: quita marcas de Markdown conservando la estructura. */
export function markdownATexto(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .trim();
}

export interface OpcionesPlantilla {
  /** Texto corto que Outlook/Gmail muestran como vista previa. */
  preheader: string;
  /** Etiqueta superior pequeña (p. ej. «NUEVO PROSPECTO»). */
  etiqueta: string;
  titulo: string;
  subtitulo?: string;
  /** Insignia de nivel (A–D) y score, opcional. */
  nivel?: string | null;
  score?: number | null;
  cuerpoMd: string;
  boton?: { texto: string; url: string };
  /** Texto del pie (a quién pertenece el aviso). */
  pie: string;
}

export function envolverCorreo(o: OpcionesPlantilla): string {
  const colorNivel = C.nivel[o.nivel ?? ''] ?? C.suave;
  const insignia = o.nivel
    ? `<td align="right" valign="middle" style="padding:0 0 0 12px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${colorNivel};color:#FFFFFF;${FUENTE}font-size:13px;font-weight:bold;padding:6px 12px;border-radius:14px;white-space:nowrap">Nivel ${esc(o.nivel)}${o.score != null ? ` · ${o.score}` : ''}</td></tr></table></td>`
    : '';
  const boton = o.boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px 0"><tr><td align="center" bgcolor="${C.deep}" style="background:${C.deep};border-radius:6px"><a href="${esc(o.boton.url)}" style="display:inline-block;padding:12px 26px;${FUENTE}font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none">${esc(o.boton.texto)} &rarr;</a></td></tr></table>`
    : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.ice};${FUENTE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.ice};font-size:1px;line-height:1px">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ice}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px">
<tr><td style="background:${C.deep};padding:18px 28px;border-radius:10px 10px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="${FUENTE}color:#FFFFFF;font-size:18px;font-weight:bold;letter-spacing:.3px">${NOMBRE_REMITENTE}</td>
<td align="right" valign="middle" style="${FUENTE}color:#7FD8D5;font-size:11px;letter-spacing:1.2px;text-transform:uppercase">${esc(o.etiqueta)}</td>
</tr></table></td></tr>
<tr><td style="background:${C.teal};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;padding:24px 32px 24px 32px;border-left:1px solid ${C.linea};border-right:1px solid ${C.linea}">
<img src="cid:${LOGO_CID}" width="115" height="51" alt="ACIT Integration Technology" style="display:block;border:0;margin:0 0 16px 0;width:115px;height:51px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><div style="${FUENTE}font-size:24px;line-height:1.25;font-weight:bold;color:${C.deep}">${esc(o.titulo)}</div>${o.subtitulo ? `<div style="${FUENTE}font-size:14px;color:${C.suave};margin-top:6px">${esc(o.subtitulo)}</div>` : ''}</td>${insignia}
</tr></table>
<div style="height:18px;line-height:18px;font-size:0">&nbsp;</div>
<div style="${FUENTE}">${markdownAHtml(o.cuerpoMd)}</div>
${boton}
</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${C.linea};border-top:0;border-radius:0 0 10px 10px;padding:0 32px 22px 32px">
<div style="border-top:1px solid ${C.linea};padding-top:14px;${FUENTE}font-size:12px;line-height:1.5;color:${C.suave}">${esc(o.pie)}<br>Mensaje interno generado por ${NOMBRE_REMITENTE}. No lo reenvíes a prospectos ni a clientes.</div>
</td></tr>
</table></td></tr></table>
</body></html>`;
}
