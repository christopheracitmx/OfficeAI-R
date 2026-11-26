import type { CampoDef } from '../../shared/colecciones';

export interface Coleccion {
  id: number;
  office_id: string;
  nombre: string;
  descripcion: string;
  campos: CampoDef[];
  clave: string | null;
  estado: 'activa' | 'archivada';
  registros: number;
  actualizado_en: string;
}

export type ValorDato = string | number | boolean;

export interface Registro {
  id: number;
  datos: Record<string, ValorDato>;
  fuente_url: string | null;
  nota: string | null;
  estado: 'activo' | 'archivado';
  version: number;
  creado_por: string;
  actualizado_en: string;
}

export interface ListaRegistros {
  total: number;
  registros: Registro[];
}

export interface VersionRegistro {
  version: number;
  datos_json: string;
  fuente_url: string | null;
  nota: string | null;
  accion: string;
  actor: string;
  creado_en: string;
}

export interface HerramientaCat {
  nombre: string;
  descripcion: string;
  categoria: string;
  riesgos: string[];
  requiere_config: string[];
  solo_prospeccion?: boolean;
  nativa?: boolean;
}

export interface CandadoCat {
  id: string;
  titulo: string;
  texto: string;
  relajable: boolean;
}

export interface Ajustes {
  herramientas_efectivas: string[] | null;
  herramientas_configuradas: string[] | null;
  archivos_activo: boolean;
  correo_activo: boolean;
  candados_relajados: string[];
}

export interface EstadoArchivos {
  activo: boolean;
  carpetas: { id: number; ruta: string }[];
  log: {
    id: number;
    accion: string;
    ruta: string;
    destino: string | null;
    detalle: string | null;
    agente: string | null;
    creado_en: string;
  }[];
}
