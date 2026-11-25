import { z } from 'zod';
import { AGENTES, ESTADOS_PROSPECTO, METODOS_DESCUBRIMIENTO, mencionaPrecio } from './domain';

const textoSinPrecio = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !mencionaPrecio(v), 'No se permiten precios ni costos');

export const emailSchema = z.string().trim().toLowerCase().email().max(200);

export const destinatarioInput = z.object({
  email: emailSchema,
  nombre: z.string().trim().max(120).optional(),
  activo: z.boolean().optional(),
});

export const noContactarInput = z.object({
  tipo: z.enum(['dominio', 'correo', 'telefono', 'nombre']),
  valor: z.string().trim().min(2).max(200),
  motivo: z.string().trim().max(300).optional(),
});

export const empresaInput = z.object({
  nombre: z.string().trim().min(2).max(200),
  place_id: z.string().trim().max(300).optional(),
  metodo_descubrimiento: z.enum(METODOS_DESCUBRIMIENTO),
  origen_url: z.string().trim().url().max(1000).optional(),
  origen_nota: z.string().trim().max(500).optional(),
  giro: z.string().trim().max(120).optional(),
  direccion: z.string().trim().max(400).optional(),
  sitio_web: z.string().trim().url().max(500).optional(),
  corrida_id: z.number().int().positive().optional(),
});

export const hallazgoInput = z.object({
  nombre: z.string().trim().min(2).max(200),
  origen_url: z.string().trim().url().max(1000),
  origen_nota: z.string().trim().min(3).max(500),
  direccion: z.string().trim().max(400).optional(),
  sitio_web: z.string().trim().url().max(500).optional(),
  corrida_id: z.number().int().positive().optional(),
});

export const contactoInput = z.object({
  empresa_id: z.number().int().positive(),
  tipo: z.enum(['telefono', 'correo', 'persona']),
  valor: z.string().trim().min(3).max(200),
  nombre: z.string().trim().max(120).optional(),
  puesto: z.string().trim().max(120).optional(),
  fuente_url: z.string().trim().url().max(1000), // obligatoria: sin fuente no se guarda
});

export const fichaInput = z.object({
  empresa_id: z.number().int().positive(),
  tamano: z.enum(['micro', 'pequena', 'mediana', 'grande']).optional(),
  sucursales: z.number().int().min(0).max(5000).optional(),
  resumen: textoSinPrecio(2000).optional(),
  giro: z.string().trim().max(120).optional(),
  sitio_web: z.string().trim().url().max(500).optional(),
  sitio_verificado: z.boolean().optional(),
  necesidades: z
    .array(z.object({ texto: textoSinPrecio(400), tipo: z.enum(['evidencia', 'inferencia']) }))
    .max(20)
    .optional(),
});

export const etapaInput = z.object({
  empresa_id: z.number().int().positive(),
  etapa: z.enum(['filtrada', 'enriquecida', 'analizada', 'descartada']),
  motivo: z.string().trim().max(300).optional(),
});

export const expedienteInput = z.object({
  empresa_id: z.number().int().positive(),
  corrida_id: z.number().int().positive().optional(),
  productos: z
    .array(
      z.object({
        marca: z.enum(['Lenovo', 'Aruba']),
        categoria: textoSinPrecio(120),
        razon: textoSinPrecio(500),
        prioridad: z.enum(['alta', 'media', 'baja']),
      }),
    )
    .max(8),
  paquetes: z
    .array(
      z.object({
        nombre: textoSinPrecio(120),
        componentes: z.array(textoSinPrecio(120)).min(1).max(10),
        argumento: textoSinPrecio(800),
        dirigido_a: z.string().trim().max(160).optional(),
      }),
    )
    .max(3),
  score: z.number().int().min(0).max(100),
  score_desglose: z.record(z.string(), z.number()),
  justificacion: textoSinPrecio(1200),
  reporte_md: textoSinPrecio(8000),
  borrador_correo: textoSinPrecio(4000),
});

export const revisionQaInput = z.object({
  prospecto_id: z.number().int().positive(),
  etapa: z.enum(['qa1', 'qa2']),
  aprobado: z.boolean(),
  devolver_a: z.string().trim().max(60).optional(),
  motivos: z.array(z.string().trim().max(300)).max(12).optional(),
});

export const actividadInput = z.object({
  agente: z.enum(AGENTES),
  accion: z.string().trim().min(2).max(80),
  entidad: z.string().trim().max(40).optional(),
  entidad_id: z.number().int().optional(),
  detalle: z.string().trim().max(500).optional(),
  corrida_id: z.number().int().positive().optional(),
});

export const corridaInput = z.object({
  zona: z.string().trim().min(2).max(80),
  giro: z.string().trim().min(2).max(120),
  max_empresas: z.number().int().min(1).max(50).default(10),
});

export const prospectoPatch = z.object({
  estado: z.enum(ESTADOS_PROSPECTO).optional(),
  canalizado_a: z.string().trim().max(160).nullable().optional(),
  notas_dueno: z.string().trim().max(2000).nullable().optional(),
  visto_por_dueno: z.boolean().optional(),
  motivo: z.string().trim().max(300).optional(),
});

export const configPatch = z.object({
  max_empresas_por_corrida: z.number().int().min(1).max(50).optional(),
  zonas_piloto: z.array(z.string().trim().min(2).max(60)).min(1).max(20).optional(),
});
