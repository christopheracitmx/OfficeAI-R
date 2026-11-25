import type { Db } from '../db';
import { getConfig } from '../services/admin';

/** Estado de una ventana del plan tal como lo informa el CLI (`rate_limit_event`). */
export interface VentanaPlan {
  /** 0..1 si el CLI lo informa. */
  utilizacion: number | null;
  /** Epoch en segundos en que se reinicia la ventana. */
  reinicia_en: number | null;
  estado: string;
}

export interface InfoPlan {
  ventanas: Record<string, VentanaPlan>;
  /** Estado global del evento (allowed | allowed_warning | rejected). */
  estado: string;
}

export const VENTANAS = ['five_hour', 'seven_day'] as const;
/** Referencia medida en P6 (tokens ponderados por elemento) cuando aún no hay historial. */
export const TOKENS_ITEM_REFERENCIA = 95_000;

export function guardarLimites(db: Db, info: InfoPlan, modelo?: string): void {
  const up = db.prepare(
    `INSERT INTO limites_plan (ventana, utilizacion, reinicia_en, estado, modelo, actualizado_en) VALUES (?,?,?,?,?,?)
     ON CONFLICT(ventana) DO UPDATE SET utilizacion=excluded.utilizacion, reinicia_en=excluded.reinicia_en,
       estado=excluded.estado, modelo=excluded.modelo, actualizado_en=excluded.actualizado_en`,
  );
  const ahora = new Date().toISOString();
  for (const [v, w] of Object.entries(info.ventanas))
    up.run(v, w.utilizacion, w.reinicia_en, w.estado, modelo ?? null, ahora);
}

interface FilaLimite extends VentanaPlan {
  ventana: string;
  modelo: string | null;
  actualizado_en: string;
}

export function leerLimites(db: Db): FilaLimite[] {
  return db
    .prepare(
      'SELECT ventana, utilizacion, reinicia_en, estado, modelo, actualizado_en FROM limites_plan',
    )
    .all() as FilaLimite[];
}

/** Tokens ponderados de las llamadas del runner en las últimas 5 horas (solo lo que lanza esta app). */
export function tokens5h(db: Db, ahoraMs = Date.now()): number {
  const desde = new Date(ahoraMs - 5 * 3600_000).toISOString();
  return (
    db
      .prepare(
        "SELECT COALESCE(SUM(tokens_estimados),0) AS t FROM salidas_agente WHERE tipo='paso' AND creado_en >= ?",
      )
      .get(desde) as { t: number }
  ).t;
}

export interface EstadoPlan {
  /** cli = el CLI informa el porcentaje; estimado = calculado con tokens y presupuesto; sin_datos. */
  modo: 'cli' | 'estimado' | 'sin_datos';
  ventanas: Record<
    string,
    { pct: number; reinicia_en: number | null; estado: string; actualizado_en: string }
  >;
  estimado: { tokens_5h: number; presupuesto: number; pct: number | null };
  reserva: { five_hour_pct: number; seven_day_pct: number };
}

/** Un dato del CLI caducado (la ventana ya se reinició) no cuenta: el uso real ya bajó. */
const vigente = (f: FilaLimite, ahoraMs: number): boolean =>
  f.reinicia_en === null || f.reinicia_en * 1000 > ahoraMs;

export function estadoPlan(db: Db, ahoraMs = Date.now()): EstadoPlan {
  const cfg = getConfig(db);
  const ventanas: EstadoPlan['ventanas'] = {};
  for (const f of leerLimites(db))
    if (f.utilizacion !== null && vigente(f, ahoraMs))
      ventanas[f.ventana] = {
        pct: Math.round(f.utilizacion * 100),
        reinicia_en: f.reinicia_en,
        estado: f.estado,
        actualizado_en: f.actualizado_en,
      };
  const tokens = tokens5h(db, ahoraMs);
  const presupuesto = cfg.presupuesto_5h_tokens;
  const hayCli = Object.keys(ventanas).length > 0;
  return {
    modo: hayCli ? 'cli' : presupuesto > 0 ? 'estimado' : 'sin_datos',
    ventanas,
    estimado: {
      tokens_5h: tokens,
      presupuesto,
      pct: presupuesto > 0 ? Math.round((tokens / presupuesto) * 100) : null,
    },
    reserva: { five_hour_pct: cfg.reserva_5h_pct, seven_day_pct: cfg.reserva_semanal_pct },
  };
}

/** Motivo para pausar por reserva, o null si hay margen. Solo usa datos vigentes; nunca inventa cifras. */
export function motivoReserva(db: Db, ahoraMs = Date.now()): string | null {
  const e = estadoPlan(db, ahoraMs);
  const cinco = e.ventanas['five_hour'];
  const sem = e.ventanas['seven_day'];
  const hora = (s: number | null) =>
    s ? ` Se reinicia ${new Date(s * 1000).toLocaleString('es-MX')}.` : '';
  if (cinco && cinco.pct >= e.reserva.five_hour_pct)
    return `Reserva del plan: ventana de 5 h al ${cinco.pct} % (reserva ${e.reserva.five_hour_pct} %).${hora(cinco.reinicia_en)}`;
  if (sem && sem.pct >= e.reserva.seven_day_pct)
    return `Reserva del plan: ventana semanal al ${sem.pct} % (reserva ${e.reserva.seven_day_pct} %).${hora(sem.reinicia_en)}`;
  if (!cinco && e.estimado.pct !== null && e.estimado.pct >= e.reserva.five_hour_pct)
    return `Reserva del plan (estimado): ${e.estimado.pct} % del presupuesto de 5 h (reserva ${e.reserva.five_hour_pct} %).`;
  return null;
}

export interface EstimadoCorrida {
  items: number;
  tokens_por_item: number;
  tokens: number;
  /** historial = promedio de corridas recientes; referencia = valor medido en P6 (sin historial). */
  base: 'historial' | 'referencia';
  umbral: number;
  requiere_confirmacion: boolean;
  /** Porcentaje del presupuesto de 5 h que consumiría (solo si el dueño fijó presupuesto). */
  pct_presupuesto: number | null;
}

export function estimarCorrida(db: Db, officeId: string, items: number): EstimadoCorrida {
  const cfg = getConfig(db);
  const h = db
    .prepare(
      `SELECT COALESCE(SUM(tokens_estimados),0) AS t, COUNT(DISTINCT item_id) AS n FROM salidas_agente
       WHERE office_id=? AND tipo='paso' AND tokens_estimados IS NOT NULL AND corrida_id IN
         (SELECT id FROM corridas WHERE office_id=? ORDER BY id DESC LIMIT 5)`,
    )
    .get(officeId, officeId) as { t: number; n: number };
  const base = h.n > 0 && h.t > 0 ? 'historial' : 'referencia';
  const porItem = base === 'historial' ? Math.round(h.t / h.n) : TOKENS_ITEM_REFERENCIA;
  const tokens = porItem * items;
  return {
    items,
    tokens_por_item: porItem,
    tokens,
    base,
    umbral: cfg.umbral_confirmacion_tokens,
    requiere_confirmacion: tokens > cfg.umbral_confirmacion_tokens,
    pct_presupuesto:
      cfg.presupuesto_5h_tokens > 0 ? Math.round((tokens / cfg.presupuesto_5h_tokens) * 100) : null,
  };
}
