import { buscarDataset, metaDataset } from './dataset';
import { DENUE_ATRIBUCION, DENUE_LICENCIA } from './import-denue';
import type { CtxFuente, FuenteAdapter } from './tipos';

function incluirSinTamano(ctx: CtxFuente): boolean {
  const r = ctx.db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'fuentes_incluir_sin_tamano'")
    .get() as { valor: string } | undefined;
  return r?.valor !== '0';
}

function local(
  base: Pick<FuenteAdapter, 'id' | 'nombre' | 'licencia' | 'atribucion' | 'info_url' | 'limites'>,
): FuenteAdapter {
  return {
    ...base,
    tipo: 'dataset_local',
    requiere_token: false,
    tope_defecto: null,
    metodo: base.id,
    async buscar(q, ctx) {
      if (!metaDataset(ctx.db, base.id)) return [];
      return buscarDataset(ctx.db, base.id, q, incluirSinTamano(ctx));
    },
    async probar(ctx) {
      const m = metaDataset(ctx.db, base.id);
      if (!m)
        return {
          ok: false,
          detalle: 'Todavía no hay dataset importado (ver PASOS-MANUALES-FUENTES.md).',
        };
      const n = (
        ctx.db
          .prepare('SELECT COUNT(*) AS n FROM dataset_registros WHERE fuente_id = ? LIMIT 1')
          .get(base.id) as { n: number }
      ).n;
      return {
        ok: n > 0,
        detalle: `Dataset local ${m.version}: ${n} registros (sin red, sin cuota).`,
      };
    },
  };
}

export const denueLocal = local({
  id: 'denue_local',
  nombre: 'DENUE (descarga masiva local)',
  licencia: DENUE_LICENCIA,
  atribucion: DENUE_ATRIBUCION,
  info_url: 'https://www.inegi.org.mx/app/descarga/?ti=6',
  limites: 'Consulta local: sin cuota ni tokens. Se actualiza importando el CSV nuevo de INEGI.',
});

export const overtureLocal = local({
  id: 'overture_local',
  nombre: 'Overture Maps Places (extracto local)',
  licencia: 'CDLA Permissive 2.0 / Apache 2.0 / CC0 1.0 (según el origen de cada registro)',
  atribucion: '© Overture Maps Foundation (origen indicado por registro)',
  info_url: 'https://docs.overturemaps.org/attribution/',
  limites:
    'Consulta local: sin cuota ni tokens. Se actualiza importando un extracto nuevo (GeoJSON Lines).',
});
