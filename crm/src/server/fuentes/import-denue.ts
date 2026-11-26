import { basename } from 'node:path';
import type { Db } from '../db';
import { derivarZona, norm } from '../services/zona';
import { guardarDataset, type RegistroDataset } from './dataset';
import { filasCsv } from './lector';
import { correoNorm, nombreNorm, num, telefonoNorm, webNorm } from './normalizar';
import { esGobierno, estratoDe, giroDeScian, personalDeEstrato } from './scian';

export const DENUE_LICENCIA = 'Términos de libre uso de la información del INEGI';
export const DENUE_ATRIBUCION = 'Fuente: INEGI, Directorio Estadístico Nacional de Unidades Económicas (DENUE)';
const URL_DENUE = 'https://www.inegi.org.mx/app/mapa/denue/';

export interface OpcionesImportDenue {
  version: string;
  fecha_dataset?: string | undefined;
  /** Estrato mínimo a conservar en la base local (1 = todo; 2 = desde 6 personas...). */
  estrato_min?: number | undefined;
  /** true = reemplaza lo anterior (actualización completa); false = agrega archivos. */
  reemplazar?: boolean | undefined;
}

export interface ResumenImport {
  leidos: number;
  guardados: number;
  descartados: Record<string, number>;
}

const g = (f: Record<string, string>, ...claves: string[]): string => {
  for (const k of claves) if (f[k]) return f[k]!;
  return '';
};

/** Fila de DENUE (CSV de la descarga masiva) -> registro local, o el motivo de descarte. */
export function filaDenue(
  f: Record<string, string>,
  estratoMin: number,
): RegistroDataset | { descarte: string } {
  const id = g(f, 'id', 'clee');
  const nombre = g(f, 'nom_estab', 'nombre');
  if (!id || !nombre) return { descarte: 'sin_id_o_nombre' };
  const cveEnt = g(f, 'cve_ent').replace(/\D/g, '').padStart(2, '0');
  const entidad = norm(g(f, 'entidad', 'entidad_federativa'));
  const estado =
    cveEnt === '09' || entidad.includes('ciudad de mexico')
      ? 'CDMX'
      : cveEnt === '15' || entidad === 'mexico' || entidad.includes('estado de mexico')
        ? 'Estado de México'
        : null;
  if (!estado) return { descarte: 'fuera_de_piloto' };
  const scian = g(f, 'codigo_act', 'clase_actividad_id', 'scian') || null;
  if (esGobierno(nombre, scian)) return { descarte: 'gobierno' };
  const estrato = estratoDe(g(f, 'per_ocu', 'estrato'));
  if (estrato !== undefined && estrato < estratoMin) return { descarte: 'micronegocio' };
  const calle = [g(f, 'tipo_vial'), g(f, 'nom_vial', 'calle')].filter(Boolean).join(' ');
  const num_ext = g(f, 'numero_ext', 'num_exterior');
  const colonia = g(f, 'nomb_asent', 'colonia');
  const cp = g(f, 'cod_postal', 'cp').replace(/\D/g, '').slice(0, 5) || null;
  const municipio = g(f, 'municipio') || null;
  const direccion = [
    [calle, num_ext].filter(Boolean).join(' '),
    colonia,
    cp ? `C.P. ${cp}` : '',
    municipio ?? '',
    estado,
  ]
    .filter(Boolean)
    .join(', ');
  const zona = derivarZona(direccion);
  return {
    fuente_id: 'denue_local',
    registro_id: id,
    nombre,
    nombre_norm: nombreNorm(nombre),
    scian,
    categoria: g(f, 'nombre_act') || null,
    giro: giroDeScian(scian),
    estrato: estrato ?? null,
    personal_est: personalDeEstrato(estrato) ?? null,
    direccion,
    codigo_postal: cp,
    municipio: municipio ?? zona.municipio,
    municipio_norm: municipio ? norm(municipio) : zona.municipio ? norm(zona.municipio) : null,
    estado_mx: estado,
    telefono: telefonoNorm(g(f, 'telefono')) ?? null,
    correo: correoNorm(g(f, 'correoelec', 'correo_e', 'correo')) ?? null,
    sitio_web: webNorm(g(f, 'www', 'sitio_internet')) ?? null,
    lat: num(g(f, 'latitud')) ?? null,
    lng: num(g(f, 'longitud')) ?? null,
    licencia: DENUE_LICENCIA,
    atribucion: DENUE_ATRIBUCION,
    url: `${URL_DENUE}?id=${encodeURIComponent(id)}`,
  };
}

/** Importa uno o más CSV del DENUE a la tabla local (filtrado a CDMX/Edomex, sin gobierno ni micronegocios). */
export async function importarDenue(
  db: Db,
  archivos: string[],
  o: OpcionesImportDenue,
): Promise<ResumenImport> {
  const estratoMin = o.estrato_min ?? 2;
  const resumen: ResumenImport = { leidos: 0, guardados: 0, descartados: {} };
  const registros: RegistroDataset[] = [];
  for (const a of archivos)
    for await (const fila of filasCsv(a)) {
      resumen.leidos++;
      const r = filaDenue(fila, estratoMin);
      if ('descarte' in r) resumen.descartados[r.descarte] = (resumen.descartados[r.descarte] ?? 0) + 1;
      else registros.push(r);
    }
  const descartados = Object.values(resumen.descartados).reduce((x, y) => x + y, 0);
  resumen.guardados = guardarDataset(
    db,
    'denue_local',
    registros,
    {
      version: o.version,
      fecha_dataset: o.fecha_dataset ?? null,
      descartados,
      archivo: archivos.map((x) => basename(x)).join(', ').slice(0, 300),
      nota: `Estrato mínimo conservado: ${estratoMin}`,
    },
    o.reemplazar ?? true,
  );
  return resumen;
}
