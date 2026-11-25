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
};

export const fechaCorta = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// ---- P6: cerebro de la oficina
export const KB_TIPO_ETIQUETA: Record<string, string> = {
  producto: 'Productos',
  giro: 'Giros objetivo e ICP',
  oficinas: 'Oficinas y cobertura',
  voz: 'Voz y tono',
  objeciones: 'Objeciones y FAQ',
  reglas: 'Reglas de negocio',
  glosario: 'Glosario',
  lista: 'Listas (excluir)',
  otro: 'Otros',
};

export interface KbDocResumen {
  id: number;
  tipo: string;
  titulo: string;
  tags: string;
  activo: number;
  version: number;
  actualizado_en: string;
  largo: number;
}
export interface KbDocCompleto extends KbDocResumen {
  contenido_md: string;
}
export interface KbVersion {
  version: number;
  titulo: string;
  nota: string | null;
  creado_en: string;
  contenido_md: string;
}
export interface KbProducto {
  id: number;
  marca: string;
  familia: string;
  descripcion: string;
  casos_uso: string;
  giros_ideales: string;
  argumentos_valor: string;
  advertencias: string;
  activo: number;
}
export interface FilaPrompt {
  prompt: string;
  version: number;
  largo: number;
  tokens: number;
  actualizado_en: string;
}
export interface VersionPrompt {
  version: number;
  texto: string;
  nota: string | null;
  activo: number;
  creado_en: string;
  tokens: number;
}
export interface PasoOficina {
  paso: string;
  agente: string;
  roles: string[];
  prompts: string[];
}
export interface Habilidad {
  id: number;
  nombre: string;
  descripcion: string;
  contenido_md: string;
  activo: number;
  version: number;
  base: number;
  agentes: string[];
}
export interface AgenteFila {
  id: string;
  nombre_ui: string;
  persona: string;
  genero: string;
  rol: string;
  area: string;
}
export interface Salida {
  id: number;
  corrida_id: number | null;
  agente: string;
  rol: string | null;
  paso: string;
  item_id: number | null;
  prospecto_id: number | null;
  tipo: string;
  resumen: string | null;
  tokens_estimados: number | null;
  duracion_ms: number | null;
  resultado: string;
  prompt_tokens: number | null;
  turnos: number | null;
  herramientas: string | null;
  creado_en: string;
}
export interface ResumenConsumo {
  agente: string;
  llamadas: number;
  tokens: number | null;
  tokens_medio: number | null;
  prompt_medio: number | null;
  ms_medio: number | null;
  no_ok: number;
}
