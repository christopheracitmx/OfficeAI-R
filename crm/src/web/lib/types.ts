export interface ProspectoFila {
  id: number;
  estado: string;
  score: number | null;
  nivel: 'A' | 'B' | 'C' | null;
  canalizado_a: string | null;
  visto_por_dueno: number;
  reportado_en: string | null;
  creado_en: string;
  empresa_id: number;
  empresa: string;
  municipio: string | null;
  zona: string | null;
  sitio_web: string | null;
  sitio_verificado: number;
  metodo_descubrimiento: string;
  giro: string | null;
  correo_estado: 'pendiente' | 'enviado' | 'fallido' | null;
}

export interface Contacto {
  id: number;
  tipo: 'telefono' | 'correo' | 'persona';
  valor: string;
  nombre: string | null;
  puesto: string | null;
  fuente_url: string;
  fecha_fuente: string;
}

export interface ProspectoDetalle extends ProspectoFila {
  direccion: string | null;
  tamano: string | null;
  sucursales: number | null;
  resumen: string | null;
  origen_url: string | null;
  origen_nota: string | null;
  justificacion: string | null;
  score_desglose: string | null;
  reporte_md: string | null;
  borrador_correo: string | null;
  notas_dueno: string | null;
  contactos: Contacto[];
  necesidades: { texto: string; tipo: 'evidencia' | 'inferencia' }[];
  productos: { marca: string; categoria: string; razon: string; prioridad: string }[];
  paquetes: { nombre: string; componentes: string; argumento: string; dirigido_a: string | null }[];
  revisiones: {
    etapa: string;
    aprobado: number;
    devolver_a: string | null;
    motivos: string;
    creado_en: string;
  }[];
  envios: {
    id: number;
    destinatario: string;
    estado: string;
    error: string | null;
    intentos: number;
  }[];
  actividad: { agente: string; accion: string; detalle: string | null; creado_en: string }[];
}

export interface Conteo {
  n: number;
}

export interface Dashboard {
  semana: number;
  semana_anterior: number;
  nivel_a_pendientes: number;
  canalizados_mes: number;
  ganados_mes: number;
  sin_ver: number;
  correos_fallidos: number;
  por_semana: { semana: string; n: number }[];
  embudo: { estado: string; n: number }[];
  por_giro: { etiqueta: string; n: number }[];
  por_zona: { etiqueta: string; n: number }[];
  ultimos: {
    id: number;
    empresa: string;
    score: number | null;
    nivel: string | null;
    estado: string;
  }[];
  directorio_pendiente: number;
  directorio_por_metodo: { metodo: string; n: number }[];
  places: { mes: string; usado: number; tope: number };
}

export interface EstadoRunner {
  activo: boolean;
  office_id: string | null;
  corrida_id: number | null;
  fase: string | null;
  item_actual: { id: number; nombre?: string } | null;
  paso_actual: string | null;
  pasos_ejecutados: number;
  pasos_max: number;
  fallos_seguidos: number;
  resumen: Record<string, number>;
}

export interface ProgresoCorrida {
  corrida: { id: number; office_id: string; estado: string };
  runner: EstadoRunner | null;
  progreso: { id: string; etiqueta: string; valor: number }[];
}

export interface EstadoApp {
  motor_ia: string;
  runner?: EstadoRunner | null;
  places: { usado: number; tope: number; mes: string };
  base_datos: { ruta: string; modo: 'real' | 'demo' };
  resend_configurado: boolean;
  remitente: string;
  corrida_activa: Corrida | null;
}

export interface Corrida {
  id: number;
  zona: string;
  giro: string;
  max_empresas: number;
  motor: string;
  estado: string;
  motivo_fin: string | null;
  office_id?: string;
  iniciada_en: string;
  terminada_en: string | null;
}

export interface EmpresaDir {
  id: number;
  nombre: string;
  etapa: string;
  zona: string | null;
  municipio: string | null;
  sitio_web: string | null;
  metodo_descubrimiento: string;
  origen_url: string | null;
  origen_nota: string | null;
  descartada_motivo: string | null;
  creado_en: string;
  giro: string | null;
  telefono?: string | null;
  correo?: string | null;
  scian?: string | null;
  personal_est?: number | null;
  tamano?: string | null;
  atribuciones?: string | null;
}

export interface Destinatario {
  id: number;
  email: string;
  nombre: string | null;
  activo: number;
}

export interface Config {
  max_empresas_por_corrida: number;
  zonas_piloto: string[];
  places_tope_pro: number;
  motor_ia: string;
  reserva_5h_pct: number;
  reserva_semanal_pct: number;
  presupuesto_5h_tokens: number;
  umbral_confirmacion_tokens: number;
}

export const METODO_ETIQUETA: Record<string, string> = {
  places: 'Google Places',
  nicho_web: 'Búsqueda de nicho',
  directorio_publico: 'Directorio público',
  parque_industrial: 'Parque industrial',
  noticia_expansion: 'Noticia de expansión',
  hallazgo_oportunista: 'Hallazgo oportunista',
  referido: 'Referido',
  manual: 'Manual',
  denue_local: 'DENUE (local)',
  denue_api: 'DENUE (API)',
  osm_overpass: 'OpenStreetMap',
  overture_local: 'Overture Maps',
};

export const fechaCorta = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export * from './types-aprendizaje';
export * from './types-cerebro';
export * from './types-plan';

/** Número de un input: si no es finito devuelve el valor de respaldo (evita NaN en estados y envíos). */
export const numeroSeguro = (v: string, respaldo: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : respaldo;
};

/** Lista de textos guardada como JSON; ante datos dañados devuelve []. */
export function jsonLista(s: string): string[] {
  try {
    const x: unknown = JSON.parse(s);
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}
