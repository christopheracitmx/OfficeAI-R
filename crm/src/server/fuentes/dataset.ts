import type { Db } from '../db';
import { norm } from '../services/zona';
import { scianDeGiro } from './scian';
import type { BusquedaFuente, Candidato } from './tipos';
import { resolverZona } from './zona-filtro';

export interface RegistroDataset {
  fuente_id: string;
  registro_id: string;
  nombre: string;
  nombre_norm: string;
  scian: string | null;
  categoria: string | null;
  giro: string;
  estrato: number | null;
  personal_est: number | null;
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  municipio_norm: string | null;
  estado_mx: string | null;
  telefono: string | null;
  correo: string | null;
  sitio_web: string | null;
  lat: number | null;
  lng: number | null;
  licencia: string;
  atribucion: string;
  url: string | null;
}

export interface MetaDataset {
  fuente_id: string;
  version: string;
  fecha_dataset: string | null;
  importado_en: string;
  registros: number;
  descartados: number;
  archivo: string | null;
  nota: string | null;
}

export const metaDataset = (db: Db, fuente: string): MetaDataset | null =>
  (db.prepare('SELECT * FROM dataset_meta WHERE fuente_id = ?').get(fuente) as
    MetaDataset | undefined) ?? null;

const COLUMNAS: (keyof RegistroDataset)[] = [
  'fuente_id',
  'registro_id',
  'nombre',
  'nombre_norm',
  'scian',
  'categoria',
  'giro',
  'estrato',
  'personal_est',
  'direccion',
  'codigo_postal',
  'municipio',
  'municipio_norm',
  'estado_mx',
  'telefono',
  'correo',
  'sitio_web',
  'lat',
  'lng',
  'licencia',
  'atribucion',
  'url',
];

export type MetaImportacion = Omit<MetaDataset, 'fuente_id' | 'importado_en' | 'registros'>;

/** Inserción en una sola transacción; reemplaza lo anterior de esa fuente si `reemplazar`. */
export function guardarDataset(
  db: Db,
  fuente: string,
  filas: Iterable<RegistroDataset>,
  meta: MetaImportacion,
  reemplazar: boolean,
): number {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO dataset_registros (${COLUMNAS.join(',')}) VALUES (${COLUMNAS.map((c) => '@' + c).join(',')})`,
  );
  let n = 0;
  db.transaction(() => {
    if (reemplazar) db.prepare('DELETE FROM dataset_registros WHERE fuente_id = ?').run(fuente);
    for (const f of filas) {
      ins.run(f);
      n++;
    }
    const total = (
      db.prepare('SELECT COUNT(*) AS n FROM dataset_registros WHERE fuente_id = ?').get(fuente) as {
        n: number;
      }
    ).n;
    db.prepare(
      `INSERT OR REPLACE INTO dataset_meta (fuente_id, version, fecha_dataset, importado_en, registros, descartados, archivo, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      fuente,
      meta.version,
      meta.fecha_dataset,
      new Date().toISOString(),
      total,
      meta.descartados,
      meta.archivo,
      meta.nota,
    );
  })();
  return n;
}

function aCandidato(r: RegistroDataset): Candidato {
  return {
    nombre: r.nombre,
    direccion: r.direccion ?? '',
    municipio: r.municipio ?? undefined,
    codigo_postal: r.codigo_postal ?? undefined,
    estado_mx: r.estado_mx ?? undefined,
    telefono: r.telefono ?? undefined,
    correo: r.correo ?? undefined,
    sitio_web: r.sitio_web ?? undefined,
    giro: r.giro,
    scian: r.scian ?? undefined,
    tamano_est: r.personal_est ?? undefined,
    estrato: r.estrato ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    fuente_id: r.fuente_id,
    registro_id: r.registro_id,
    fuente_url: r.url ?? undefined,
    licencia: r.licencia,
    atribucion: r.atribucion,
  };
}

/** Consulta local: sin red ni cuota. Salta lo que ese piso ya trajo de esta fuente; lo de mayor tamaño primero. */
export function buscarDataset(
  db: Db,
  fuente: string,
  q: BusquedaFuente,
  incluirSinTamano = true,
): Candidato[] {
  const z = resolverZona(q.zona);
  const where: string[] = [
    'd.fuente_id = ?',
    `d.estado_mx IN (${z.estados.map(() => '?').join(',')})`,
  ];
  const p: unknown[] = [fuente, ...z.estados];
  if (z.municipios.length > 0) {
    where.push(`d.municipio_norm IN (${z.municipios.map(() => '?').join(',')})`);
    p.push(...z.municipios.map(norm));
  }
  const todos = !q.giro || /^cualquiera$/i.test(q.giro);
  const prefijos = q.scian?.length ? q.scian : fuente === 'denue_local' ? scianDeGiro(q.giro) : [];
  if (prefijos.length > 0) {
    where.push(`(${prefijos.map(() => 'd.scian LIKE ?').join(' OR ')})`);
    p.push(...prefijos.map((x) => `${x}%`));
  } else if (!todos) {
    where.push('d.giro = ?');
    p.push(q.giro);
  }
  if (q.texto) {
    where.push('d.nombre_norm LIKE ?');
    p.push(`%${norm(q.texto)}%`);
  }
  if (q.min_personal !== undefined && q.min_personal > 0) {
    where.push(`(d.personal_est >= ?${incluirSinTamano ? ' OR d.personal_est IS NULL' : ''})`);
    p.push(q.min_personal);
  }
  where.push(
    'NOT EXISTS (SELECT 1 FROM empresa_fuentes ef WHERE ef.fuente_id = d.fuente_id AND ef.registro_id = d.registro_id AND ef.office_id = ?)',
  );
  p.push(q.office_id ?? 'prospeccion');
  const limite = Math.min(Math.max(q.max * 3, 10), 300);
  const filas = db
    .prepare(
      `SELECT d.* FROM dataset_registros d WHERE ${where.join(' AND ')}
       ORDER BY (d.personal_est IS NULL), d.personal_est DESC, d.registro_id LIMIT ?`,
    )
    .all(...p, limite) as RegistroDataset[];
  return filas.map(aCandidato);
}
