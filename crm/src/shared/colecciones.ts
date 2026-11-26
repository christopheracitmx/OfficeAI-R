/** Colecciones: tablas definidas por el usuario (esquema tipado, validación y clave de deduplicación). Puro y compartido. */
import { z } from 'zod';

export const TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'booleano', 'url', 'enum'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export const ETQ_TIPO: Record<TipoCampo, string> = {
  texto: 'Texto',
  numero: 'Número',
  fecha: 'Fecha',
  booleano: 'Sí/No',
  url: 'Enlace (URL)',
  enum: 'Lista de opciones',
};

export const MAX_CAMPOS = 30;
export const MAX_TEXTO = 2000;
export const MAX_BYTES_REGISTRO = 12_000;
export const MAX_REGISTROS = 50_000;

export const campoDef = z
  .object({
    nombre: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,29}$/, 'Nombre de campo: minúsculas, números y guion bajo'),
    etiqueta: z.string().trim().min(1).max(60),
    tipo: z.enum(TIPOS_CAMPO),
    requerido: z.boolean().default(false),
    opciones: z.array(z.string().trim().min(1).max(60)).min(2).max(20).optional(),
  })
  .refine((c) => (c.tipo === 'enum') === (c.opciones !== undefined), {
    message: 'Solo los campos de tipo lista llevan opciones (y las necesitan)',
    path: ['opciones'],
  });
export type CampoDef = z.infer<typeof campoDef>;

export const coleccionInput = z
  .object({
    nombre: z.string().trim().min(2).max(60),
    descripcion: z.string().trim().max(300).default(''),
    campos: z.array(campoDef).min(1).max(MAX_CAMPOS),
    clave: z.string().nullable().default(null),
  })
  .superRefine((c, ctx) => {
    const nombres = new Set<string>();
    c.campos.forEach((f, i) => {
      if (nombres.has(f.nombre))
        ctx.addIssue({
          code: 'custom',
          message: `Campo repetido: ${f.nombre}`,
          path: ['campos', i, 'nombre'],
        });
      nombres.add(f.nombre);
    });
    if (c.clave !== null) {
      const f = c.campos.find((x) => x.nombre === c.clave);
      if (!f)
        ctx.addIssue({ code: 'custom', message: 'La clave debe ser un campo', path: ['clave'] });
      else if (f.tipo === 'booleano')
        ctx.addIssue({ code: 'custom', message: 'La clave no puede ser Sí/No', path: ['clave'] });
    }
  });
export type ColeccionInput = z.infer<typeof coleccionInput>;

export const coleccionPatch = z
  .object({
    nombre: z.string().trim().min(2).max(60).optional(),
    descripcion: z.string().trim().max(300).optional(),
    /** Solo se pueden AÑADIR campos o cambiar etiquetas: quitar o cambiar de tipo dañaría registros. */
    campos: z.array(campoDef).min(1).max(MAX_CAMPOS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que cambiar' });

const urlHttp = z
  .string()
  .trim()
  .max(1000)
  .refine((u) => {
    try {
      return ['http:', 'https:'].includes(new URL(u).protocol);
    } catch {
      return false;
    }
  }, 'Debe ser un enlace http(s) válido');

export const registroInput = z.object({
  datos: z.record(z.string(), z.unknown()),
  fuente_url: urlHttp.nullable().optional(),
  nota: z.string().trim().max(500).nullable().optional(),
});
export type RegistroInput = z.infer<typeof registroInput>;

/** Lo que exige el agente: siempre una fuente (URL). */
export const registroAgenteInput = z.object({
  coleccion: z.string().trim().min(2).max(60),
  datos: z.record(z.string(), z.unknown()),
  fuente_url: urlHttp,
  nota: z.string().trim().max(500).optional(),
});

export type Datos = Record<string, string | number | boolean>;

export interface ResultadoValidacion {
  ok: boolean;
  datos: Datos;
  errores: string[];
}

/** Valida y normaliza un registro contra el esquema. No acepta campos desconocidos. */
export function validarDatos(
  campos: readonly CampoDef[],
  crudo: Record<string, unknown>,
): ResultadoValidacion {
  const errores: string[] = [];
  const datos: Datos = {};
  const conocidos = new Set(campos.map((c) => c.nombre));
  for (const k of Object.keys(crudo))
    if (!conocidos.has(k)) errores.push(`Campo desconocido: ${k}`);
  for (const c of campos) {
    const v = crudo[c.nombre];
    if (v === undefined || v === null || v === '') {
      if (c.requerido) errores.push(`Falta el campo obligatorio «${c.etiqueta}»`);
      continue;
    }
    const e = validarValor(c, v);
    if (typeof e === 'string') errores.push(`${c.etiqueta}: ${e}`);
    else datos[c.nombre] = e.valor;
  }
  if (new TextEncoder().encode(JSON.stringify(datos)).length > MAX_BYTES_REGISTRO)
    errores.push('El registro es demasiado grande');
  return { ok: errores.length === 0, datos, errores };
}

function validarValor(c: CampoDef, v: unknown): string | { valor: string | number | boolean } {
  switch (c.tipo) {
    case 'texto': {
      if (typeof v !== 'string') return 'debe ser texto';
      return v.length > MAX_TEXTO ? `máximo ${MAX_TEXTO} caracteres` : { valor: v.trim() };
    }
    case 'numero': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      return typeof n === 'number' && Number.isFinite(n) ? { valor: n } : 'debe ser un número';
    }
    case 'fecha': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'usa AAAA-MM-DD';
      const d = new Date(`${v}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v
        ? 'fecha inexistente'
        : { valor: v };
    }
    case 'booleano':
      return typeof v === 'boolean' ? { valor: v } : 'debe ser verdadero o falso';
    case 'url': {
      const r = urlHttp.safeParse(v);
      return r.success ? { valor: r.data } : 'enlace http(s) no válido';
    }
    case 'enum':
      return typeof v === 'string' && c.opciones?.includes(v)
        ? { valor: v }
        : `debe ser una de: ${c.opciones?.join(', ') ?? ''}`;
  }
}

/** Valor normalizado de la clave de deduplicación (minúsculas, sin espacios extremos ni «/» final en URLs). */
export function claveNormalizada(clave: string | null, datos: Datos): string | null {
  if (!clave) return null;
  const v = datos[clave];
  if (v === undefined) return null;
  return String(v).trim().toLowerCase().replace(/\/+$/, '');
}
