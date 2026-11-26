import type { BorradorParcial, MensajeChat } from '../../shared/constructor';
import type { PaqueteOficina } from '../../shared/paquete';

export interface SesionCons {
  id: number;
  estado: 'abierta' | 'creada' | 'descartada';
  modo: 'ia' | 'formulario';
  fase: number;
  borrador: BorradorParcial;
  mensajes: MensajeChat[];
  turnos: number;
  tokens: number;
  office_id: string | null;
  faltan: string[];
  fases: string[];
  estimado_turno_tokens: number;
  ia: { disponible: boolean; motivo: string | null };
  rechazos?: string[];
}

export interface EstadoCons {
  ia: { disponible: boolean; motivo: string | null };
  plantillas: { id: string; nombre: string; descripcion: string }[];
  fases: string[];
  sesiones: { id: number; nombre: string | null; fase: number; modo: string }[];
}

export interface VistaPreviaCons {
  paquete: PaqueteOficina | null;
  errores: string[];
  advertencias: string[];
  integraciones: { nombre: string; descripcion: string; entrada: string; salida: string }[];
  lotes: number;
  estimado_prueba_tokens: number;
}
