/** Límites del plan de suscripción (GET /api/plan) y estimador por corrida (GET /api/corridas/estimado). */
export interface VentanaPlanUi {
  pct: number;
  reinicia_en: number | null;
  estado: string;
  actualizado_en: string;
}

export interface EstadoPlanUi {
  /** cli = porcentaje informado por el CLI; estimado = calculado con tokens y presupuesto; sin_datos. */
  modo: 'cli' | 'estimado' | 'sin_datos';
  ventanas: Record<string, VentanaPlanUi>;
  estimado: { tokens_5h: number; presupuesto: number; pct: number | null };
  reserva: { five_hour_pct: number; seven_day_pct: number };
}

export interface EstimadoCorridaUi {
  items: number;
  tokens_por_item: number;
  tokens: number;
  base: 'historial' | 'referencia';
  umbral: number;
  requiere_confirmacion: boolean;
  pct_presupuesto: number | null;
}
