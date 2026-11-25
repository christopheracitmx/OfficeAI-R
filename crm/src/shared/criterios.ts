// Criterios simples de los casos dorados, verificables por código (sin IA) sobre la salida de un agente.
import type { Criterio } from './aprendizaje';
import { mencionaPrecio } from './domain';

export interface ResultadoCriterio {
  criterio: string;
  ok: boolean;
  detalle: string;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const TELEFONO = /(?:\+?52[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)\d{3,4}[\s-]?\d{4}\b/;
const URL = /https?:\/\/[^\s"')]+/;
const V = '[a-záéíóúñ]*';
const CONTACTO_EXTERNO = new RegExp(
  String.raw`\b(?:le|les)\s+(?:escrib${V}|llam${V}|contact${V}|envi${V}|mand${V})|\b(?:contact${V}|escrib${V}|llam${V}|envi${V})\s+(?:al|a la|a los)\s+(?:prospecto|cliente|empresa|gerente)`,
  'i',
);

/** Extrae el primer objeto/arreglo JSON de un texto (tolera ```json ... ```). */
export function extraerJson(texto: string): unknown {
  const limpio = texto
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  try {
    return JSON.parse(limpio);
  } catch {
    /* intenta recortar al primer {...} */
  }
  const ini = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (ini >= 0 && fin > ini) {
    try {
      return JSON.parse(limpio.slice(ini, fin + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function contactoConFuente(salida: string): [boolean, string] {
  const j = obj(extraerJson(salida));
  const lista = j && Array.isArray(j['contactos']) ? (j['contactos'] as unknown[]) : null;
  if (lista) {
    const sin = lista.filter((c) => !URL.test(String(obj(c)?.['fuente_url'] ?? '')));
    return sin.length === 0
      ? [true, `${lista.length} contacto(s), todos con fuente`]
      : [false, `${sin.length} contacto(s) sin fuente_url`];
  }
  const lineas = salida.split(/\r?\n/).filter((l) => EMAIL.test(l) || TELEFONO.test(l));
  const sin = lineas.filter((l) => !URL.test(l));
  if (lineas.length === 0) return [true, 'sin contactos en la salida'];
  return sin.length === 0
    ? [true, `${lineas.length} línea(s) con contacto y fuente`]
    : [false, `${sin.length} línea(s) con contacto sin fuente`];
}

function paqueteCoherente(salida: string): [boolean, string] {
  const j = obj(extraerJson(salida));
  const paquetes = j && Array.isArray(j['paquetes']) ? (j['paquetes'] as unknown[]) : null;
  const productos = j && Array.isArray(j['productos']) ? (j['productos'] as unknown[]) : null;
  if (!paquetes || !productos) return [false, 'la salida no trae JSON con productos y paquetes'];
  const cats = productos.map((p) => String(obj(p)?.['categoria'] ?? '').toLowerCase());
  for (const p of paquetes) {
    const o = obj(p);
    const comps = Array.isArray(o?.['componentes'])
      ? (o['componentes'] as unknown[]).map(String)
      : [];
    if (comps.length < 2)
      return [false, `el paquete «${String(o?.['nombre'])}» tiene menos de 2 componentes`];
    if (!String(o?.['argumento'] ?? '').trim()) return [false, 'un paquete no trae argumento'];
    for (const c of comps) {
      const k = c.toLowerCase();
      if (!cats.some((x) => x && (x.includes(k) || k.includes(x))))
        return [false, `el componente «${c}» no está entre los productos propuestos`];
    }
  }
  return [true, `${paquetes.length} paquete(s) coherentes con los productos`];
}

export function evaluarCriterio(salida: string, c: Criterio): ResultadoCriterio {
  const nombre = c.valor ? `${c.tipo}: ${c.valor}` : c.tipo;
  const r = (ok: boolean, detalle: string): ResultadoCriterio => ({
    criterio: nombre,
    ok,
    detalle,
  });
  const v = c.valor ?? '';
  switch (c.tipo) {
    case 'sin_precios':
      return mencionaPrecio(salida)
        ? r(false, 'menciona precios o costos')
        : r(true, 'sin precios');
    case 'sin_contacto_externo':
      return CONTACTO_EXTERNO.test(salida)
        ? r(false, 'dice haber contactado al prospecto')
        : r(true, 'sin contacto externo');
    case 'contacto_con_fuente':
      return r(...contactoConFuente(salida));
    case 'paquete_coherente':
      return r(...paqueteCoherente(salida));
    case 'contiene':
      return salida.toLowerCase().includes(v.toLowerCase())
        ? r(true, 'presente')
        : r(false, `falta «${v}»`);
    case 'no_contiene':
      return salida.toLowerCase().includes(v.toLowerCase())
        ? r(false, `aparece «${v}»`)
        : r(true, 'ausente');
    case 'largo_max': {
      const max = Number(v) || 0;
      return salida.length <= max
        ? r(true, `${salida.length} ≤ ${max} caracteres`)
        : r(false, `${salida.length} > ${max} caracteres`);
    }
    case 'json_valido':
      return extraerJson(salida) !== undefined
        ? r(true, 'JSON válido')
        : r(false, 'no es JSON válido');
  }
}

export function evaluarCriterios(salida: string, criterios: Criterio[]): ResultadoCriterio[] {
  return criterios.map((c) => evaluarCriterio(salida, c));
}
