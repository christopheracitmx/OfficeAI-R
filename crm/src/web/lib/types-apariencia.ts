/** Contratos de la API del Personalizador (espejo de los servicios del servidor). */
import type { Campos, Entidad } from '../../shared/oficina3d/composicion';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';

export interface CapaGuardadaUi {
  preset: number | null;
  overrides: Campos;
  version: number;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
}

export interface PresetUi {
  id: number;
  tipo: Entidad;
  nombre: string;
  json: Campos;
  builtin: boolean;
  office_id: string | null;
}

export interface EstadoApariencias {
  base: DefinicionOficina;
  efectiva: DefinicionOficina;
  capas: Record<string, CapaGuardadaUi>;
  presets: PresetUi[];
  descartes: string[];
}

export interface VersionUi {
  version: number;
  nota: string | null;
  creado_en: string;
  vigente: boolean;
}
