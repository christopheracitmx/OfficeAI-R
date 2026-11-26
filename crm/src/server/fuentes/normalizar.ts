import { norm } from '../services/zona';

const SUFIJOS_LEGALES =
  /\b(s\.? ?a\.? ?p\.? ?i\.? ?de c\.? ?v\.?|s\.? ?a\.? ?b\.? ?de c\.? ?v\.?|s\.? ?a\.? ?de c\.? ?v\.?|s\.? ?de r\.? ?l\.? ?de c\.? ?v\.?|s\.? ?de r\.? ?l\.?|s\.? ?a\.? ?s\.?|s\.? ?c\.?|a\.? ?c\.?|s\.? ?a\.?|sapi de cv|sa de cv|s de rl de cv|s de rl|sab de cv|sas)(?=\s|$|[.,])/gi;

/** Nombre comparable entre fuentes: sin acentos, sin forma legal, sin puntuación. */
export function nombreNorm(nombre: string): string {
  return norm(nombre.replace(SUFIJOS_LEGALES, ' '))
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Teléfono a 10 dígitos (México). Devuelve undefined si no es creíble. */
export function telefonoNorm(t: string | null | undefined): string | undefined {
  if (!t) return undefined;
  const primero = t.split(/[;,/]|\s{2,}| y /i)[0] ?? '';
  let d = primero.replace(/\D/g, '');
  if (d.startsWith('52') && d.length >= 12) d = d.slice(-10);
  if (d.startsWith('044') || d.startsWith('045')) d = d.slice(3);
  return d.length === 10 ? d : undefined;
}

export function correoNorm(c: string | null | undefined): string | undefined {
  if (!c) return undefined;
  const v = (c.split(/[;, ]/)[0] ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120 ? v : undefined;
}

/** URL http(s) válida o undefined (agrega https:// a «www.algo.com»). */
export function webNorm(w: string | null | undefined): string | undefined {
  if (!w) return undefined;
  let v = (w.split(/[;, ]/)[0] ?? '').trim();
  if (!v) return undefined;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.')) return undefined;
    // Una página de red social NO es el sitio de la empresa (regla: sin redes sociales).
    if (/(facebook|instagram|twitter|tiktok|linkedin|youtube)\.com$|^wa\.me$/.test(u.hostname.replace(/^www\./, '')))
      return undefined;
    return u.href.slice(0, 300);
  } catch {
    return undefined;
  }
}

export const num = (x: unknown): number | undefined => {
  const n = typeof x === 'string' ? Number(x.trim()) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : undefined;
};
