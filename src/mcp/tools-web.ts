import { z } from 'zod';
import { derivarZona } from '../server/services/zona';
import type { CrmApi } from './api';
import { ApiError } from './api';
import { construirExtraccion, fetchHtml, type Extraccion, type OpcionesFetch } from './extract';
import { placesSearch, type OpcionesPlaces } from './places';

export interface WebDeps {
  api: CrmApi;
  obscura: OpcionesFetch;
  placesKey: string;
  fetchFn?: typeof fetch;
  /** Topes por llamada del agente (cada llamada es un proceso MCP nuevo): páginas y caracteres devueltos. */
  limites?: { paginas: number; texto: number; leidas: number };
}

export const placesSchema = {
  consulta: z
    .string()
    .min(3)
    .max(200)
    .describe('Ej: "fábricas en Tlalnepantla de Baz, Estado de México"'),
  max: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe('Máximo de empresas (usa el lote de la corrida)'),
};

export const extractSchema = { url: z.string().url().describe('Página pública a leer') };

type RespuestaCache = { texto_compacto: string; emails: string; telefonos: string } | null;

/** Cadena de lectura: caché → obscura fetch → (el agente usa web_search si devuelve ok:false). */
export async function obscuraExtract(
  url: string,
  d: WebDeps,
): Promise<
  | (Extraccion & { origen: 'cache' | 'obscura' })
  | { ok: false; error: string; siguiente: 'web_search' | 'terminar' }
> {
  const lim = d.limites;
  if (lim) {
    if (lim.leidas >= lim.paginas)
      return {
        ok: false,
        error: `Tope de ${lim.paginas} páginas para este paso: trabaja con lo que ya leíste y guárdalo.`,
        siguiente: 'terminar',
      };
    lim.leidas++;
  }
  const r = await leerPagina(url, d);
  return lim && 'texto_compacto' in r
    ? { ...r, texto_compacto: r.texto_compacto.slice(0, lim.texto) }
    : r;
}

async function leerPagina(
  url: string,
  d: WebDeps,
): Promise<
  | (Extraccion & { origen: 'cache' | 'obscura' })
  | { ok: false; error: string; siguiente: 'web_search' }
> {
  const cache = (await d.api.get(`/cache?url=${encodeURIComponent(url)}`)) as RespuestaCache;
  if (cache) {
    return {
      url,
      titulo: null,
      texto_compacto: cache.texto_compacto,
      correos: JSON.parse(cache.emails) as string[],
      telefonos: JSON.parse(cache.telefonos) as string[],
      enlaces_contacto: [],
      origen: 'cache',
    };
  }
  let ultimoError = 'sin respuesta';
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const html = await fetchHtml(url, d.obscura);
      if (html.trim().length < 50) throw new Error('Página vacía');
      const ext = construirExtraccion(url, html);
      await d.api.post('/cache', {
        url,
        texto_compacto: ext.texto_compacto,
        emails: ext.correos,
        telefonos: ext.telefonos,
      });
      return { ...ext, origen: 'obscura' };
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    ok: false,
    error: `Obscura no pudo leer la página: ${ultimoError}`,
    siguiente: 'web_search',
  };
}

/** Busca en Places y registra directo en el directorio: devuelve solo un resumen (ahorra tokens). */
export async function placesDescubrir(consulta: string, max: number, d: WebDeps) {
  const opts: OpcionesPlaces = {
    apiKey: d.placesKey,
    consumir: async () => {
      try {
        await d.api.post('/places/consumir', { n: 1 });
      } catch (e) {
        if (e instanceof ApiError && e.status === 429)
          throw new Error(`quota_exceeded: ${e.message}`);
        throw e;
      }
    },
    ...(d.fetchFn ? { fetchFn: d.fetchFn } : {}),
  };
  const lugares = await placesSearch(consulta, max, opts);
  let nuevas = 0;
  let existentes = 0;
  const rechazadas: { nombre: string; motivo: string }[] = [];
  const registradas: { empresa_id: number; nombre: string; zona: string | null }[] = [];
  for (const l of lugares) {
    const r = (await d.api.post('/empresas', {
      nombre: l.nombre,
      place_id: l.place_id,
      metodo_descubrimiento: 'places',
      origen_nota: `Places: ${consulta}`,
      direccion: l.direccion,
    })) as { status: string; id?: number; motivo?: string };
    if (r.status === 'creada' && r.id) {
      nuevas++;
      registradas.push({ empresa_id: r.id, nombre: l.nombre, zona: derivarZona(l.direccion).zona });
    } else if (r.status === 'existente') existentes++;
    else rechazadas.push({ nombre: l.nombre, motivo: r.motivo ?? 'rechazada' });
  }
  await d.api.post('/busquedas', {
    metodo: 'places',
    consulta,
    resultados: lugares.length,
    nuevas,
  });
  return { consulta, encontradas: lugares.length, nuevas, existentes, rechazadas, registradas };
}
