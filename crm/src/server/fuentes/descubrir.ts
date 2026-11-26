import type { Db } from '../db';
import { nowIso } from '../db';
import { FuenteQuotaError, type BusquedaFuente } from './tipos';
import { crearCtx, fuenteActiva, fuentePorId, FUENTES } from './registro';
import { minPersonalConfig, registrarCandidato, type MotivoRechazo } from './registrar';

export interface ResultadoFuente {
  fuente_id: string;
  estado: 'ok' | 'sin_datos' | 'quota_exceeded' | 'error' | 'omitida';
  encontrados: number;
  nuevos: number;
  fusionados: number;
  existentes: number;
  rechazados: Partial<Record<MotivoRechazo, number>>;
  detalle?: string | undefined;
  /** Empresas creadas (para que el agente o la UI las vea). */
  empresas: { empresa_id: number; nombre: string; zona: string | null }[];
}

export interface OpcionesDescubrir {
  db: Db;
  env: NodeJS.ProcessEnv;
  officeId: string;
  corridaId?: number | undefined;
  zona: string;
  giro: string;
  texto?: string | undefined;
  /** Cuántas empresas NUEVAS se necesitan en total. */
  max: number;
  /** Solo estas fuentes (ids). Sin esto: todas las activas, en orden. */
  fuentes?: string[] | undefined;
  fetchFn?: typeof fetch | undefined;
  esperar?: ((ms: number) => Promise<void>) | undefined;
}

export interface ResumenDescubrir {
  nuevos: number;
  fuentes: ResultadoFuente[];
  /** true si alguna fuente con cuota quedó agotada. */
  cuota_agotada: boolean;
}

const vacio = (
  id: string,
  estado: ResultadoFuente['estado'],
  detalle?: string,
): ResultadoFuente => ({
  fuente_id: id,
  estado,
  encontrados: 0,
  nuevos: 0,
  fusionados: 0,
  existentes: 0,
  rechazados: {},
  detalle,
  empresas: [],
});

function bitacora(db: Db, o: OpcionesDescubrir, r: ResultadoFuente, consulta: string): void {
  const rechazados = Object.values(r.rechazados).reduce((a, b) => a + (b ?? 0), 0);
  db.prepare(
    `INSERT INTO candidatos_fuente (office_id, corrida_id, fuente_id, consulta, encontrados, nuevos, fusionados, rechazados, estado, detalle, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    o.officeId,
    o.corridaId ?? null,
    r.fuente_id,
    consulta,
    r.encontrados,
    r.nuevos,
    r.fusionados,
    rechazados,
    r.estado,
    r.detalle?.slice(0, 300) ?? null,
    nowIso(),
  );
}

/**
 * Descubrimiento por código: recorre las fuentes activas en orden hasta reunir `max` empresas nuevas.
 * Si una falla (red, token, formato) o agota su cuota, registra el motivo y sigue con la siguiente.
 */
export async function descubrirPorFuentes(o: OpcionesDescubrir): Promise<ResumenDescubrir> {
  const { db } = o;
  const consulta = `${o.zona} · ${o.giro}${o.texto ? ` · ${o.texto}` : ''}`;
  const q: BusquedaFuente = {
    zona: o.zona,
    giro: o.giro,
    texto: o.texto,
    max: o.max,
    min_personal: minPersonalConfig(db),
    office_id: o.officeId,
  };
  const lista = (o.fuentes ?? FUENTES.map((f) => f.id))
    .map((id) => fuentePorId(id))
    .filter((f) => f !== undefined);
  const resumen: ResumenDescubrir = { nuevos: 0, fuentes: [], cuota_agotada: false };
  for (const f of lista) {
    if (resumen.nuevos >= o.max) break;
    if (!fuenteActiva(db, f, o.officeId, o.env)) {
      const r = vacio(
        f.id,
        'omitida',
        f.requiere_token && !o.env[f.env_token ?? ''] ? 'Sin token' : 'Desactivada',
      );
      resumen.fuentes.push(r);
      continue;
    }
    const r = vacio(f.id, 'ok');
    try {
      const ctx = crearCtx(db, o.env, f, { fetchFn: o.fetchFn, esperar: o.esperar });
      const candidatos = await f.buscar({ ...q, max: o.max - resumen.nuevos }, ctx);
      r.encontrados = candidatos.length;
      for (const c of candidatos) {
        if (resumen.nuevos >= o.max) break;
        const x = registrarCandidato(db, c, {
          officeId: o.officeId,
          corridaId: o.corridaId,
          consulta,
          minPersonal: q.min_personal,
        });
        if (x.status === 'creada') {
          r.nuevos++;
          resumen.nuevos++;
          const e = db.prepare('SELECT nombre, zona FROM empresas WHERE id = ?').get(x.id) as {
            nombre: string;
            zona: string | null;
          };
          r.empresas.push({ empresa_id: x.id, nombre: e.nombre, zona: e.zona });
        } else if (x.status === 'fusionada') r.fusionados++;
        else if (x.status === 'existente') r.existentes++;
        else if (x.status === 'rechazada')
          r.rechazados[x.motivo] = (r.rechazados[x.motivo] ?? 0) + 1;
      }
      if (r.encontrados === 0) {
        r.estado = 'sin_datos';
        r.detalle = 'La fuente no devolvió candidatos para esta consulta';
      }
    } catch (e) {
      if (e instanceof FuenteQuotaError) {
        r.estado = 'quota_exceeded';
        r.detalle = e.message;
        resumen.cuota_agotada = true;
      } else {
        r.estado = 'error';
        r.detalle = e instanceof Error ? e.message : String(e);
      }
    }
    bitacora(db, o, r, consulta);
    resumen.fuentes.push(r);
  }
  return resumen;
}
