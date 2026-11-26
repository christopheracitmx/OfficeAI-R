import type { Db } from '../db';
import { nowIso } from '../db';
import { giroDeScian } from '../fuentes/scian';
import { norm } from './zona';

/**
 * Calidad por CÓDIGO (sin IA): giro obligatorio, contraste con las fuentes de datos y compuertas que
 * el servidor aplica a los agentes de QA. Evita llenar la base (y los correos) de prospectos pobres.
 */

export const SCORE_MIN_CORREO_DEFECTO = 60;
export const SCORE_META_A = 80;

export function scoreMinimoCorreo(db: Db): number {
  const v = (
    db.prepare("SELECT valor FROM configuracion WHERE clave = 'correo_score_min'").get() as
      { valor: string } | undefined
  )?.valor;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : SCORE_MIN_CORREO_DEFECTO;
}

// ---------------------------------------------------------------- GIRO

const SINONIMOS: [RegExp, string][] = [
  [
    /manufactur|fabric|industri|planta|maquila|autopart|quimic|plastic|metal|empaque/,
    'Manufactura',
  ],
  [/logist|transport|paqueter|almacen|carga|flete|distribuc/, 'Logística y transporte'],
  [/escuela|universidad|educaci|colegio|instituto|academia/, 'Educación privada'],
  [/salud|hospital|clinica|laboratorio|medic|farmac/, 'Salud privada'],
  [/financ|banc|seguro|afore|credito|fintech|casa de bolsa/, 'Financiero y seguros'],
  [
    /tecnolog|software|telecom|sistemas|datos|cloud|ti\b|informatic/,
    'Tecnología y telecomunicaciones',
  ],
  [/retail|comercio|tienda|supermercado|departamental|mayorista|abarrot/, 'Retail y comercio'],
  [/hotel|turism|hosped|resort/, 'Hotelería y turismo'],
  [/agro|agricol|ganader|pecuari/, 'Agroindustria'],
  [/construc|inmobili|desarroll|vivienda|bienes raices/, 'Construcción e inmobiliaria'],
  [/aliment|bebida|restaurant|comida|lacteo|panific/, 'Alimentos y bebidas'],
  [
    /corporativ|consultor|despacho|asesor|servicios profesionales|asociacion|camara/,
    'Corporativo y servicios profesionales',
  ],
];

const titulo = (s: string): string =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Devuelve el id del giro de la taxonomía para un texto libre: coincidencia exacta (sin acentos/mayúsculas),
 * luego por palabras clave. Si `crear` y no hay ninguna, agrega el giro nuevo (3-60 caracteres) a la taxonomía.
 */
export function resolverGiro(
  db: Db,
  texto: string | null | undefined,
  crear = false,
): number | null {
  const t = (texto ?? '').trim();
  if (t.length < 3) return null;
  const todos = db.prepare('SELECT id, nombre FROM taxonomia_giros').all() as {
    id: number;
    nombre: string;
  }[];
  const n = norm(t);
  const exacto = todos.find((g) => norm(g.nombre) === n);
  if (exacto) return exacto.id;
  for (const [re, nombre] of SINONIMOS)
    if (re.test(n)) {
      const g = todos.find((x) => x.nombre === nombre);
      if (g) return g.id;
    }
  if (!crear || t.length > 60 || /[<>{}]/.test(t)) return null;
  const r = db.prepare('INSERT INTO taxonomia_giros (nombre) VALUES (?)').run(titulo(t));
  return Number(r.lastInsertRowid);
}

export function giroEsInformativo(db: Db, giroId: number | null): boolean {
  if (giroId === null) return false;
  const g = db.prepare('SELECT nombre FROM taxonomia_giros WHERE id = ?').get(giroId) as
    { nombre: string } | undefined;
  return !!g && norm(g.nombre) !== 'otro';
}

// ---------------------------------------------------------------- CONTRASTE CON FUENTES

export interface CoincidenciaFuente {
  fuente_id: string;
  nombre: string;
  municipio: string | null;
  scian: string | null;
  giro: string;
  personal_est: number | null;
  telefono: string | null;
  correo: string | null;
  sitio_web: string | null;
  pre_score: number | null;
  coincide: { nombre: boolean; telefono: boolean; web: boolean; municipio: boolean };
}

const soloDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');
const dominioDe = (u: string | null | undefined): string =>
  (u ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0] ?? '';

/** Busca la empresa en los datasets locales (DENUE, Overture) para contrastar giro, tamaño y contactos. */
export function contrastarConFuentes(db: Db, empresaId: number): CoincidenciaFuente[] {
  const e = db
    .prepare(
      'SELECT nombre, nombre_norm, municipio, sitio_web, dominio, telefono FROM empresas WHERE id = ?',
    )
    .get(empresaId) as
    | {
        nombre: string;
        nombre_norm: string | null;
        municipio: string | null;
        sitio_web: string | null;
        dominio: string | null;
        telefono: string | null;
      }
    | undefined;
  if (!e) return [];
  const contactos = db
    .prepare("SELECT valor FROM contactos WHERE empresa_id = ? AND tipo = 'telefono'")
    .all(empresaId) as { valor: string }[];
  const tels = new Set(
    [e.telefono, ...contactos.map((c) => c.valor)]
      .map((t) => soloDigitos(t).slice(-10))
      .filter((t) => t.length >= 8),
  );
  const dom = e.dominio ?? dominioDe(e.sitio_web);
  const hallados = new Map<string, Record<string, unknown>>();
  const agregar = (filas: Record<string, unknown>[]): void => {
    for (const f of filas) hallados.set(`${f['fuente_id']}:${f['registro_id']}`, f);
  };
  const cols =
    'fuente_id, registro_id, nombre, nombre_norm, municipio, municipio_norm, scian, giro, personal_est, telefono, correo, sitio_web, pre_score';
  if (e.nombre_norm)
    agregar(
      db
        .prepare(`SELECT ${cols} FROM dataset_registros WHERE nombre_norm = ? LIMIT 5`)
        .all(e.nombre_norm) as Record<string, unknown>[],
    );
  if (dom && dom.length > 4)
    agregar(
      db
        .prepare(`SELECT ${cols} FROM dataset_registros WHERE sitio_web LIKE ? LIMIT 5`)
        .all(`%${dom}%`) as Record<string, unknown>[],
    );
  const out: CoincidenciaFuente[] = [];
  for (const f of hallados.values()) {
    const tel = soloDigitos(f['telefono'] as string | null).slice(-10);
    out.push({
      fuente_id: String(f['fuente_id']),
      nombre: String(f['nombre']),
      municipio: (f['municipio'] as string | null) ?? null,
      scian: (f['scian'] as string | null) ?? null,
      giro: String(f['giro']),
      personal_est: (f['personal_est'] as number | null) ?? null,
      telefono: (f['telefono'] as string | null) ?? null,
      correo: (f['correo'] as string | null) ?? null,
      sitio_web: (f['sitio_web'] as string | null) ?? null,
      pre_score: (f['pre_score'] as number | null) ?? null,
      coincide: {
        nombre: f['nombre_norm'] === e.nombre_norm,
        telefono: tel.length >= 8 && tels.has(tel),
        web: !!dom && dominioDe(f['sitio_web'] as string | null).endsWith(dom),
        municipio: !!e.municipio && f['municipio_norm'] === norm(e.municipio),
      },
    });
  }
  return out;
}

/** Completa el giro por código si falta: SCIAN de la empresa o de su registro en los datasets. */
export function completarGiroPorCodigo(db: Db, empresaId: number): boolean {
  const e = db.prepare('SELECT giro_id, scian FROM empresas WHERE id = ?').get(empresaId) as
    { giro_id: number | null; scian: string | null } | undefined;
  if (!e || giroEsInformativo(db, e.giro_id)) return false;
  let nombre: string | null = e.scian ? giroDeScian(e.scian) : null;
  if (!nombre || nombre === 'Otro') {
    const m = contrastarConFuentes(db, empresaId).find((c) => c.coincide.nombre || c.coincide.web);
    nombre = m ? (m.scian ? giroDeScian(m.scian) : m.giro) : null;
  }
  if (!nombre || norm(nombre) === 'otro') return false;
  const id = resolverGiro(db, nombre, false);
  if (id === null) return false;
  db.prepare('UPDATE empresas SET giro_id = ?, actualizado_en = ? WHERE id = ?').run(
    id,
    nowIso(),
    empresaId,
  );
  return true;
}

/** Relleno único de giros para empresas ya existentes (idempotente): SCIAN/datasets y, si no, palabras clave del texto. */
export function rellenarGiros(db: Db): void {
  const filas = db
    .prepare(
      `SELECT id, nombre, resumen, origen_nota FROM empresas WHERE giro_id IS NULL AND fusionada_con IS NULL`,
    )
    .all() as { id: number; nombre: string; resumen: string | null; origen_nota: string | null }[];
  for (const f of filas) {
    if (completarGiroPorCodigo(db, f.id)) continue;
    const id = resolverGiro(db, `${f.nombre} ${f.resumen ?? ''} ${f.origen_nota ?? ''}`, false);
    if (id !== null) db.prepare('UPDATE empresas SET giro_id = ? WHERE id = ?').run(id, f.id);
  }
}

// ---------------------------------------------------------------- COMPUERTAS DE QA

/**
 * Lo que el servidor exige ANTES de aceptar una aprobación de QA. Lista vacía = pasa. Los QA de IA
 * siguen revisando la veracidad; esto garantiza que nunca se apruebe un expediente incompleto.
 */
export function bloqueosDeCalidad(db: Db, prospectoId: number, etapa: 'qa1' | 'qa2'): string[] {
  const p = db
    .prepare('SELECT id, empresa_id, score, reporte_md FROM prospectos WHERE id = ?')
    .get(prospectoId) as
    { id: number; empresa_id: number; score: number | null; reporte_md: string | null } | undefined;
  if (!p) return ['Prospecto no encontrado'];
  completarGiroPorCodigo(db, p.empresa_id);
  const e = db
    .prepare(
      `SELECT giro_id, estado_mx, tamano, resumen, sitio_web, sitio_verificado FROM empresas WHERE id = ?`,
    )
    .get(p.empresa_id) as {
    giro_id: number | null;
    estado_mx: string | null;
    tamano: string | null;
    resumen: string | null;
    sitio_web: string | null;
    sitio_verificado: number | null;
  };
  const r: string[] = [];
  if (!giroEsInformativo(db, e.giro_id))
    r.push(
      'Falta el GIRO de la empresa (o es «Otro»): guárdalo con crm_guardar_ficha (giro); si ninguno de la lista encaja, escribe uno nuevo y específico y el sistema lo agrega',
    );
  if (!e.estado_mx)
    r.push('Falta ubicar la empresa en CDMX o Estado de México (dirección/municipio)');
  if (!e.tamano) r.push('Falta el tamaño estimado de la empresa');
  if (!e.resumen) r.push('Falta el resumen de la ficha');
  const nec = (
    db.prepare('SELECT COUNT(*) AS n FROM necesidades WHERE empresa_id = ?').get(p.empresa_id) as {
      n: number;
    }
  ).n;
  if (nec === 0) r.push('La ficha no tiene necesidades tecnológicas');
  const c = db
    .prepare(
      "SELECT tipo FROM contactos WHERE empresa_id = ? AND fuente_url IS NOT NULL AND fuente_url != ''",
    )
    .all(p.empresa_id) as { tipo: string }[];
  const tel = c.some((x) => x.tipo === 'telefono');
  const cor = c.some((x) => x.tipo === 'correo');
  if (!tel && !cor) r.push('No hay teléfono ni correo de contacto con fuente');
  if (e.sitio_web ? e.sitio_verificado !== 1 : !(tel && cor))
    r.push(
      e.sitio_web
        ? 'El sitio web no está verificado como el oficial de la empresa'
        : 'Sin sitio web verificado: se exige teléfono Y correo con fuente',
    );
  const paq = (
    db.prepare('SELECT COUNT(*) AS n FROM paquetes WHERE prospecto_id = ?').get(p.id) as {
      n: number;
    }
  ).n;
  if (paq === 0) r.push('No hay paquetes sugeridos');
  if (etapa === 'qa2') {
    const min = scoreMinimoCorreo(db);
    if (p.score === null) r.push('Falta el score');
    else if (p.score < min)
      r.push(
        `Score ${p.score} por debajo del mínimo (${min}): NO se aprueba; recházalo y descarta el prospecto`,
      );
    if (!p.reporte_md) r.push('Falta el reporte');
  }
  return r;
}
