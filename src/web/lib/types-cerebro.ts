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
  /** Modelo efectivo del paso (el del workflow o el de engine.yaml). */
  modelo: string | null;
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
