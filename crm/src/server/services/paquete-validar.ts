import { HERRAMIENTAS_GENERICAS } from '../../shared/catalogo';
import { validarPlano } from '../../shared/oficina3d/plano';
import { MAX_BYTES_PAQUETE, paqueteOficina, type PaqueteOficina } from '../../shared/paquete';
import type { Db } from '../db';
import { consultasDe, validarConsultas, validarWorkflow, type Workflow } from '../runner/workflow';

/** Tablas que puede consultar el workflow de un paquete importado (las consultas son de solo lectura). */
export const TABLAS_PERMITIDAS: ReadonlySet<string> = new Set([
  'salidas_agente',
  'actividad_agentes',
  'coleccion_registros',
  'colecciones',
  'corridas',
  'agentes',
]);

const GENERICAS: ReadonlySet<string> = new Set(HERRAMIENTAS_GENERICAS);

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  paquete?: PaqueteOficina;
  workflow?: Workflow;
}

export const tablasDeSql = (sql: string): string[] =>
  [...sql.matchAll(/\b(?:from|join)\s+"?([a-z_][a-z0-9_]*)"?/gi)].map((m) => m[1]!.toLowerCase());

/**
 * Valida un paquete SIN crear nada: tamaño, esquema estricto, workflow (esquema del motor, consultas
 * de solo lectura sobre tablas permitidas), herramientas del catálogo, planta 3D sin traslapes y coherencia.
 */
export function validarPaquete(db: Db, crudo: unknown, idPropuesto: string): ResultadoValidacion {
  const errores: string[] = [];
  const advertencias: string[] = [];
  let tamano = 0;
  try {
    tamano = JSON.stringify(crudo)?.length ?? 0;
  } catch {
    return { ok: false, errores: ['El paquete no es JSON válido'], advertencias };
  }
  if (tamano > MAX_BYTES_PAQUETE)
    return {
      ok: false,
      errores: [
        `El paquete es demasiado grande (máximo ${Math.round(MAX_BYTES_PAQUETE / 1000)} KB)`,
      ],
      advertencias,
    };
  const p = paqueteOficina.safeParse(crudo);
  if (!p.success) {
    const msgs = p.error.issues
      .slice(0, 15)
      .map((i) => `${i.path.join('.') || 'paquete'}: ${i.message}`);
    return { ok: false, errores: msgs, advertencias };
  }
  const paquete = p.data;

  let workflow: Workflow | undefined;
  try {
    workflow = validarWorkflow({ ...paquete.workflow, office_id: idPropuesto }, idPropuesto);
    validarConsultas(db, workflow);
    for (const s of consultasDe(workflow))
      for (const t of tablasDeSql(s))
        if (!TABLAS_PERMITIDAS.has(t))
          errores.push(`El workflow consulta una tabla no permitida en paquetes: ${t}`);
  } catch (e) {
    errores.push(`Workflow inválido: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
  }

  const fuera = paquete.herramientas.filter((h) => !GENERICAS.has(h));
  if (fuera.length > 0)
    errores.push(`Herramientas fuera del catálogo genérico: ${fuera.join(', ')}`);
  if (workflow) {
    const usadas = new Set(Object.values(workflow.pasos).flatMap((x) => x.herramientas));
    const permitidas = new Set(paquete.herramientas);
    const sinPermiso = [...usadas].filter((h) => !permitidas.has(h));
    if (sinPermiso.length > 0)
      advertencias.push(
        `El flujo usa herramientas que la oficina no tendrá permitidas: ${sinPermiso.join(', ')}. No podrá correr hasta editarlo.`,
      );
  }
  for (const i of paquete.integraciones)
    advertencias.push(`Integración «${i.nombre}»: requiere herramienta nueva (desarrollo).`);

  const idsAgentes = new Set(paquete.agentes.map((a) => a.id));
  for (const h of paquete.habilidades)
    for (const a of h.agentes)
      if (!idsAgentes.has(a))
        errores.push(`La habilidad «${h.nombre}» asigna un agente inexistente: ${a}`);
  for (const a of paquete.planta.agentes)
    if (!idsAgentes.has(a.id))
      errores.push(`La planta 3D tiene un agente que no está en la lista: ${a.id}`);
  const plano = validarPlano(paquete.planta);
  errores.push(...plano.errores);
  advertencias.push(...plano.avisos);
  if (paquete.candados.relajados.length > 0)
    advertencias.push(
      `Relaja candados (${paquete.candados.relajados.join(', ')}): exige confirmación explícita al crear.`,
    );
  const nombres = new Set<string>();
  for (const d of paquete.kb) {
    if (nombres.has(d.titulo)) errores.push(`Documento repetido en la Biblioteca: ${d.titulo}`);
    nombres.add(d.titulo);
  }

  return {
    ok: errores.length === 0,
    errores: [...new Set(errores)],
    advertencias,
    paquete,
    ...(workflow ? { workflow } : {}),
  };
}

export interface ResumenPaquete {
  nombre: string;
  agentes: string[];
  pasos: string[];
  herramientas: string[];
  colecciones: string[];
  kb: string[];
  habilidades: string[];
  prompts: string[];
  integraciones: string[];
  candados_relajados: string[];
}

export function resumenDe(p: PaqueteOficina): ResumenPaquete {
  const wf = p.workflow as { pasos?: Record<string, unknown> };
  return {
    nombre: p.office.nombre,
    agentes: p.agentes.map((a) => `${a.persona} (${a.rol})`),
    pasos: Object.keys(wf.pasos ?? {}),
    herramientas: [...p.herramientas].sort(),
    colecciones: p.colecciones.map((c) => c.nombre),
    kb: p.kb.map((d) => d.titulo),
    habilidades: p.habilidades.map((h) => h.nombre),
    prompts: Object.keys(p.prompts.agentes),
    integraciones: p.integraciones.map((i) => i.nombre),
    candados_relajados: p.candados.relajados,
  };
}

export type DiferenciasPaquete = Record<
  Exclude<keyof ResumenPaquete, 'nombre'>,
  { agregan: string[]; quitan: string[] }
>;

/** Diferencias de un paquete respecto a otro (p. ej. el de una oficina existente): qué agrega y qué le falta. */
export function diferencias(nuevo: ResumenPaquete, base: ResumenPaquete): DiferenciasPaquete {
  const claves = Object.keys(nuevo).filter((k) => k !== 'nombre') as (keyof DiferenciasPaquete)[];
  const dif = {} as DiferenciasPaquete;
  for (const k of claves) {
    const a = new Set(nuevo[k]);
    const b = new Set(base[k]);
    dif[k] = {
      agregan: [...a].filter((x) => !b.has(x)),
      quitan: [...b].filter((x) => !a.has(x)),
    };
  }
  return dif;
}
