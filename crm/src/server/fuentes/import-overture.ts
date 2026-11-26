import { basename } from 'node:path';
import { z } from 'zod';
import type { Db } from '../db';
import { derivarZona, norm } from '../services/zona';
import { giroDeCategoria } from './categorias';
import { guardarDataset, type RegistroDataset } from './dataset';
import { lineas } from './lector';
import { correoNorm, nombreNorm, telefonoNorm, webNorm } from './normalizar';
import { esGobierno } from './scian';
import type { ResumenImport } from './import-denue';

const LICENCIAS: [RegExp, string][] = [
  [/foursquare/i, 'Apache 2.0'],
  [/allthe ?places/i, 'CC0 1.0'],
  [/(meta|microsoft|pinmeto|krick|rendersEO|dac|brightquery|birdeye|uberall|opentravel)/i, 'CDLA Permissive 2.0'],
];

const licenciaDe = (dataset: string): string =>
  LICENCIAS.find(([re]) => re.test(dataset))?.[1] ?? 'Ver licencia del origen en Overture Maps';

// Esquema tolerante: el de Overture ha cambiado entre versiones; solo exigimos lo mínimo.
const feature = z.object({
  properties: z.object({
    id: z.string(),
    names: z.object({ primary: z.string().nullish() }).nullish(),
    categories: z.object({ primary: z.string().nullish() }).nullish(),
    taxonomy: z.object({ primary: z.string().nullish() }).nullish(),
    basic_category: z.string().nullish(),
    confidence: z.number().nullish(),
    websites: z.array(z.string()).nullish(),
    emails: z.array(z.string()).nullish(),
    phones: z.array(z.string()).nullish(),
    addresses: z
      .array(
        z.object({
          freeform: z.string().nullish(),
          locality: z.string().nullish(),
          postcode: z.string().nullish(),
          region: z.string().nullish(),
        }),
      )
      .nullish(),
    sources: z.array(z.object({ dataset: z.string().nullish() })).nullish(),
    operating_status: z.string().nullish(),
  }),
  geometry: z.object({ coordinates: z.array(z.number()).min(2) }).nullish(),
});

export interface OpcionesImportOverture {
  /** Versión de la liberación (p. ej. 2026-11-18.0). */
  version: string;
  fecha_dataset?: string | undefined;
  /** Confianza mínima (0 a 1). Registros sin confianza se conservan. */
  confianza_min?: number | undefined;
  reemplazar?: boolean | undefined;
}

export function filaOverture(
  linea: string,
  confianzaMin: number,
  version: string,
): RegistroDataset | { descarte: string } {
  let json: unknown;
  try {
    json = JSON.parse(linea.replace(/^\u001e/, ''));
  } catch {
    return { descarte: 'json_invalido' };
  }
  const f = feature.safeParse(json);
  if (!f.success) return { descarte: 'formato' };
  const p = f.data.properties;
  const nombre = p.names?.primary?.trim();
  if (!nombre) return { descarte: 'sin_nombre' };
  if (p.operating_status && p.operating_status !== 'open') return { descarte: 'cerrado' };
  if (p.confidence !== null && p.confidence !== undefined && p.confidence < confianzaMin)
    return { descarte: 'confianza_baja' };
  const dir = p.addresses?.[0];
  const direccion = [dir?.freeform, dir?.locality, dir?.postcode, dir?.region]
    .filter(Boolean)
    .join(', ');
  const region = dir?.region ?? '';
  const zona = derivarZona(direccion);
  const estado =
    /^MX-CMX$|^MX-DIF$/i.test(region) ? 'CDMX' : /^MX-MEX$/i.test(region) ? 'Estado de México' : zona.estado_mx;
  if (!estado) return { descarte: 'fuera_de_piloto' };
  if (esGobierno(nombre, null)) return { descarte: 'gobierno' };
  const categoria = p.taxonomy?.primary ?? p.categories?.primary ?? p.basic_category ?? null;
  const dataset = p.sources?.[0]?.dataset ?? 'desconocido';
  const [lng, lat] = f.data.geometry?.coordinates ?? [];
  const municipio = zona.municipio ?? dir?.locality ?? null;
  return {
    fuente_id: 'overture_local',
    registro_id: p.id,
    nombre,
    nombre_norm: nombreNorm(nombre),
    scian: null,
    categoria,
    giro: giroDeCategoria(categoria, p.basic_category),
    estrato: null,
    personal_est: null,
    direccion: direccion || null,
    codigo_postal: dir?.postcode?.replace(/\D/g, '').slice(0, 5) || zona.codigo_postal,
    municipio,
    municipio_norm: municipio ? norm(municipio) : null,
    estado_mx: estado,
    telefono: telefonoNorm(p.phones?.[0]) ?? null,
    correo: correoNorm(p.emails?.[0]) ?? null,
    // Las redes sociales (socials) se ignoran a propósito: regla «sin redes sociales».
    sitio_web: webNorm(p.websites?.[0]) ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    licencia: licenciaDe(dataset),
    atribucion: `© Overture Maps Foundation (origen: ${dataset}, liberación ${version})`,
    url: `https://explorer.overturemaps.org/?id=${encodeURIComponent(p.id)}`,
  };
}

/** Importa un GeoJSON Lines (salida de `overturemaps download --type=place -f geojsonseq`). */
export async function importarOverture(
  db: Db,
  archivo: string,
  o: OpcionesImportOverture,
): Promise<ResumenImport> {
  const min = o.confianza_min ?? 0.5;
  const resumen: ResumenImport = { leidos: 0, guardados: 0, descartados: {} };
  const registros: RegistroDataset[] = [];
  for await (const l of lineas(archivo)) {
    if (!l.trim() || l.trim() === ',') continue;
    resumen.leidos++;
    const r = filaOverture(l, min, o.version);
    if ('descarte' in r) resumen.descartados[r.descarte] = (resumen.descartados[r.descarte] ?? 0) + 1;
    else registros.push(r);
  }
  const descartados = Object.values(resumen.descartados).reduce((x, y) => x + y, 0);
  resumen.guardados = guardarDataset(
    db,
    'overture_local',
    registros,
    {
      version: o.version,
      fecha_dataset: o.fecha_dataset ?? null,
      descartados,
      archivo: basename(archivo),
      nota: `Confianza mínima: ${min}`,
    },
    o.reemplazar ?? true,
  );
  return resumen;
}
