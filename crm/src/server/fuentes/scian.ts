import { GOBIERNO_RE } from '../services/empresas';

/** Estrato de personal ocupado de DENUE: código -> [etiqueta, límite inferior]. */
export const ESTRATOS: Record<number, { etiqueta: string; min: number }> = {
  1: { etiqueta: '0 a 5 personas', min: 0 },
  2: { etiqueta: '6 a 10 personas', min: 6 },
  3: { etiqueta: '11 a 30 personas', min: 11 },
  4: { etiqueta: '31 a 50 personas', min: 31 },
  5: { etiqueta: '51 a 100 personas', min: 51 },
  6: { etiqueta: '101 a 250 personas', min: 101 },
  7: { etiqueta: '251 y más personas', min: 251 },
};

/** Acepta el código (1-7) o el texto de DENUE («11 a 30 personas», «251 y más personas»). */
export function estratoDe(valor: string | number | null | undefined): number | undefined {
  if (valor === null || valor === undefined) return undefined;
  const s = String(valor).trim();
  if (/^[1-7]$/.test(s)) return Number(s);
  const m = /(\d+)\s*(?:a|y)\s*/i.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  const hit = Object.entries(ESTRATOS).find(([, e]) => e.min === n);
  return hit ? Number(hit[0]) : undefined;
}

export const personalDeEstrato = (e: number | undefined): number | undefined =>
  e === undefined ? undefined : ESTRATOS[e]?.min;

/** Categoría de tamaño del CRM a partir del personal estimado (aproximación; el Analista la corrige). */
export function tamanoDePersonal(p: number | undefined | null): string | null {
  if (p === undefined || p === null) return null;
  if (p <= 10) return 'micro';
  if (p <= 30) return 'pequena';
  if (p <= 100) return 'mediana';
  return 'grande';
}

/** SCIAN -> giro de la taxonomía del CRM (por prefijo; el más específico gana). */
const SCIAN_GIRO: [string, string][] = [
  ['5415', 'Tecnología y telecomunicaciones'],
  ['517', 'Tecnología y telecomunicaciones'],
  ['518', 'Tecnología y telecomunicaciones'],
  ['519', 'Tecnología y telecomunicaciones'],
  ['721', 'Hotelería y turismo'],
  ['722', 'Alimentos y bebidas'],
  ['311', 'Alimentos y bebidas'],
  ['312', 'Alimentos y bebidas'],
  ['53', 'Construcción e inmobiliaria'],
  ['23', 'Construcción e inmobiliaria'],
  ['11', 'Agroindustria'],
  ['31', 'Manufactura'],
  ['32', 'Manufactura'],
  ['33', 'Manufactura'],
  ['43', 'Retail y comercio'],
  ['46', 'Retail y comercio'],
  ['48', 'Logística y transporte'],
  ['49', 'Logística y transporte'],
  ['52', 'Financiero y seguros'],
  ['54', 'Corporativo y servicios profesionales'],
  ['55', 'Corporativo y servicios profesionales'],
  ['56', 'Corporativo y servicios profesionales'],
  ['61', 'Educación privada'],
  ['62', 'Salud privada'],
];

export function giroDeScian(scian: string | undefined | null): string {
  if (!scian) return 'Otro';
  const hit = SCIAN_GIRO.filter(([p]) => scian.startsWith(p)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return hit ? hit[1] : 'Otro';
}

/** Giro de la taxonomía -> prefijos SCIAN a consultar. «Cualquiera» = los sectores B2B prioritarios. */
export function scianDeGiro(giro: string): string[] {
  if (!giro || /^cualquiera$/i.test(giro.trim()))
    return ['31', '32', '33', '48', '49', '52', '54', '55', '56', '61', '62', '5415', '517', '721', '43'];
  const set = new Set(SCIAN_GIRO.filter(([, g]) => g === giro).map(([p]) => p));
  return [...set];
}

/** Sector 93 (actividades legislativas, gubernamentales y de impartición de justicia) o nombre de gobierno. */
export function esGobierno(nombre: string, scian: string | undefined | null): boolean {
  return Boolean(scian?.startsWith('93')) || GOBIERNO_RE.test(nombre);
}
