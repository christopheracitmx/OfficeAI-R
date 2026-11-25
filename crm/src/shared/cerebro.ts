import { z } from 'zod';

export const KB_TIPOS = [
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
export type KbTipo = (typeof KB_TIPOS)[number];

export const KB_TIPO_ETIQUETA: Record<KbTipo, string> = {
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

/** Detecta montos de dinero: la Biblioteca NUNCA guarda precios. */
const PRECIO_RE =
  /(\$\s*\d|\bUS\$|\d[\d.,]*\s*(?:MXN|USD|EUR|pesos|dólares|dolares|euros)\b|\b(?:MXN|USD|EUR)\s*\d)/i;
export const contienePrecio = (t: string): boolean => PRECIO_RE.test(t);
const sinPrecio = (t: string): boolean => !contienePrecio(t);
const MSG_PRECIO = 'No se permiten precios ni montos en la Biblioteca';

const textoLargo = z.string().max(20000).refine(sinPrecio, MSG_PRECIO);
const textoCorto = (n: number) => z.string().trim().max(n).refine(sinPrecio, MSG_PRECIO);

export const kbDocInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  tipo: z.enum(KB_TIPOS),
  titulo: z.string().trim().min(2).max(160),
  contenido_md: textoLargo.refine((t) => t.trim().length > 0, 'Falta el contenido'),
  tags: z.string().max(200).default(''),
  nota: z.string().max(200).optional(),
});
export type KbDocInput = z.infer<typeof kbDocInput>;
export const kbDocPatch = kbDocInput
  .omit({ office_id: true })
  .partial()
  .extend({ activo: z.boolean().optional() });

export const kbProductoInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  marca: textoCorto(60).pipe(z.string().min(1)),
  familia: textoCorto(120).pipe(z.string().min(1)),
  descripcion: textoCorto(1200).default(''),
  casos_uso: textoCorto(1200).default(''),
  giros_ideales: textoCorto(600).default(''),
  argumentos_valor: textoCorto(1200).default(''),
  advertencias: textoCorto(800).default(''),
});
export type KbProductoInput = z.infer<typeof kbProductoInput>;
export const kbProductoPatch = kbProductoInput
  .omit({ office_id: true })
  .partial()
  .extend({ activo: z.boolean().optional() });

export const promptInput = z.object({
  texto: z.string().trim().min(20).max(12000),
  nota: z.string().max(200).optional(),
});

export const habilidadInput = z.object({
  office_id: z.string().min(1).max(60).default('prospeccion'),
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().max(300).default(''),
  contenido_md: z.string().trim().min(10).max(6000),
});
export const habilidadPatch = habilidadInput
  .omit({ office_id: true })
  .partial()
  .extend({ activo: z.boolean().optional() });
