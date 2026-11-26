import { topesPara } from '../../shared/candados';
import { esDeArchivos, estadoIntegracion, HERRAMIENTAS_GENERICAS } from '../../shared/catalogo';
import {
  borradorCompleto,
  type AgenteBorrador,
  type BorradorCompleto,
  type BorradorParcial,
} from '../../shared/constructor';
import { generarDefinicion, resolverEquipo } from '../../shared/oficina3d/generar';
import { FORMATO_PAQUETE, type PaqueteOficina } from '../../shared/paquete';
import type { Db } from '../db';
import { validarPaquete } from './paquete-validar';
import { idDesdeNombre } from './oficinas';
import { promptComun, promptDeAgente } from './constructor-prompts';

export interface Compilado {
  paquete: PaqueteOficina | null;
  errores: string[];
  advertencias: string[];
  /** Integraciones pedidas que no existen en el catálogo (con especificación lista). */
  integraciones: PaqueteOficina['integraciones'];
  /** Llamadas al motor que hace una corrida (para estimar consumo). */
  lotes: number;
}

const sinAcentos = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const idAgente = (rol: string): string =>
  sinAcentos(rol)
    .replace(/[^\w\- ]/g, '')
    .trim()
    .slice(0, 40) || 'Agente';
const clavePrompt = (id: string): string => id.toLowerCase().replace(/[^a-z0-9_]+/g, '_');

const MENSAJE_TRABAJO =
  'Tarea de la oficina: {tarea}. Procesa como máximo {max_items} elemento(s). Tu parte: ';

/** Herramientas efectivas de un agente: las del catálogo que pidió + las que exige su rol/colecciones. */
function herramientasDe(
  a: AgenteBorrador,
  b: BorradorCompleto,
  integraciones: Map<string, PaqueteOficina['integraciones'][number]>,
): string[] {
  const t = new Set<string>(['kb_buscar', 'kb_leer']);
  for (const h of [...a.herramientas, ...(a.es_qa ? [] : b.herramientas)]) {
    if (HERRAMIENTAS_GENERICAS.includes(h)) t.add(h);
    else if (h !== 'web_search' && estadoIntegracion(h) === 'requiere_herramienta_nueva')
      integraciones.set(h, {
        nombre: h,
        descripcion: `Herramienta «${h}» pedida por el asistente`,
        entrada: '',
        salida: '',
        estado: 'requiere_herramienta_nueva',
      });
  }
  if (b.colecciones.length > 0) {
    t.add('coleccion_listar');
    t.add('coleccion_buscar');
    t.add('coleccion_upsert');
  }
  return [...t];
}

/** Compila el borrador a un paquete válido (workflow, prompts, planta 3D, candados). No toca la base. */
export function compilarBorrador(
  db: Db,
  parcial: BorradorParcial,
  relajados: string[] = [],
): Compilado {
  const vacio: Compilado = {
    paquete: null,
    errores: [],
    advertencias: [],
    integraciones: [],
    lotes: 0,
  };
  const r = borradorCompleto.safeParse(parcial);
  if (!r.success)
    return {
      ...vacio,
      errores: [
        ...new Set(r.error.issues.map((i) => `${i.path.join('.') || 'borrador'}: ${i.message}`)),
      ],
    };
  const b = r.data;
  const todosRelajados = [...new Set([...relajados, ...b.relajar_candados])];
  const topes = topesPara(todosRelajados);
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (b.agentes.length > topes.max_agentes)
    errores.push(`Máximo ${topes.max_agentes} agentes (candado de topes de consumo)`);
  if (b.items_max > topes.max_items)
    errores.push(`Máximo ${topes.max_items} elementos por corrida (candado de topes de consumo)`);
  const productores = b.agentes.filter((a) => !a.es_qa);
  if (productores.length === 0)
    errores.push('Se necesita al menos un agente que haga el trabajo (no solo QA)');
  if (errores.length > 0) return { ...vacio, errores };

  // Identidad del piso y del equipo (paridad 50/50 en los que no traen género).
  const ids = new Set<string>();
  const agentes = b.agentes.map((a) => {
    let id = idAgente(a.rol);
    for (let n = 2; ids.has(id.toLowerCase()); n++) id = `${idAgente(a.rol).slice(0, 36)}-${n}`;
    ids.add(id.toLowerCase());
    return { ...a, id };
  });
  const idOficina = idDesdeNombre(db, b.nombre);
  const equipo = resolverEquipo(
    agentes.map((a) => ({
      id: a.id,
      persona: a.persona,
      genero: a.genero,
      rol: a.rol,
      area: a.area,
      tarea: a.tarea,
    })),
    idOficina,
  );
  let planta;
  try {
    planta = generarDefinicion({ id: idOficina, nombre: b.nombre }, equipo);
  } catch (e) {
    return { ...vacio, errores: [e instanceof Error ? e.message : String(e)] };
  }

  const integraciones = new Map<string, PaqueteOficina['integraciones'][number]>();
  for (const i of b.integraciones)
    integraciones.set(i.nombre, { ...i, estado: 'requiere_herramienta_nueva' });
  const porAgente = new Map(agentes.map((a) => [a.id, herramientasDe(a, b, integraciones)]));
  const usadas = [...new Set([...porAgente.values()].flat())];
  if (usadas.some(esDeArchivos))
    advertencias.push(
      'Usa herramientas de archivos: el dueño debe autorizar carpetas y activarlas en Configuración antes de correr.',
    );
  if (usadas.includes('notificar_interno'))
    advertencias.push(
      'Los avisos por correo requieren activar el correo del piso (si no, solo salen en la Actividad).',
    );

  // Workflow: lotes en orden; con QA, rondas «revisión → corrección» acotadas por devoluciones_max.
  const pasos: Record<string, unknown> = {};
  for (const a of agentes) {
    const tools = porAgente.get(a.id)!;
    pasos[clavePrompt(a.id)] = {
      agente: a.id,
      roles: [a.rol],
      prompts: [clavePrompt(a.id)],
      herramientas: tools,
      web: a.web,
      max_turnos: Math.min(topes.max_turnos, 10),
      ...(tools.includes('obscura_extract') || a.web
        ? { max_lecturas: Math.min(topes.max_lecturas, 8) }
        : {}),
    };
  }
  const lote = (id: string, a: { id: string; tarea: string }, extra = '') => ({
    tipo: 'lote',
    id,
    paso: clavePrompt(a.id),
    items: 'SELECT 1',
    solo_agrupado: false,
    mensaje: `${MENSAJE_TRABAJO}${a.tarea}${extra}`,
  });
  const trabajadores = agentes.filter((a) => !a.es_qa);
  const fases: unknown[] = trabajadores.map((p) => lote(`trabajo-${clavePrompt(p.id)}`, p));
  const responsable = trabajadores.at(-1)!;
  const revisores = agentes.filter((a) => a.es_qa);
  if (revisores.length > 0) {
    const revisar = (ronda: number) =>
      revisores.map((q) =>
        lote(
          `revision-${ronda}-${clavePrompt(q.id)}`,
          q,
          ' Si algo no cumple, anota "REVISAR: motivo" en la nota del registro (coleccion_upsert) o avisa con notificar_interno.',
        ),
      );
    fases.push(...revisar(0));
    for (let ronda = 1; ronda <= b.devoluciones_max; ronda++) {
      fases.push(
        lote(
          `correccion-${ronda}`,
          responsable,
          ' Corrige SOLO lo marcado con "REVISAR:" y deja en la nota "Corregido: lo que cambiaste".',
        ),
        ...revisar(ronda),
      );
    }
  }
  const lotes = fases.length;
  const workflow = {
    version: 1,
    office_id: idOficina,
    titulo: b.nombre,
    coordinador: agentes[0]!.id,
    entidad_item: 'item',
    tope_items: 'max_items',
    topes: {
      pasos_por_item: Math.min(Math.max(lotes, 2), topes.pasos_por_item * 2),
      pasos_extra: 2,
      max_repeticiones_paso: b.devoluciones_max + 2,
    },
    variables: {},
    mensajes: { item: 'tarea={tarea}' },
    resultados: { hecho: 'Hechos', incompleta: 'Incompletas' },
    progreso: [
      {
        id: 'pasos',
        etiqueta: 'Pasos ejecutados',
        sql: 'SELECT COUNT(*) FROM salidas_agente WHERE corrida_id=:corrida',
      },
    ],
    pasos,
    fases,
  };

  const paquete: PaqueteOficina = {
    formato: FORMATO_PAQUETE,
    version: 1,
    office: {
      nombre: b.nombre,
      descripcion: b.descripcion || b.objetivo.slice(0, 300),
      icono: b.icono,
    },
    agentes: equipo.map((e) => ({
      id: e.id,
      nombre_ui: e.persona,
      persona: e.persona,
      genero: e.genero,
      rol: e.rol,
      area: e.area,
    })),
    workflow,
    prompts: {
      global: promptComun(b),
      agentes: Object.fromEntries(
        agentes.map((a) => [clavePrompt(a.id), promptDeAgente(a, b, porAgente.get(a.id)!)]),
      ),
    },
    habilidades: [],
    kb: b.kb.map((d) => ({
      tipo: d.tipo,
      titulo: d.titulo,
      contenido_md: d.contenido_md,
      tags: '',
    })),
    colecciones: b.colecciones,
    planta,
    apariencias: [],
    herramientas: usadas,
    candados: { relajados: todosRelajados },
    integraciones: [...integraciones.values()],
  };
  const v = validarPaquete(db, paquete, idOficina);
  return {
    paquete: v.ok ? v.paquete! : null,
    errores: v.errores,
    advertencias: [...advertencias, ...v.advertencias],
    integraciones: paquete.integraciones,
    lotes,
  };
}

/** Estimado de consumo de UNA corrida de prueba (sin historial: referencia conservadora, ponderada). */
export const TOKENS_LOTE_BASE = 14_000;
export const TOKENS_POR_ELEMENTO_LOTE = 5_000;
export function estimarPrueba(lotes: number, items: number): number {
  return lotes * (TOKENS_LOTE_BASE + TOKENS_POR_ELEMENTO_LOTE * items);
}
