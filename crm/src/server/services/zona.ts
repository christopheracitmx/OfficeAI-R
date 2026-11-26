// Deriva estado, municipio, CP y zona desde la dirección (por código, sin IA ni Places extra).

export interface ZonaInfo {
  estado_mx: 'CDMX' | 'Estado de México' | null;
  municipio: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  zona: string | null;
}

export const CDMX_ZONAS: Record<string, string[]> = {
  'CDMX Norte': ['Azcapotzalco', 'Gustavo A. Madero'],
  'CDMX Centro': ['Cuauhtémoc', 'Miguel Hidalgo', 'Benito Juárez', 'Venustiano Carranza'],
  'CDMX Poniente': ['Álvaro Obregón', 'Cuajimalpa de Morelos', 'La Magdalena Contreras'],
  'CDMX Sur': ['Coyoacán', 'Tlalpan', 'Xochimilco', 'Milpa Alta'],
  'CDMX Oriente': ['Iztapalapa', 'Iztacalco', 'Tláhuac'],
};

/** [canónico, ...alias]. Los alias más largos se prueban primero. */
const EDOMEX: string[][] = [
  ['Naucalpan de Juárez', 'Naucalpan'],
  ['Tlalnepantla de Baz', 'Tlalnepantla'],
  ['Ecatepec de Morelos', 'Ecatepec'],
  ['Nezahualcóyotl', 'Neza'],
  ['Toluca', 'Toluca de Lerdo'],
  ['Huixquilucan'],
  ['Atizapán de Zaragoza', 'Atizapán'],
  ['Cuautitlán Izcalli'],
  ['Cuautitlán'],
  ['Tultitlán'],
  ['Coacalco de Berriozábal', 'Coacalco'],
  ['Tecámac'],
  ['Texcoco'],
  ['Chalco'],
  ['Ixtapaluca'],
  ['La Paz', 'Los Reyes La Paz'],
  ['Lerma'],
  ['Metepec'],
  ['Zinacantepec'],
  ['Tepotzotlán'],
  ['Nicolás Romero'],
  ['Huehuetoca'],
  ['Zumpango'],
  ['Chimalhuacán'],
  ['Chicoloapan'],
  ['Valle de Chalco Solidaridad', 'Valle de Chalco'],
  ['Tultepec'],
  ['Teoloyucan'],
  ['Melchor Ocampo'],
  ['Acolman'],
  ['Teotihuacán'],
  ['Ocoyoacac'],
  ['Xonacatlán'],
  ['Santiago Tianguistenco', 'Tianguistenco'],
  ['Almoloya de Juárez'],
  ['San Mateo Atenco'],
  ['Jaltenco'],
  ['Nextlalpan'],
  ['Amecameca'],
  ['Tlalmanalco'],
  ['Otumba'],
  ['Apaxco'],
  ['Atenco'],
  ['Capulhuac'],
];

export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function buscaToken(texto: string, token: string): boolean {
  const re = new RegExp(
    `(^|[^a-z0-9])${norm(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
  );
  return re.test(texto);
}

const EDOMEX_ALIAS = EDOMEX.flatMap(([canon, ...alias]) =>
  [canon as string, ...alias].map((a) => ({ alias: a, canon: canon as string })),
).sort((a, b) => b.alias.length - a.alias.length);

const CDMX_ALCALDIAS = Object.entries(CDMX_ZONAS).flatMap(([zona, lista]) =>
  lista.map((alc) => ({ alc, zona })),
);

export function derivarZona(direccion: string | null | undefined): ZonaInfo {
  const vacio: ZonaInfo = {
    estado_mx: null,
    municipio: null,
    codigo_postal: null,
    ciudad: null,
    zona: null,
  };
  if (!direccion) return vacio;
  const t = norm(direccion);
  const cp = /\b(\d{5})\b/.exec(direccion)?.[1] ?? null;
  const cpNum = cp ? Number(cp) : null;

  const esCdmx =
    /\b(cdmx|ciudad de mexico|c\.?d\.?m\.?x\.?|d\.?f\.?)\b/.test(t) ||
    (cpNum !== null && cpNum >= 1000 && cpNum <= 16999);
  const esEdomex =
    /(estado de mexico|edo\.? ?de? ?mex|edomex|\bmex\.?\b(?!ico))/.test(t) ||
    (cpNum !== null && cpNum >= 50000 && cpNum <= 57999);

  if (esCdmx) {
    const hit = CDMX_ALCALDIAS.find((x) => buscaToken(t, x.alc));
    return {
      estado_mx: 'CDMX',
      municipio: hit?.alc ?? null,
      codigo_postal: cp,
      ciudad: 'Ciudad de México',
      zona: hit?.zona ?? 'CDMX',
    };
  }
  if (esEdomex) {
    const hit = EDOMEX_ALIAS.find((x) => buscaToken(t, x.alias));
    return {
      estado_mx: 'Estado de México',
      municipio: hit?.canon ?? null,
      codigo_postal: cp,
      ciudad: hit?.canon ?? null,
      zona: hit ? `Edomex - ${hit.canon}` : 'Edomex',
    };
  }
  return { ...vacio, codigo_postal: cp };
}

/** ¿La zona pedida pertenece a las zonas piloto activas? */
export function enZonaPiloto(estado: ZonaInfo['estado_mx'], zonasPiloto: string[]): boolean {
  return estado !== null && zonasPiloto.includes(estado);
}
