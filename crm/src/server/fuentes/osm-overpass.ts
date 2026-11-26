import { z } from 'zod';
import { derivarZona } from '../services/zona';
import { giroDeCategoria } from './categorias';
import { ErrorFuente, pedirJson } from './http';
import { correoNorm, telefonoNorm, webNorm } from './normalizar';
import { esGobierno } from './scian';
import type { BusquedaFuente, Candidato, CtxFuente, FuenteAdapter } from './tipos';
import { resolverZona } from './zona-filtro';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
/** Identificable y genérico: sin datos personales (política de uso de Overpass). */
export const USER_AGENT = 'acitmx-prospecting-crm/1.0 (directorio interno de prospeccion B2B)';
const PAUSA_MS = 2000;

const ATRIB = '© colaboradores de OpenStreetMap, datos bajo ODbL 1.0';
const LICENCIA = 'ODbL 1.0 (atribución; share-alike si se publica una base derivada)';

/** Giro de la taxonomía -> filtros de etiquetas OSM. */
const FILTROS: Record<string, string[]> = {
  Manufactura: ['["industrial"]', '["man_made"="works"]', '["craft"]'],
  'Logística y transporte': ['["industrial"~"warehouse|logistics|distribution"]', '["office"="logistics"]'],
  'Educación privada': ['["amenity"~"^(school|college|university)$"]'],
  'Salud privada': ['["amenity"~"^(hospital|clinic)$"]', '["healthcare"~"hospital|clinic|laboratory"]'],
  'Corporativo y servicios profesionales': [
    '["office"~"^(company|consulting|lawyer|accountant|coworking)$"]',
  ],
  'Retail y comercio': ['["shop"~"^(supermarket|department_store|mall|wholesale)$"]'],
  'Hotelería y turismo': ['["tourism"~"^(hotel|hostel|motel)$"]'],
  Agroindustria: ['["industrial"="agricultural"]'],
  'Construcción e inmobiliaria': ['["office"~"^(construction|estate_agent)$"]'],
  'Financiero y seguros': ['["amenity"="bank"]', '["office"~"^(insurance|financial)$"]'],
  'Tecnología y telecomunicaciones': ['["office"~"^(it|telecommunication)$"]'],
  'Alimentos y bebidas': ['["industrial"="food"]', '["craft"~"^(bakery|brewery|confectionery)$"]'],
};
const TODOS = Object.values(FILTROS).flat();

const respuesta = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

const AREAS = { CDMX: 'MX-CMX', 'Estado de México': 'MX-MEX' } as const;

export function construirConsulta(q: BusquedaFuente, estado: 'CDMX' | 'Estado de México', municipio?: string): string {
  const area = municipio
    ? `area["boundary"="administrative"]["admin_level"="6"]["name"="${municipio.replace(/["\\]/g, '')}"]->.z;`
    : `area["ISO3166-2"="${AREAS[estado]}"]->.z;`;
  const filtros = !q.giro || /^cualquiera$/i.test(q.giro) ? TODOS : (FILTROS[q.giro] ?? TODOS);
  const tope = Math.min(Math.max(q.max * 5, 20), 200);
  const texto = q.texto ? `["name"~"${q.texto.replace(/["\\]/g, '').slice(0, 40)}",i]` : '';
  return `[out:json][timeout:25];${area}(${filtros.map((f) => `nwr(area.z)["name"]${texto}${f};`).join('')});out tags center ${tope};`;
}

function aCandidato(
  e: z.infer<typeof respuesta>['elements'][number],
  estado: 'CDMX' | 'Estado de México',
): Candidato | null {
  const t = e.tags ?? {};
  const nombre = t['name']?.trim();
  if (!nombre || esGobierno(nombre, null)) return null;
  const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const cp = t['addr:postcode']?.replace(/\D/g, '').slice(0, 5);
  const direccion = [calle, t['addr:suburb'], cp ? `C.P. ${cp}` : '', t['addr:city'], t['addr:state'] ?? estado]
    .filter(Boolean)
    .join(', ');
  const zona = derivarZona(direccion);
  const categoria = [t['office'], t['industrial'], t['craft'], t['amenity'], t['healthcare'], t['tourism'], t['shop']]
    .filter(Boolean)
    .join(' ');
  return {
    nombre,
    direccion,
    municipio: zona.municipio ?? t['addr:city'],
    codigo_postal: cp,
    estado_mx: zona.estado_mx ?? estado,
    telefono: telefonoNorm(t['phone'] ?? t['contact:phone']),
    correo: correoNorm(t['email'] ?? t['contact:email']),
    // Las etiquetas contact:facebook/instagram se ignoran a propósito (sin redes sociales).
    sitio_web: webNorm(t['website'] ?? t['contact:website']),
    giro: giroDeCategoria(categoria),
    lat: e.lat ?? e.center?.lat,
    lng: e.lon ?? e.center?.lon,
    fuente_id: 'osm_overpass',
    registro_id: `${e.type}/${e.id}`,
    fuente_url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    licencia: LICENCIA,
    atribucion: ATRIB,
  };
}

// Una consulta a la vez en todo el proceso (política de uso justo de Overpass).
let cola: Promise<unknown> = Promise.resolve();
const enFila = <T>(fn: () => Promise<T>): Promise<T> => {
  const r = cola.then(fn, fn);
  cola = r.catch(() => undefined);
  return r;
};

async function consultar(ctx: CtxFuente, ql: string): Promise<z.infer<typeof respuesta>> {
  const endpoint = ctx.env['OVERPASS_URL']?.trim() || ENDPOINT;
  const json = await enFila(() =>
    pedirJson(ctx, endpoint, {
      init: {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(ql)}`,
      },
      intentos: 2,
      timeoutMs: 40000,
      esperaMs: 30000, // 429/406: esperar 30 s (política de Overpass)
    }),
  );
  const r = respuesta.safeParse(json);
  if (!r.success) throw new ErrorFuente('Respuesta de Overpass con formato inesperado');
  return r.data;
}

export const osmOverpass: FuenteAdapter = {
  id: 'osm_overpass',
  nombre: 'OpenStreetMap (Overpass API)',
  tipo: 'api',
  requiere_token: false,
  limites:
    'Instancia pública overpass-api.de: una consulta a la vez, timeout 25 s, pausa entre consultas, tope mensual propio (editable). Sin tamaño de empresa.',
  tope_defecto: 300,
  metodo: 'osm_overpass',
  licencia: LICENCIA,
  atribucion: ATRIB,
  info_url: 'https://wiki.openstreetmap.org/wiki/Overpass_API',

  async buscar(q, ctx) {
    const z = resolverZona(q.zona);
    const esperar = ctx.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const out: Candidato[] = [];
    const objetivos = z.municipios.length > 0 ? z.municipios.map((m) => [z.estados[0]!, m] as const) : z.estados.map((e) => [e, undefined] as const);
    for (const [estado, muni] of objetivos) {
      ctx.consumir(1); // tope duro ANTES de la solicitud
      const datos = await consultar(ctx, construirConsulta(q, estado, muni));
      for (const e of datos.elements) {
        const c = aCandidato(e, estado);
        if (c) out.push(c);
      }
      if (out.length >= q.max * 3) break;
      await esperar(PAUSA_MS);
    }
    // Primero los que traen contacto (más útiles para el Rastreador).
    const peso = (c: Candidato) => Number(Boolean(c.sitio_web)) + Number(Boolean(c.telefono)) + Number(Boolean(c.correo));
    return out.sort((a, b) => peso(b) - peso(a));
  },

  async probar(ctx) {
    try {
      ctx.consumir(1);
      const d = await consultar(ctx, '[out:json][timeout:10];node(19.4326,-99.1332,19.4327,-99.1331);out count;');
      return { ok: true, detalle: `Overpass respondió (${d.elements.length} elemento(s) de prueba).` };
    } catch (e) {
      return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
    }
  },
};
