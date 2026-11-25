/** Tipos de la pantalla Aprendizaje (P6.5): feedback, lecciones, reflexión, desempeño, casos dorados. */
export interface FeedbackFila {
  id: number;
  prospecto_id: number | null;
  etapa: string;
  agente: string | null;
  valor: number;
  etiqueta: string | null;
  nota: string | null;
  origen: 'qa' | 'resultado' | 'manual';
  creado_en: string;
}

export interface LeccionFila {
  id: number;
  agente: string;
  tipo: 'acierto' | 'error';
  texto: string;
  evidencia: string | null;
  estado: 'propuesta' | 'aprobada' | 'archivada';
  origen: string;
  version: number;
  nota: string | null;
  creado_en: string;
  actualizado_en: string | null;
}

export interface LeccionHistorial {
  id: number;
  version: number;
  texto: string;
  estado: string;
  accion: string;
  nota: string | null;
  creado_en: string;
}

export interface ConteoLeccionesUi {
  propuestas: number;
  aprobadas: number;
  archivadas: number;
  por_agente: Record<string, { propuestas: number; aprobadas: number }>;
}

export interface EstimadoIaUi {
  tokens: number;
  modelo: string;
  casos?: number;
  esfuerzo?: string;
  feedback_total?: number;
  pct_presupuesto: number | null;
}

export interface ResultadoReflexionUi {
  creadas: number;
  fusiones: number;
  rechazadas: { texto: string; motivo: string }[];
  tokens: number;
}

export interface PuntoTendenciaUi {
  corrida_id: number;
  llamadas: number;
  ok_pct: number;
  tokens_por_empresa: number | null;
}

export interface DesempenoAgenteUi {
  agente: string;
  llamadas: number;
  ok_pct: number | null;
  tokens: number;
  tokens_por_empresa: number | null;
  tiempo_medio_s: number | null;
  qa_revisiones: number;
  qa_aprobacion_pct: number | null;
  devoluciones: number;
  aciertos_dueno: number;
  errores_dueno: number;
  lecciones_aprobadas: number;
  lecciones_propuestas: number;
  tendencia: PuntoTendenciaUi[];
}

export interface DesempenoUi {
  oficina: {
    corridas: number;
    prospectos: number;
    llamadas: number;
    tokens: number;
    tokens_por_prospecto: number | null;
    qa_revisiones: number;
    qa_aprobacion_pct: number | null;
    devoluciones: number;
    resultados: Record<string, number>;
    aciertos_dueno: number;
    errores_dueno: number;
    lecciones: ConteoLeccionesUi;
  };
  agentes: DesempenoAgenteUi[];
}

export interface CriterioUi {
  tipo: string;
  valor?: string;
}

export interface CasoDoradoUi {
  id: number;
  nombre: string;
  agente: string;
  paso: string;
  entrada: string;
  salida_esperada: string;
  criterios: CriterioUi[];
  activo: number;
}

export interface EvaluacionUi {
  id: number;
  etiqueta: string;
  cambio: string | null;
  modelo: string | null;
  casos: number;
  aprobados: number;
  criterios_total: number;
  criterios_ok: number;
  tokens: number;
  estado: string;
  nota: string | null;
  creado_en: string;
}

export interface EvaluacionDetalleUi {
  resumen: EvaluacionUi;
  casos: {
    caso_id: number;
    caso_nombre: string;
    salida: string;
    ok: boolean;
    resultados: { criterio: string; ok: boolean; detalle: string }[];
  }[];
}

export interface RespaldoUi {
  archivo: string;
  tamano: number;
  creado_en: string;
  tipo: 'manual' | 'migracion' | 'restauracion' | 'otro';
}

export interface CambioUi {
  id: number;
  entidad: string;
  entidad_ref: string | null;
  accion: string;
  detalle: string | null;
  creado_en: string;
}

export const ETAPAS_UI = [
  { id: 'contactos', etiqueta: 'Contactos', agente: 'Rastreador' },
  { id: 'ficha', etiqueta: 'Ficha', agente: 'Analista' },
  { id: 'paquetes', etiqueta: 'Paquetes', agente: 'Armador' },
  { id: 'reporte', etiqueta: 'Reporte', agente: 'Redactor' },
] as const;

export const MODELOS_UI = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'] as const;
export const ESFUERZOS_UI = ['low', 'medium', 'high'] as const;
