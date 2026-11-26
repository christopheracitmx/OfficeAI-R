import type { Db } from '../db';
import { consumirFuente, topeFuente, usoFuente } from './cuotas';
import { denueApi } from './denue-api';
import { denueLocal, overtureLocal } from './locales';
import { metaDataset, type MetaDataset } from './dataset';
import { osmOverpass } from './osm-overpass';
import type { CtxFuente, FuenteAdapter, FuenteDescartada } from './tipos';

/** Orden de consulta: primero lo local (gratis e inmediato), luego APIs con cuota. */
export const FUENTES: readonly FuenteAdapter[] = [denueLocal, overtureLocal, denueApi, osmOverpass];

export const FUENTES_DESCARTADAS: readonly FuenteDescartada[] = [
  {
    id: 'facebook_instagram',
    nombre: 'Facebook / Instagram',
    veredicto: 'NO INTEGRAR',
    motivo:
      'Las condiciones de Meta prohíben la recolección automatizada; además rige «sin redes sociales».',
    info_url: 'https://www.facebook.com/terms/',
  },
  {
    id: 'seccion_amarilla',
    nombre: 'Sección Amarilla',
    veredicto: 'NO INTEGRAR',
    motivo:
      'No hay permiso explícito para almacenar y reutilizar su base; sin permiso explícito se descarta.',
    info_url: 'https://www.seccionamarilla.com.mx/terminos-y-condiciones',
  },
  {
    id: 'yelp_fusion',
    nombre: 'Yelp Fusion',
    veredicto: 'NO INTEGRAR',
    motivo:
      'Prueba gratuita temporal; solo permite cachear 24 h; no trae el sitio web del negocio.',
    info_url: 'https://docs.developer.yelp.com/docs/fusion-intro',
  },
  {
    id: 'mapbox_search',
    nombre: 'Mapbox Search',
    veredicto: 'NO INTEGRAR',
    motivo: 'Resultados de uso temporal (no almacenables); almacenar exige contrato de pago.',
    info_url: 'https://docs.mapbox.com/api/search/search-box/',
  },
  {
    id: 'fsq_os_places',
    nombre: 'Foursquare OS Places',
    veredicto: 'NO INTEGRAR',
    motivo: 'Acceso por Places Portal + catálogo Iceberg; sus lugares ya llegan vía Overture.',
    info_url: 'https://docs.foursquare.com/data-products/docs/access-fsq-os-places',
  },
];

export const fuentePorId = (id: string): FuenteAdapter | undefined =>
  FUENTES.find((f) => f.id === id);

export function tokenConfigurado(f: FuenteAdapter, env: NodeJS.ProcessEnv): boolean | null {
  return f.requiere_token ? Boolean(env[f.env_token ?? '']?.trim()) : null;
}

/** ¿Está activa para esta oficina? Sin fila: según el valor por defecto; las APIs con token además exigen el token. */
export function fuenteActiva(
  db: Db,
  f: FuenteAdapter,
  officeId: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const r = db
    .prepare('SELECT activa FROM fuentes_config WHERE fuente_id = ? AND office_id = ?')
    .get(f.id, officeId) as { activa: number } | undefined;
  const base = r ? r.activa === 1 : activaPorDefecto(f);
  return base && (!f.requiere_token || Boolean(env[f.env_token ?? '']?.trim()));
}

/** Locales y APIs con token (quien pone el token quiere usarlas) = activas; Overpass público = opt-in del dueño. */
export const activaPorDefecto = (f: FuenteAdapter): boolean =>
  f.tipo === 'dataset_local' || f.requiere_token;

export function activarFuente(db: Db, fuente: string, officeId: string, activa: boolean): void {
  db.prepare(
    `INSERT INTO fuentes_config (fuente_id, office_id, activa) VALUES (?, ?, ?)
     ON CONFLICT(fuente_id, office_id) DO UPDATE SET activa = excluded.activa`,
  ).run(fuente, officeId, activa ? 1 : 0);
}

export function crearCtx(
  db: Db,
  env: NodeJS.ProcessEnv,
  f: FuenteAdapter,
  extra: Partial<Pick<CtxFuente, 'fetchFn' | 'esperar'>> = {},
): CtxFuente {
  const tope = topeFuente(db, f.id, f.tope_defecto);
  return { db, env, ...extra, consumir: (n = 1) => void consumirFuente(db, f.id, tope, n) };
}

export interface EstadoFuente {
  id: string;
  nombre: string;
  tipo: 'api' | 'dataset_local';
  requiere_token: boolean;
  token_configurado: boolean | null;
  activa: boolean;
  limites: string;
  licencia: string;
  atribucion: string;
  info_url: string;
  cuota: { usado: number; tope: number | null; mes: string };
  dataset: MetaDataset | null;
}

export function estadoFuentes(db: Db, officeId: string, env: NodeJS.ProcessEnv): EstadoFuente[] {
  const mes = new Date().toISOString().slice(0, 7);
  return FUENTES.map((f) => {
    const conf = db
      .prepare('SELECT activa FROM fuentes_config WHERE fuente_id = ? AND office_id = ?')
      .get(f.id, officeId) as { activa: number } | undefined;
    return {
      id: f.id,
      nombre: f.nombre,
      tipo: f.tipo,
      requiere_token: f.requiere_token,
      token_configurado: tokenConfigurado(f, env),
      activa: conf ? conf.activa === 1 : activaPorDefecto(f),
      limites: f.limites,
      licencia: f.licencia,
      atribucion: f.atribucion,
      info_url: f.info_url,
      cuota: { usado: usoFuente(db, f.id, mes), tope: topeFuente(db, f.id, f.tope_defecto), mes },
      dataset: f.tipo === 'dataset_local' ? metaDataset(db, f.id) : null,
    };
  });
}
