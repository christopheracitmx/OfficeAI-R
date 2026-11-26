import type { Db } from '../db';
import { GOBIERNO_RE } from '../services/empresas';
import type { RegistroDataset } from './dataset';

/**
 * Precalificación POR CÓDIGO (sin IA, sin red) de los registros de los datasets locales.
 * Sirve para que a los agentes de IA solo lleguen candidatos con datos suficientes y buen ajuste,
 * en orden de score. No reemplaza al Calificador: es un filtro y un orden baratos.
 */
export interface PreScore {
  score: number;
  desglose: { tamano: number; giro: number; contacto: number; zona: number; ajuste: number };
  /** Si no es null, el registro NO debe llegar a la IA (motivo corto). */
  descarte: string | null;
}

const CORREO_GRATIS = /@(gmail|hotmail|outlook|live|yahoo|icloud|prodigy|msn|aol|protonmail)\./i;
const RED_SOCIAL = /(facebook|instagram|twitter|x\.com|tiktok|linkedin|youtube|wa\.me|whatsapp)/i;

/** Ajuste del giro a lo que vende ACITMX (equipo de cómputo y redes): por prefijo SCIAN, el más específico gana. */
const GIRO_PUNTOS: [string, number][] = [
  ['52', 25],
  ['55', 24],
  ['54', 22],
  ['5415', 16], // TI: más bien competencia/canal, no usuario final
  ['51', 20],
  ['22', 20],
  ['43', 20],
  ['622', 24],
  ['62', 17],
  ['6113', 22],
  ['61', 15],
  ['31', 19],
  ['32', 19],
  ['33', 20],
  ['48', 17],
  ['49', 17],
  ['56', 14],
  ['721', 15],
  ['23', 13],
  ['53', 13],
  ['21', 14],
  ['46', 9],
  ['71', 7],
  ['72', 9],
  ['81', 5],
  ['11', 7],
];

/** Negocios que casi nunca compran equipo corporativo: se descartan antes de gastar IA. */
const DESCARTE_SCIAN = [
  '4611',
  '4612',
  '4613',
  '4614',
  '4615',
  '7225',
  '7224',
  '8121',
  '8122',
  '8123',
  '8111',
  '8112',
  '8131',
  '8132',
  '8133',
  '8134',
  '8139',
];
const DESCARTE_NOMBRE =
  /(iglesia|parroquia|templo|capilla|sindicato|abarrotes|miscel[aá]nea|tiendita|tortiller[ií]a|taquer[ií]a|fonda|cocina econ[oó]mica|jard[ií]n de ni[ñn]os|escuela primaria|primaria|secundaria t[eé]cnica|telesecundaria|cecyt|conalep|\bdif\b|cruz roja|comit[eé] vecinal|ejido)/i;

/** Municipios conurbados a las oficinas de CDMX y Edomex: cercanía alta. */
const EDOMEX_CERCANO = new Set([
  'naucalpan de juarez',
  'tlalnepantla de baz',
  'ecatepec de morelos',
  'nezahualcoyotl',
  'cuautitlan izcalli',
  'cuautitlan',
  'tultitlan',
  'coacalco de berriozabal',
  'atizapan de zaragoza',
  'huixquilucan',
  'la paz',
  'chalco',
  'tecamac',
  'texcoco',
  'toluca',
  'metepec',
  'lerma',
  'tepotzotlan',
  'chimalhuacan',
  'ixtapaluca',
  'nicolas romero',
  'zinacantepec',
]);

const dominio = (url: string): string =>
  url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0] ?? '';

type EntradaPre = Pick<
  RegistroDataset,
  | 'nombre'
  | 'scian'
  | 'personal_est'
  | 'telefono'
  | 'correo'
  | 'sitio_web'
  | 'estado_mx'
  | 'municipio_norm'
  | 'fuente_id'
>;

const motivo = (m: string): PreScore => ({
  score: 0,
  desglose: { tamano: 0, giro: 0, contacto: 0, zona: 0, ajuste: 0 },
  descarte: m,
});

export function preScore(r: EntradaPre): PreScore {
  const web = (r.sitio_web ?? '').trim();
  const webReal = web !== '' && !RED_SOCIAL.test(web);
  const correo = (r.correo ?? '').trim();
  const telOk = (r.telefono ?? '').replace(/\D/g, '').length >= 8;
  const scian = r.scian ?? '';

  if (scian.startsWith('93') || GOBIERNO_RE.test(r.nombre)) return motivo('gobierno');
  if (DESCARTE_NOMBRE.test(r.nombre)) return motivo('tipo de negocio no objetivo (nombre)');
  if (scian && DESCARTE_SCIAN.some((p) => scian.startsWith(p)))
    return motivo('giro no objetivo (SCIAN)');
  if (!correo && !webReal && !telOk) return motivo('sin ninguna vía de contacto');

  // Tamaño (0-35)
  const p = r.personal_est;
  const tamano =
    p === null || p === undefined
      ? 10
      : p >= 251
        ? 35
        : p >= 101
          ? 34
          : p >= 51
            ? 30
            : p >= 31
              ? 26
              : p >= 11
                ? 18
                : 8;

  // Giro (0-25)
  const hit = GIRO_PUNTOS.filter(([pre]) => scian.startsWith(pre)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  const giro = hit ? hit[1] : scian ? 8 : 10;

  // Contacto (0-30): correo corporativo, sitio propio y teléfono
  let contacto = 0;
  if (correo) contacto += CORREO_GRATIS.test(correo) ? 4 : 12;
  if (webReal) contacto += 10;
  if (telOk) contacto += 8;
  const dCorreo = correo.split('@')[1]?.toLowerCase();
  if (dCorreo && webReal && !CORREO_GRATIS.test(correo) && dominio(web).endsWith(dCorreo))
    contacto += 3; // el correo es del mismo dominio que su sitio: dato consistente
  contacto = Math.min(30, contacto);

  // Zona (0-10)
  const zona = r.estado_mx === 'CDMX' || EDOMEX_CERCANO.has(r.municipio_norm ?? '') ? 10 : 6;

  // Ajustes finos
  let ajuste = 0;
  if (p !== null && p !== undefined && p <= 10 && giro < 16) ajuste -= 8;
  if (r.fuente_id === 'overture_local' && !webReal) ajuste -= 5;

  const score = Math.max(0, Math.min(100, tamano + giro + contacto + zona + ajuste));
  return { score, desglose: { tamano, giro, contacto, zona, ajuste }, descarte: null };
}

/** Calcula y guarda el pre-score de todos los registros de una fuente (por lotes). */
export function precalificarDataset(
  db: Db,
  fuente: string,
): {
  total: number;
  descartados: number;
  por_nivel: Record<string, number>;
  corroborados: number;
} {
  const filas = db
    .prepare(
      `SELECT registro_id, nombre, scian, personal_est, telefono, correo, sitio_web, estado_mx, municipio_norm, fuente_id
       FROM dataset_registros WHERE fuente_id = ?`,
    )
    .all(fuente) as (EntradaPre & { registro_id: string })[];
  const upd = db.prepare(
    'UPDATE dataset_registros SET pre_score = ?, pre_descarte = ?, pre_desglose = ? WHERE fuente_id = ? AND registro_id = ?',
  );
  let descartados = 0;
  const por_nivel: Record<string, number> = { '>=75': 0, '60-74': 0, '45-59': 0, '<45': 0 };
  const LOTE = 5000;
  for (let i = 0; i < filas.length; i += LOTE) {
    db.transaction(() => {
      for (const f of filas.slice(i, i + LOTE)) {
        const s = preScore(f);
        if (s.descarte) descartados++;
        else {
          const k =
            s.score >= 75 ? '>=75' : s.score >= 60 ? '60-74' : s.score >= 45 ? '45-59' : '<45';
          por_nivel[k] = (por_nivel[k] ?? 0) + 1;
        }
        upd.run(s.score, s.descarte, JSON.stringify(s.desglose), fuente, f.registro_id);
      }
    })();
  }
  const corroborados = corroborar(db, fuente);
  return { total: filas.length, descartados, por_nivel, corroborados };
}

/**
 * Comparación entre fuentes: un registro que aparece en DENUE y en Overture (mismo nombre y código postal)
 * es más fiable; recibe +5 (tope 100) y queda anotado en su desglose. No se mezclan ni copian datos entre fuentes.
 * Se aplica solo a la fuente recién calculada (así nunca se suma dos veces).
 */
export function corroborar(db: Db, fuente: string): number {
  const otra = fuente === 'denue_local' ? 'overture_local' : 'denue_local';
  const r = db
    .prepare(
      `UPDATE dataset_registros SET
         pre_score = MIN(100, pre_score + 5),
         pre_desglose = json_set(COALESCE(pre_desglose,'{}'), '$.corroborado', 5)
       WHERE fuente_id = ? AND pre_descarte IS NULL AND pre_score IS NOT NULL AND codigo_postal IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM dataset_registros o
           WHERE o.fuente_id = ? AND o.nombre_norm = dataset_registros.nombre_norm
             AND o.codigo_postal = dataset_registros.codigo_postal)`,
    )
    .run(fuente, otra);
  return r.changes;
}
