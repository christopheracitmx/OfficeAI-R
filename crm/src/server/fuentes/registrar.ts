import { resolverGiro } from '../services/calidad';
import type { Db } from '../db';
import { nowIso } from '../db';
import { dominioDe, enNoContactar } from '../services/empresas';
import { derivarZona, enZonaPiloto, norm } from '../services/zona';
import { nombreNorm, telefonoNorm } from './normalizar';
import { esGobierno, tamanoDePersonal } from './scian';
import type { Candidato } from './tipos';

export type MotivoRechazo =
  'gobierno' | 'no_contactar' | 'fuera_de_zona_piloto' | 'micronegocio' | 'sin_nombre';

export type ResultadoRegistro =
  | { status: 'creada' | 'fusionada' | 'existente'; id: number }
  | { status: 'rechazada'; motivo: MotivoRechazo };

export interface OpcionesRegistro {
  officeId: string;
  corridaId?: number | undefined;
  consulta?: string | undefined;
  /** Personal mínimo; los candidatos con tamaño conocido por debajo se rechazan como micronegocio. */
  minPersonal?: number | undefined;
}

export function minPersonalConfig(db: Db): number {
  const r = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'fuentes_tamano_min'")
    .get() as { valor: string } | undefined;
  const n = Number(r?.valor);
  return Number.isInteger(n) && n >= 0 ? n : 11;
}

function zonasPiloto(db: Db): string[] {
  const r = db.prepare("SELECT valor FROM configuracion WHERE clave='zonas_piloto'").get() as
    { valor: string } | undefined;
  return r ? (JSON.parse(r.valor) as string[]) : ['CDMX', 'Estado de México'];
}

interface FilaEmpresa {
  id: number;
  nombre: string;
  nombre_norm: string | null;
  municipio: string | null;
  codigo_postal: string | null;
  telefono: string | null;
  dominio: string | null;
  campos_fuente: string | null;
  direccion: string | null;
  correo: string | null;
  sitio_web: string | null;
  scian: string | null;
  personal_est: number | null;
  lat: number | null;
  tamano: string | null;
}

const COLS =
  'id, nombre, nombre_norm, municipio, codigo_postal, telefono, dominio, campos_fuente, direccion, correo, sitio_web, scian, personal_est, lat, tamano';

const primerasPalabras = (n: string): string => n.split(' ').slice(0, 2).join(' ');

/** Duplicado por registro ya traído, dominio, teléfono+nombre parecido o nombre normalizado+lugar. */
export function buscarDuplicada(db: Db, officeId: string, c: Candidato): FilaEmpresa | undefined {
  const get = (sql: string, ...p: unknown[]) =>
    db
      .prepare(
        `SELECT ${COLS} FROM empresas WHERE office_id = ? AND fusionada_con IS NULL AND ${sql} LIMIT 1`,
      )
      .get(officeId, ...p) as FilaEmpresa | undefined;
  const porRegistro = db
    .prepare(
      `SELECT e.id FROM empresa_fuentes f JOIN empresas e ON e.id = f.empresa_id
       WHERE f.office_id = ? AND f.fuente_id = ? AND f.registro_id = ? AND e.fusionada_con IS NULL LIMIT 1`,
    )
    .get(officeId, c.fuente_id, c.registro_id) as { id: number } | undefined;
  if (porRegistro) return get('id = ?', porRegistro.id);
  const dominio = dominioDe(c.sitio_web);
  if (dominio) {
    const d = get('dominio = ?', dominio);
    if (d) return d;
  }
  const nn = nombreNorm(c.nombre);
  const tel = telefonoNorm(c.telefono);
  if (tel) {
    for (const e of db
      .prepare(
        `SELECT ${COLS} FROM empresas WHERE office_id = ? AND fusionada_con IS NULL AND telefono = ? LIMIT 5`,
      )
      .all(officeId, tel) as FilaEmpresa[]) {
      const en = e.nombre_norm ?? nombreNorm(e.nombre);
      if (en === nn || primerasPalabras(en) === primerasPalabras(nn)) return e;
    }
  }
  const mismoNombre = db
    .prepare(
      `SELECT ${COLS} FROM empresas WHERE office_id = ? AND fusionada_con IS NULL
       AND (nombre_norm = ? OR (nombre_norm IS NULL AND lower(nombre) = lower(?))) LIMIT 8`,
    )
    .all(officeId, nn, c.nombre) as FilaEmpresa[];
  const muni = c.municipio ? norm(c.municipio) : null;
  return mismoNombre.find(
    (e) =>
      (!muni && !c.codigo_postal) ||
      (!e.municipio && !e.codigo_postal) ||
      (muni && e.municipio && norm(e.municipio) === muni) ||
      (c.codigo_postal && e.codigo_postal === c.codigo_postal),
  );
}

type Campos = Record<string, string | number>;

/** Datos que aporta el candidato (ya normalizados), para guardar con su fuente. */
function camposDe(c: Candidato): Campos {
  const x: Campos = {};
  if (c.telefono) x['telefono'] = c.telefono;
  if (c.correo) x['correo'] = c.correo;
  if (c.sitio_web) x['sitio_web'] = c.sitio_web;
  if (c.scian) x['scian'] = c.scian;
  if (c.tamano_est !== undefined) x['personal_est'] = c.tamano_est;
  if (c.estrato !== undefined) x['estrato'] = c.estrato;
  if (c.lat !== undefined) x['lat'] = c.lat;
  if (c.lng !== undefined) x['lng'] = c.lng;
  if (c.direccion) x['direccion'] = c.direccion;
  return x;
}

function anotarFuente(db: Db, officeId: string, empresaId: number, c: Candidato): void {
  db.prepare(
    `INSERT OR IGNORE INTO empresa_fuentes (office_id, empresa_id, fuente_id, registro_id, url, licencia, atribucion, campos_json, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    officeId,
    empresaId,
    c.fuente_id,
    c.registro_id,
    c.fuente_url ?? null,
    c.licencia,
    c.atribucion,
    JSON.stringify({ nombre: c.nombre, ...camposDe(c) }),
    nowIso(),
  );
}

/** Rellena SOLO lo que falta (nunca pisa un dato existente) y registra de qué fuente salió cada campo. */
function fusionar(db: Db, e: FilaEmpresa, c: Candidato): void {
  const previo = e.campos_fuente ? (JSON.parse(e.campos_fuente) as Record<string, string>) : {};
  const nuevos: Record<string, string | number | null> = {};
  const cand = camposDe(c);
  const vacios: [keyof FilaEmpresa, string][] = [
    ['telefono', 'telefono'],
    ['correo', 'correo'],
    ['sitio_web', 'sitio_web'],
    ['scian', 'scian'],
    ['personal_est', 'personal_est'],
    ['lat', 'lat'],
    ['direccion', 'direccion'],
  ];
  for (const [col, k] of vacios)
    if ((e[col] === null || e[col] === '') && cand[k] !== undefined) nuevos[col] = cand[k]!;
  if (cand['lng'] !== undefined && e.lat === null) nuevos['lng'] = cand['lng']!;
  if (cand['estrato'] !== undefined && e.personal_est === null)
    nuevos['estrato'] = cand['estrato']!;
  if (nuevos['sitio_web']) nuevos['dominio'] = dominioDe(String(nuevos['sitio_web']));
  if (nuevos['personal_est'] !== undefined && !e.tamano)
    nuevos['tamano'] = tamanoDePersonal(Number(nuevos['personal_est']));
  if (!e.nombre_norm) nuevos['nombre_norm'] = nombreNorm(e.nombre);
  const cols = Object.keys(nuevos);
  if (cols.length === 0) return;
  for (const k of cols) if (k !== 'nombre_norm' && k !== 'dominio') previo[k] = c.fuente_id;
  db.prepare(
    `UPDATE empresas SET ${cols.map((k) => `${k} = @${k}`).join(', ')}, campos_fuente = @cf, actualizado_en = @ahora WHERE id = @id`,
  ).run({ ...nuevos, cf: JSON.stringify(previo), ahora: nowIso(), id: e.id });
}

/** Filtros + dedupe + (crea | fusiona). Todo por código: ninguna IA interviene. */
export function registrarCandidato(db: Db, c: Candidato, o: OpcionesRegistro): ResultadoRegistro {
  const nombre = c.nombre.trim();
  if (nombre.length < 2) return { status: 'rechazada', motivo: 'sin_nombre' };
  if (esGobierno(nombre, c.scian)) return { status: 'rechazada', motivo: 'gobierno' };
  const dominio = dominioDe(c.sitio_web);
  if (enNoContactar(db, nombre, dominio)) return { status: 'rechazada', motivo: 'no_contactar' };
  const zona = derivarZona(c.direccion);
  const estado = (c.estado_mx as typeof zona.estado_mx) ?? zona.estado_mx;
  // Sin dirección ni estado (hallazgo de un agente) no se puede juzgar la zona: se admite, como en crm_upsert_empresa.
  if ((c.direccion || c.estado_mx) && !enZonaPiloto(estado, zonasPiloto(db)))
    return { status: 'rechazada', motivo: 'fuera_de_zona_piloto' };
  const min = o.minPersonal ?? minPersonalConfig(db);
  if (c.tamano_est !== undefined && c.tamano_est < min)
    return { status: 'rechazada', motivo: 'micronegocio' };

  const previa = buscarDuplicada(db, o.officeId, c);
  if (previa) {
    const eraDeEstaFuente = db
      .prepare(
        'SELECT 1 FROM empresa_fuentes WHERE empresa_id = ? AND fuente_id = ? AND registro_id = ?',
      )
      .get(previa.id, c.fuente_id, c.registro_id);
    db.transaction(() => {
      fusionar(db, previa, c);
      anotarFuente(db, o.officeId, previa.id, c);
    })();
    return { status: eraDeEstaFuente ? 'existente' : 'fusionada', id: previa.id };
  }

  const giroId = resolverGiro(db, c.giro, false);
  const cf: Record<string, string> = {};
  for (const k of Object.keys(camposDe(c))) cf[k] = c.fuente_id;
  const ahora = nowIso();
  let id = 0;
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO empresas (nombre, nombre_norm, metodo_descubrimiento, origen_url, origen_nota, etapa, giro_id,
           direccion, municipio, codigo_postal, ciudad, estado_mx, zona, sitio_web, dominio, tamano, corrida_id,
           creado_en, actualizado_en, office_id, fuente_id, scian, estrato, personal_est, telefono, correo, lat, lng, campos_fuente)
         VALUES (?, ?, ?, ?, ?, 'descubierta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nombre,
        nombreNorm(nombre),
        c.fuente_id,
        c.fuente_url ?? null,
        `${c.fuente_id}${o.consulta ? `: ${o.consulta}` : ''}`.slice(0, 500),
        giroId,
        c.direccion || null,
        zona.municipio ?? c.municipio ?? null,
        zona.codigo_postal ?? c.codigo_postal ?? null,
        zona.ciudad,
        estado,
        zona.zona ?? (estado === 'CDMX' ? 'CDMX' : 'Edomex'),
        c.sitio_web ?? null,
        dominio,
        tamanoDePersonal(c.tamano_est),
        o.corridaId ?? null,
        ahora,
        ahora,
        o.officeId,
        c.fuente_id,
        c.scian ?? null,
        c.estrato ?? null,
        c.tamano_est ?? null,
        c.telefono ?? null,
        c.correo ?? null,
        c.lat ?? null,
        c.lng ?? null,
        JSON.stringify(cf),
      );
    id = Number(r.lastInsertRowid);
    anotarFuente(db, o.officeId, id, c);
  })();
  return { status: 'creada', id };
}
