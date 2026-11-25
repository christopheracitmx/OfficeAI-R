import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Db } from '../db';
import { MODELOS_CLAUDE } from './types';

/**
 * Definición de workflow de una oficina (JSON versionable). El motor genérico solo interpreta esta
 * estructura: los conceptos del negocio (qué es un "elemento", qué significan las etapas) viven en
 * las consultas SQL de solo lectura y en las herramientas MCP de cada oficina.
 *
 * Parámetros SQL con nombre disponibles: :corrida, :meta (tope de elementos), :item (elemento actual).
 */
const sql = z.string().min(6);
const variantePaso = z.union([
  z.string(),
  z.object({ agrupado: z.string(), separado: z.string() }),
]);

const paso = z.object({
  agente: z.string(),
  roles: z.array(z.string()).min(1),
  prompts: z.array(z.string()).min(1),
  herramientas: z.array(z.string()),
  web: z.boolean().default(false),
  max_turnos: z.number().int().positive(),
  /** Tope de lecturas de páginas web por llamada (cuida el plan). */
  max_lecturas: z.number().int().min(1).max(30).optional(),
  /** Modelo de este paso (ahorro de plan). Sin valor usa el `modelo` de engine.yaml. */
  modelo: z.enum(MODELOS_CLAUDE).optional(),
});

const verificacion = {
  /** Escalar verdadero cuando el resultado esperado ya está guardado. */
  verifica: sql.optional(),
  /** Alternativa: escalar numérico que debe AUMENTAR respecto a antes del paso. */
  aumenta: sql.optional(),
  falta: z.string().optional(),
};

const nodoPasoBase = z.object({
  tipo: z.literal('paso'),
  paso: z.string(),
  si: sql.optional(),
  tarea: z.string(),
  /** El texto final de este paso se pasa al siguiente en {salida_previa}. */
  pasa_salida: z.boolean().default(false),
  ...verificacion,
});
const subPaso = nodoPasoBase.omit({ tipo: true });
const nodoPaso = nodoPasoBase.extend({
  /** Alternativa cuando agrupar_pasos=false (se ejecutan en orden). */
  sin_agrupar: z.array(subPaso).optional(),
});

const etapaCiclo = z.object({
  si: sql,
  paso: z.string(),
  tarea: z.string(),
  ...verificacion,
  sin_agrupar: z.array(subPaso).optional(),
});

const nodoCiclo = z.object({
  tipo: z.literal('ciclo'),
  max_vueltas: z.number().int().positive().default(12),
  /** Devuelve (id, pendiente, origen, destino, motivos[JSON]) de la última revisión; pendiente=1 si rechazó. */
  devolucion: z.object({
    consulta: sql,
    mapa: z.record(z.string(), variantePaso),
    defecto: z.record(z.string(), variantePaso),
  }),
  etapas: z.array(etapaCiclo).min(1),
  /** Gancho de código (por nombre) cuando todas las etapas están satisfechas. */
  cierre: z.object({ gancho: z.string().optional() }).default({}),
});

const terminal = z.object({ si: sql, resultado: z.string(), evento: z.string().optional() });

const fases = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('descubrir'),
    id: z.string(),
    cuenta: sql,
    fuentes: z.array(
      z.object({
        paso: z.string(),
        rondas: z.number().int().positive().default(1),
        requiere: z.string().optional(),
        agotado: sql.optional(),
        mensaje: z.string(),
      }),
    ),
  }),
  z.object({
    tipo: z.literal('lote'),
    id: z.string(),
    paso: z.string(),
    items: sql,
    solo_agrupado: z.boolean().default(true),
    mensaje: z.string(),
  }),
  z.object({
    tipo: z.literal('por_item'),
    id: z.string(),
    items: sql,
    terminales: z.array(terminal),
    flujo: z.array(z.discriminatedUnion('tipo', [nodoPaso, nodoCiclo])),
  }),
]);

export const workflowSchema = z.object({
  version: z.literal(1),
  office_id: z.string().regex(/^[a-z0-9_-]+$/),
  titulo: z.string(),
  coordinador: z.string().default('Coordinador'),
  /** Nombre de la entidad del elemento de trabajo en los eventos (p. ej. la que enlaza la UI). */
  entidad_item: z.string().default('item'),
  /** Parámetro de la corrida que fija el tope de elementos (:meta). */
  tope_items: z.string(),
  topes: z.object({
    pasos_por_item: z.number().int().positive(),
    pasos_extra: z.number().int().nonnegative(),
    max_repeticiones_paso: z.number().int().positive().default(4),
  }),
  /** Capacidades externas apagables: variable de entorno que se vacía para los agentes si están off. */
  capacidades: z.record(z.string(), z.object({ env: z.string() })).default({}),
  variables: z.record(z.string(), sql).default({}),
  mensajes: z.object({ item: z.string() }),
  resultados: z.record(z.string(), z.string()),
  progreso: z.array(z.object({ id: z.string(), etiqueta: z.string(), sql })),
  pasos: z.record(z.string(), paso),
  fases: z.array(fases).min(1),
});

export type Workflow = z.infer<typeof workflowSchema>;
export type Paso = z.infer<typeof paso>;
export type Fase = z.infer<typeof fases>;
export type NodoPaso = z.infer<typeof nodoPaso>;
export type NodoCiclo = z.infer<typeof nodoCiclo>;
export type Variante = z.infer<typeof variantePaso>;

export function cargarWorkflow(dirOficinas: string, officeId: string): Workflow {
  const raw = readFileSync(join(dirOficinas, officeId, 'workflow.json'), 'utf8');
  return validarWorkflow(JSON.parse(raw), officeId);
}

/** Valida un workflow (de archivo o de la BD): esquema zod + referencias internas + resultado obligatorio. */
export function validarWorkflow(json: unknown, officeId: string): Workflow {
  const wf = workflowSchema.parse(json);
  if (wf.office_id !== officeId) throw new Error(`workflow.json declara office_id ${wf.office_id}`);
  const ids = new Set(Object.keys(wf.pasos));
  const usa = (p: string): void => {
    if (!ids.has(p)) throw new Error(`workflow: paso desconocido "${p}"`);
  };
  for (const f of wf.fases) {
    if (f.tipo === 'descubrir') f.fuentes.forEach((x) => usa(x.paso));
    if (f.tipo === 'lote') usa(f.paso);
    if (f.tipo === 'por_item')
      for (const n of f.flujo) {
        if (n.tipo === 'paso') [n, ...(n.sin_agrupar ?? [])].forEach((x) => usa(x.paso));
        else for (const e of n.etapas) [e, ...(e.sin_agrupar ?? [])].forEach((x) => usa(x.paso));
      }
  }
  if (!('incompleta' in wf.resultados))
    throw new Error('workflow: falta el resultado "incompleta"');
  return wf;
}

/** Todas las consultas del workflow, para validarlas (sintaxis y solo lectura) al arrancar. */
export function consultasDe(wf: Workflow): string[] {
  const q: (string | undefined)[] = [
    ...Object.values(wf.variables),
    ...wf.progreso.map((p) => p.sql),
  ];
  const verif = (n: {
    si?: string | undefined;
    verifica?: string | undefined;
    aumenta?: string | undefined;
  }) => q.push(n.si, n.verifica, n.aumenta);
  for (const f of wf.fases) {
    if (f.tipo === 'descubrir') f.fuentes.forEach((x) => q.push(f.cuenta, x.agotado));
    if (f.tipo === 'lote') q.push(f.items);
    if (f.tipo !== 'por_item') continue;
    q.push(f.items, ...f.terminales.map((t) => t.si));
    for (const n of f.flujo) {
      if (n.tipo === 'paso') [n, ...(n.sin_agrupar ?? [])].forEach(verif);
      else {
        q.push(n.devolucion.consulta);
        for (const e of n.etapas) [e, ...(e.sin_agrupar ?? [])].forEach(verif);
      }
    }
  }
  return [...new Set(q.filter((x): x is string => Boolean(x)))];
}

export function validarConsultas(db: Db, wf: Workflow): void {
  for (const s of consultasDe(wf)) {
    const st = db.prepare(s);
    if (!st.readonly)
      throw new Error(`workflow: la consulta no es de solo lectura: ${s.slice(0, 60)}`);
  }
}

export type Params = Record<string, string | number | null>;

export function escalar(db: Db, consulta: string, p: Params): unknown {
  const fila = db.prepare(consulta).raw().get(p) as unknown[] | undefined;
  return fila ? fila[0] : null;
}

export const verdadero = (v: unknown): boolean =>
  v !== null && v !== undefined && v !== 0 && v !== '' && v !== false;

/** Rellena {variables}; un tramo [ ... ] se descarta si alguna variable de su interior queda vacía. */
export function plantilla(t: string, vars: Record<string, unknown>): string {
  const val = (k: string): string => {
    const v = vars[k];
    return v === null || v === undefined ? '' : String(v);
  };
  const conTramos = t.replace(/\[([^\]]*)\]/g, (_m, interior: string) => {
    const ks = [...interior.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    return ks.every((k) => val(k) !== '') ? interior : '';
  });
  return conTramos.replace(/\{(\w+)\}/g, (_m, k: string) => val(k));
}
