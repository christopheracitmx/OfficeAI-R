import { execFile } from 'node:child_process';

// Extracción local y barata: el LLM solo recibe texto compacto + datos ya extraídos por código.

export interface Extraccion {
  url: string;
  titulo: string | null;
  texto_compacto: string;
  correos: string[];
  telefonos: string[];
  enlaces_contacto: string[];
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&aacute;': 'á',
  '&eacute;': 'é',
  '&iacute;': 'í',
  '&oacute;': 'ó',
  '&uacute;': 'ú',
  '&ntilde;': 'ñ',
};

export function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTIDADES[m.toLowerCase()] ?? ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const EMAIL_BASURA = /(\.(png|jpe?g|gif|svg|webp|css|js)$|sentry|wixpress|example\.(com|mx)|@2x|your-?email|correo@|usuario@|name@|nombre@|@empresa\.com|@dominio\.|@tudominio)/i;

export function extraerCorreos(htmlOTexto: string): string[] {
  const hrefs = [...htmlOTexto.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1] ?? ''));
  const sueltos = htmlOTexto.match(EMAIL_RE) ?? [];
  const set = new Set<string>();
  for (const c of [...hrefs, ...sueltos]) {
    const v = c.trim().toLowerCase().replace(/[.,;:]+$/, '');
    if (v && !EMAIL_BASURA.test(v) && /^[^@]+@[^@]+\.[a-z]{2,}$/.test(v)) set.add(v);
  }
  return [...set].slice(0, 12);
}

const TEL_RE = /(?:\+?\s?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}/g;

function formatearTel(d: string): string {
  return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`.replace(/^(\d{2}) (\d{4}) (\d{4})$/, '$1 $2 $3');
}

/** Teléfonos del TEXTO visible y de enlaces tel: (nunca del HTML crudo: trae IDs de rastreo). */
export function extraerTelefonos(texto: string, html = ''): string[] {
  const hrefs = [...html.matchAll(/tel:([+\d()\s.-]{8,20})/gi)].map((m) => m[1] ?? '');
  const sueltos = texto.match(TEL_RE) ?? [];
  const set = new Set<string>();
  for (const bruto of [...hrefs, ...sueltos]) {
    let d = bruto.replace(/\D/g, '');
    if (d.startsWith('52') && d.length === 12) d = d.slice(2);
    if (d.length !== 10) continue;
    if (/^(\d)\1+$/.test(d) || /^(19|20)\d{2}(19|20)\d{2}/.test(d)) continue; // repetidos o rangos de años
    if (!/^[2-9]/.test(d)) continue; // las claves lada mexicanas no empiezan con 0 ni 1
    set.add(formatearTel(d));
  }
  return [...set].slice(0, 12);
}

export function enlacesDeContacto(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] ?? '';
    const texto = htmlATexto(m[2] ?? '');
    if (!/contact|nosotros|acerca|about|aviso|privacidad|sucursal/i.test(`${href} ${texto}`)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname === new URL(base).hostname && /^https?:$/.test(u.protocol)) out.add(u.toString());
    } catch {
      /* enlace inválido: se ignora */
    }
  }
  return [...out].slice(0, 6);
}

export function construirExtraccion(url: string, html: string, maxChars = 5000): Extraccion {
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const texto = htmlATexto(html);
  return {
    url,
    titulo: titulo ? htmlATexto(titulo) : null,
    texto_compacto: texto.length > maxChars ? `${texto.slice(0, maxChars)}…` : texto,
    correos: extraerCorreos(html),
    telefonos: extraerTelefonos(texto, html),
    enlaces_contacto: enlacesDeContacto(html, url),
  };
}

export interface OpcionesFetch {
  bin: string;
  timeoutS?: number;
  /** Inyectable en tests. */
  runner?: (bin: string, args: string[], timeoutMs: number) => Promise<string>;
}

function ejecutar(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

/** Lee una página con `obscura fetch` (nivel 2 de la cadena de lectura). stderr (logs de JS) se descarta. */
export async function fetchHtml(url: string, o: OpcionesFetch): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Solo URLs http(s)');
  const t = o.timeoutS ?? 20;
  const run = o.runner ?? ejecutar;
  return run(o.bin, ['fetch', url, '--dump', 'html', '--timeout', String(t), '--obey-robots'], (t + 10) * 1000);
}
