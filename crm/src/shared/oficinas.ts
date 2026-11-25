/** Oficinas (pisos del edificio): contratos de la API del dueño, validados con zod. */
import { z } from 'zod';

export const OFICINA_PRINCIPAL = 'prospeccion';

export const officeIdSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9_-]+$/, 'Solo minúsculas, números, guion y guion bajo');

const nombre = z.string().trim().min(2).max(60);
const descripcion = z.string().trim().max(300);
const icono = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\w-]+$/);

export const PLANTILLAS_OFICINA = ['vacia', 'duplicar'] as const;

/** Crear un piso: `vacia` (plantilla mínima con workflow trivial) o duplicando otra oficina. */
export const oficinaCrearInput = z
  .object({
    nombre,
    descripcion: descripcion.default(''),
    icono: icono.default('building'),
    plantilla: z.enum(PLANTILLAS_OFICINA).default('vacia'),
    /** Obligatorio si plantilla = duplicar: oficina origen. */
    origen: officeIdSchema.optional(),
    /** Opcional: si se omite se genera a partir del nombre. */
    id: officeIdSchema.optional(),
  })
  .refine((v) => v.plantilla !== 'duplicar' || v.origen !== undefined, {
    message: 'Indica la oficina origen para duplicar',
    path: ['origen'],
  });
export type OficinaCrearInput = z.infer<typeof oficinaCrearInput>;

export const oficinaPatchInput = z
  .object({
    nombre: nombre.optional(),
    descripcion: descripcion.optional(),
    icono: icono.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que cambiar' });

export const oficinaReordenarInput = z.object({
  /** Ids de las oficinas activas en el nuevo orden (de abajo hacia arriba: el primero es el piso 1). */
  orden: z.array(officeIdSchema).min(1).max(60),
});

export interface OficinaFila {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  orden: number;
  estado: 'activa' | 'archivada';
  plantilla_origen: string | null;
  workflow_ref: string;
  creado_en: string;
}

/** Tarjeta de piso para la pantalla Edificio y el 3D. */
export interface OficinaResumen extends OficinaFila {
  /** Número de piso (1 = planta baja) entre las activas; null si está archivada. */
  piso: number | null;
  agentes: number;
  ultima_corrida: {
    id: number;
    estado: string;
    iniciada_en: string;
    terminada_en: string | null;
  } | null;
  corrida_activa: boolean;
  pendientes_aprendizaje: number;
  /** Porcentaje del plan atribuible a la oficina (tokens ponderados de las últimas 24 h vs. total). */
  uso_pct: number;
  ejecutable: boolean;
  advertencias: string[];
}
