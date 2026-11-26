/**
 * Asistente «Nuevo piso» (Constructor): el «borrador de especificación» es un JSON estructurado y
 * compacto que se va completando por fases. El asistente lo recibe recortado en cada turno (NO todo
 * el historial) y devuelve parches. El servidor lo compila a un paquete de oficina validado.
 */
import { z } from 'zod';
import { coleccionInput } from './colecciones';
import { TIPOS_KB } from './paquete';

export const FASES = [
  'Objetivo y entregable',
  'Datos de entrada y salida',
  'Agentes y flujo',
  'Herramientas',
  'Base de conocimiento',
  'Candados y límites',
  'Vista previa 3D',
  'Prueba controlada',
  'Crear el piso',
] as const;
export const TOTAL_FASES = FASES.length;

const t = (max: number) => z.string().trim().max(max);

export const agenteBorrador = z.strictObject({
  rol: z.string().trim().min(2).max(40),
  persona: t(40).optional(),
  genero: z.enum(['f', 'm']).optional(),
  area: t(40).default('Trabajo'),
  tarea: z.string().trim().min(3).max(300),
  /** Agente de control de calidad: revisa el trabajo y puede devolverlo (con tope). */
  es_qa: z.boolean().default(false),
  herramientas: z.array(z.string().trim().max(60)).max(15).default([]),
  web: z.boolean().default(false),
});
export type AgenteBorrador = z.infer<typeof agenteBorrador>;

export const integracionBorrador = z.strictObject({
  nombre: z.string().trim().min(1).max(60),
  descripcion: t(300).default(''),
  entrada: t(200).default(''),
  salida: t(200).default(''),
});

export const documentoBorrador = z.strictObject({
  tipo: z.enum(TIPOS_KB).default('otro'),
  titulo: z.string().trim().min(2).max(120),
  contenido_md: z.string().trim().min(1).max(4000),
});

const iconoBorrador = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\w-]+$/);

/** Borrador completo: lo que se necesita para poder crear el piso. */
export const borradorCompleto = z.strictObject({
  nombre: z.string().trim().min(2).max(60),
  descripcion: t(300).default(''),
  icono: iconoBorrador.default('building'),
  objetivo: z.string().trim().min(5).max(600),
  entregable: z.string().trim().min(3).max(300),
  entrada: t(300).default(''),
  salida: t(300).default(''),
  almacenamiento: t(300).default(''),
  agentes: z.array(agenteBorrador).min(1).max(20),
  /** Rondas de revisión/corrección tras el trabajo (0 = sin QA). Tope duro por candado. */
  devoluciones_max: z.number().int().min(0).max(3).default(1),
  items_max: z.number().int().min(1).max(100).default(5),
  herramientas: z.array(z.string().trim().max(60)).max(30).default([]),
  integraciones: z.array(integracionBorrador).max(10).default([]),
  colecciones: z.array(coleccionInput).max(5).default([]),
  kb: z.array(documentoBorrador).max(20).default([]),
  /** Reglas extra del dueño (se AÑADEN a los prompts; nunca sustituyen a los candados). */
  reglas: z.array(t(200)).max(10).default([]),
  relajar_candados: z.array(z.string().trim().max(40)).max(5).default([]),
  prueba_items: z.number().int().min(1).max(3).default(1),
});
export type BorradorCompleto = z.infer<typeof borradorCompleto>;

/** Borrador en construcción: todo opcional; cada parche del asistente se valida campo por campo. */
export const borradorParcial = borradorCompleto.partial();
export type BorradorParcial = z.infer<typeof borradorParcial>;

export const mensajeChat = z.object({
  de: z.enum(['asistente', 'dueno', 'sistema']),
  texto: z.string().max(4000),
  fase: z.number().int().min(1).max(TOTAL_FASES).optional(),
});
export type MensajeChat = z.infer<typeof mensajeChat>;

/** Lo que el asistente devuelve en cada turno (JSON). */
export const respuestaAsistente = z.object({
  mensaje: z.string().min(1).max(3000),
  fase: z.number().int().min(1).max(TOTAL_FASES),
  borrador: z.record(z.string(), z.unknown()).default({}),
  listo: z.boolean().default(false),
});
export type RespuestaAsistente = z.infer<typeof respuestaAsistente>;

/** Aplica un parche al borrador: cada clave se valida con su esquema y las inválidas se reportan (el resto se aplica). */
export function aplicarParche(
  actual: BorradorParcial,
  parche: Record<string, unknown>,
): { borrador: BorradorParcial; rechazos: string[] } {
  const rechazos: string[] = [];
  const nuevo: Record<string, unknown> = { ...actual };
  const forma = borradorCompleto.shape as Record<string, z.ZodType>;
  for (const [k, v] of Object.entries(parche)) {
    const esquema = forma[k];
    if (!esquema) {
      rechazos.push(`Campo desconocido: ${k}`);
      continue;
    }
    const r = esquema.safeParse(v);
    if (r.success) nuevo[k] = r.data;
    else rechazos.push(`${k}: ${r.error.issues[0]?.message ?? 'valor inválido'}`);
  }
  return { borrador: nuevo as BorradorParcial, rechazos };
}

/** Qué falta para poder crear el piso (lista legible para el dueño). */
export function faltantes(b: BorradorParcial): string[] {
  const r = borradorCompleto.safeParse(b);
  if (r.success) return [];
  return [
    ...new Set(r.error.issues.map((i) => `${i.path.join('.') || 'borrador'}: ${i.message}`)),
  ].slice(0, 8);
}

/** Recorte compacto del borrador para enviarlo al modelo (sin textos largos de la Biblioteca). */
export function borradorCompacto(b: BorradorParcial): string {
  const copia: Record<string, unknown> = { ...b };
  if (b.kb)
    copia['kb'] = b.kb.map((d) => ({
      tipo: d.tipo,
      titulo: d.titulo,
      chars: d.contenido_md.length,
    }));
  return JSON.stringify(copia);
}
