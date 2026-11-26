/**
 * Paquete de oficina: una oficina completa como JSON validado (sin datos operativos ni secretos).
 * Lo producen «Exportar», la galería de plantillas y el Constructor; lo consume «Importar».
 * Esquemas ESTRICTOS (claves desconocidas = error) y con límites de tamaño.
 */
import { z } from 'zod';
import { RELAJABLES } from './candados';
import { coleccionInput } from './colecciones';
import { definicionOficina } from './oficina3d/definicion';

export const FORMATO_PAQUETE = 'officeai-paquete';
/** Tope del JSON completo en bytes (la ruta de importación lo comprueba antes de analizar). */
export const MAX_BYTES_PAQUETE = 1_500_000;

const texto = (max: number) => z.string().max(max);
const nombreCorto = z.string().trim().min(1).max(40);

export const agentePaquete = z.strictObject({
  id: z.string().regex(/^[\w\- ]{1,40}$/, 'Id de agente: letras, números, espacio, guion'),
  nombre_ui: nombreCorto,
  persona: nombreCorto,
  genero: z.enum(['f', 'm']),
  rol: nombreCorto,
  area: z.string().trim().max(40),
});

export const habilidadPaquete = z.strictObject({
  nombre: z.string().trim().min(2).max(80),
  descripcion: texto(300),
  contenido_md: z.string().min(1).max(8000),
  agentes: z.array(z.string().max(40)).max(40).default([]),
});

export const TIPOS_KB = [
  'producto',
  'giro',
  'oficinas',
  'voz',
  'objeciones',
  'reglas',
  'glosario',
  'lista',
  'otro',
] as const;

export const documentoPaquete = z.strictObject({
  tipo: z.enum(TIPOS_KB),
  titulo: z.string().trim().min(2).max(120),
  contenido_md: z.string().min(1).max(20_000),
  tags: texto(200).default(''),
});

export const capaPaquete = z.strictObject({
  entidad: z.enum(['personaje', 'sala', 'oficina']),
  /** Para la entidad «oficina» el id es siempre «*» (se reasigna al crear). */
  entidad_id: z.string().min(1).max(60),
  overrides: z.record(z.string(), z.unknown()),
});

export const paqueteOficina = z.strictObject({
  formato: z.literal(FORMATO_PAQUETE),
  version: z.literal(1),
  office: z.strictObject({
    nombre: z.string().trim().min(2).max(60),
    descripcion: texto(300).default(''),
    icono: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[\w-]+$/)
      .default('building'),
  }),
  agentes: z.array(agentePaquete).max(40),
  /** Workflow (se valida con el esquema del motor al crear). */
  workflow: z.record(z.string(), z.unknown()),
  prompts: z.strictObject({
    global: z.string().max(20_000),
    agentes: z.record(z.string().max(60), z.string().max(20_000)),
  }),
  habilidades: z.array(habilidadPaquete).max(30).default([]),
  kb: z.array(documentoPaquete).max(60).default([]),
  /** Solo el ESQUEMA de las colecciones (nunca registros). */
  colecciones: z.array(coleccionInput).max(20).default([]),
  planta: definicionOficina,
  apariencias: z.array(capaPaquete).max(120).default([]),
  /** Herramientas permitidas (todas del catálogo). */
  herramientas: z.array(z.string().max(60)).max(30),
  candados: z.strictObject({
    relajados: z
      .array(z.string().max(40))
      .max(10)
      .refine((l) => l.every((c) => RELAJABLES.includes(c)), 'Candado no relajable'),
  }),
  /** Integraciones pedidas que no están en el catálogo (informativo: «requiere herramienta nueva»). */
  integraciones: z
    .array(
      z.strictObject({
        nombre: z.string().trim().min(1).max(60),
        descripcion: texto(300).default(''),
        entrada: texto(200).default(''),
        salida: texto(200).default(''),
        estado: z.literal('requiere_herramienta_nueva').default('requiere_herramienta_nueva'),
      }),
    )
    .max(10)
    .default([]),
});
export type PaqueteOficina = z.infer<typeof paqueteOficina>;
