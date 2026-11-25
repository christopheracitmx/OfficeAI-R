import { z } from 'zod';
import { LECCION_MAX } from './leccion-reglas';

export const ETAPAS_FEEDBACK = ['contactos', 'ficha', 'paquetes', 'reporte', 'otro'] as const;
/** Rol del agente al que se atribuye cada etapa evaluable en el detalle del prospecto. */
export const AGENTE_DE_ETAPA: Record<(typeof ETAPAS_FEEDBACK)[number], string | null> = {
  contactos: 'Rastreador',
  ficha: 'Analista',
  paquetes: 'Armador',
  reporte: 'Redactor',
  otro: null,
};

export const ETIQUETAS_POR_DEFECTO = [
  'Contacto incorrecto',
  'Falta fuente',
  'Sitio equivocado',
  'Paquete incoherente',
  'Tono inadecuado',
  'Score no refleja la realidad',
  'Buen hallazgo',
  'Buen ajuste de giro',
];

const nota = z.string().trim().max(500);

export const feedbackInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  prospecto_id: z.number().int().positive(),
  etapa: z.enum(ETAPAS_FEEDBACK),
  valor: z.union([z.literal(1), z.literal(-1)]),
  etiqueta: z.string().trim().max(80).optional(),
  nota: nota.optional(),
  /** «Error de agente X»: atribuye el comentario a otro agente distinto al de la etapa. */
  agente: z.string().trim().min(1).max(60).optional(),
});

export const leccionInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  agente: z.string().trim().min(1).max(60),
  tipo: z.enum(['acierto', 'error']),
  texto: z
    .string()
    .trim()
    .min(1)
    .max(LECCION_MAX * 2),
  evidencia: z
    .object({
      feedback: z.array(z.number().int()).max(50).optional(),
      salidas: z.array(z.number().int()).max(50).optional(),
      fusiona: z.array(z.number().int()).max(20).optional(),
    })
    .optional(),
  nota: nota.optional(),
});

export const leccionPatch = z.object({
  texto: z
    .string()
    .trim()
    .min(1)
    .max(LECCION_MAX * 2)
    .optional(),
  tipo: z.enum(['acierto', 'error']).optional(),
  agente: z.string().trim().min(1).max(60).optional(),
  nota: nota.optional(),
});

export const MODELOS_REFLEXION = [
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
] as const;
export const ESFUERZOS = ['low', 'medium', 'high'] as const;

export const reflexionInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  confirmado: z.boolean().optional(),
  modelo: z.enum(MODELOS_REFLEXION).optional(),
  esfuerzo: z.enum(ESFUERZOS).optional(),
});

/** Criterios simples y verificables por código sobre la salida de un agente. */
export const TIPOS_CRITERIO = [
  'sin_precios',
  'contacto_con_fuente',
  'paquete_coherente',
  'contiene',
  'no_contiene',
  'largo_max',
  'json_valido',
  'sin_contacto_externo',
] as const;
export const criterioSchema = z.object({
  tipo: z.enum(TIPOS_CRITERIO),
  valor: z.string().trim().max(300).optional(),
});
export type Criterio = z.infer<typeof criterioSchema>;

export const casoInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  nombre: z.string().trim().min(3).max(120),
  agente: z.string().trim().min(1).max(60),
  paso: z.string().trim().min(1).max(60),
  entrada: z.string().trim().min(10).max(6000),
  salida_esperada: z.string().trim().max(4000).default(''),
  criterios: z.array(criterioSchema).min(1).max(12),
  activo: z.boolean().optional(),
});
export const casoPatch = casoInput.omit({ office_id: true }).partial();

export const evaluacionInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  etiqueta: z.string().trim().min(2).max(80),
  /** Texto de prompt o lección a evaluar; vacío = línea base (sin cambio). */
  cambio: z.string().trim().max(300).optional(),
  modelo: z.enum(MODELOS_REFLEXION).optional(),
  confirmado: z.boolean().optional(),
});
