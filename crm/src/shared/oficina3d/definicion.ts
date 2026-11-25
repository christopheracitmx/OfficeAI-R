/**
 * Definición de una oficina 3D (un piso): office + planta + salas + puestos + agentes, cada uno con
 * su `apariencia`. La escena se construye SOLO desde este JSON validado; el Constructor de oficinas
 * y el Personalizador producirán/editarán este mismo formato.
 * Coordenadas en celdas de la cuadrícula (1 celda = 1 unidad de la escena), origen en la esquina
 * noroeste de la planta; x crece al este, z al sur.
 */
import { z } from 'zod';
import { aparienciaOficina, aparienciaPersonaje, aparienciaSala, GENEROS } from './apariencia';

export const TIPOS_SALA = [
  'recepcion',
  'area',
  'direccion',
  'biblioteca',
  'aprendizaje',
  'cafeteria',
] as const;
export const ACCIONES_SALA = ['biblioteca', 'aprendizaje'] as const;
export const LADOS = ['n', 's', 'e', 'o'] as const;
const id = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[\w.\- ]+$/);

export const salaDef = z.object({
  id,
  nombre: z.string().min(1).max(60),
  tipo: z.enum(TIPOS_SALA),
  x: z.number().int().min(0),
  z: z.number().int().min(0),
  puerta: z.object({ lado: z.enum(LADOS), pos: z.number().min(0.5) }),
  accion: z.enum(ACCIONES_SALA).nullable().default(null),
  apariencia: aparienciaSala,
});
export type SalaDef = z.infer<typeof salaDef>;

export const puestoDef = z.object({
  id,
  sala: id,
  x: z.number().min(0),
  z: z.number().min(0),
  rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});
export type PuestoDef = z.infer<typeof puestoDef>;

export const agenteDef = z.object({
  id,
  persona: z.string().min(1).max(40),
  genero: z.enum(GENEROS),
  rol: z.string().min(1).max(40),
  tarea: z.string().max(80).default(''),
  area: z.string().max(40),
  puesto: id,
  apariencia: aparienciaPersonaje,
});
export type AgenteDef3d = z.infer<typeof agenteDef>;

export const definicionOficina = z
  .object({
    version: z.literal(1),
    office: z.object({
      id,
      nombre: z.string().min(1).max(80),
      logo: z.string().max(200).nullable(),
      piso: z.number().int().min(1).max(60),
      apariencia: aparienciaOficina,
    }),
    planta: z.object({
      ancho: z.number().int().min(8).max(80),
      fondo: z.number().int().min(8).max(80),
      pasilloZ: z.number().min(0),
    }),
    salas: z.array(salaDef).min(1).max(30),
    puestos: z.array(puestoDef).max(40),
    agentes: z.array(agenteDef).max(40),
    /** Orden del expediente (ids de agente) cuando un evento no indica destino. */
    flujo: z.array(id).max(40),
  })
  .superRefine((d, ctx) => {
    const err = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });
    const dup = (lista: { id: string }[], nombre: string) => {
      const vistos = new Set<string>();
      lista.forEach((x, i) => {
        if (vistos.has(x.id)) err(`${nombre} duplicado: ${x.id}`, [nombre, i, 'id']);
        vistos.add(x.id);
      });
    };
    dup(d.salas, 'salas');
    dup(d.puestos, 'puestos');
    dup(d.agentes, 'agentes');
    const salas = new Map(d.salas.map((s) => [s.id, s]));
    d.salas.forEach((s, i) => {
      const { ancho, fondo } = s.apariencia;
      if (s.x + ancho > d.planta.ancho || s.z + fondo > d.planta.fondo)
        err(`La sala ${s.id} se sale de la planta`, ['salas', i]);
      const largo = s.puerta.lado === 'n' || s.puerta.lado === 's' ? ancho : fondo;
      if (s.puerta.pos > largo - 0.5) err(`Puerta fuera de la pared en ${s.id}`, ['salas', i]);
      d.salas.slice(i + 1).forEach((o) => {
        const a = o.apariencia;
        const traslape =
          s.x < o.x + a.ancho && o.x < s.x + ancho && s.z < o.z + a.fondo && o.z < s.z + fondo;
        if (traslape) err(`Las salas ${s.id} y ${o.id} se traslapan`, ['salas', i]);
      });
    });
    d.puestos.forEach((p, i) => {
      const s = salas.get(p.sala);
      if (!s) return err(`Sala inexistente: ${p.sala}`, ['puestos', i, 'sala']);
      if (p.x > s.apariencia.ancho - 0.5 || p.z > s.apariencia.fondo - 0.5)
        err(`El puesto ${p.id} queda fuera de ${s.id}`, ['puestos', i]);
    });
    const puestos = new Set(d.puestos.map((p) => p.id));
    const ocupados = new Set<string>();
    d.agentes.forEach((a, i) => {
      if (!puestos.has(a.puesto)) err(`Puesto inexistente: ${a.puesto}`, ['agentes', i, 'puesto']);
      if (ocupados.has(a.puesto)) err(`Puesto ocupado dos veces: ${a.puesto}`, ['agentes', i]);
      ocupados.add(a.puesto);
    });
    const agentes = new Set(d.agentes.map((a) => a.id));
    d.flujo.forEach((f, i) => {
      if (!agentes.has(f)) err(`Agente inexistente en flujo: ${f}`, ['flujo', i]);
    });
  });
export type DefinicionOficina = z.infer<typeof definicionOficina>;

/** Centro (en coordenadas de planta) de un puesto. */
export function posPuesto(d: DefinicionOficina, puestoId: string): [number, number] | null {
  const p = d.puestos.find((x) => x.id === puestoId);
  const s = p && d.salas.find((x) => x.id === p.sala);
  return p && s ? [s.x + p.x, s.z + p.z] : null;
}

/** Punto justo dentro y fuera de la puerta de una sala. */
export function puertaSala(s: SalaDef): { dentro: [number, number]; fuera: [number, number] } {
  const { ancho, fondo } = s.apariencia;
  const p = s.puerta.pos;
  switch (s.puerta.lado) {
    case 'n':
      return { dentro: [s.x + p, s.z + 0.8], fuera: [s.x + p, s.z - 0.8] };
    case 's':
      return { dentro: [s.x + p, s.z + fondo - 0.8], fuera: [s.x + p, s.z + fondo + 0.8] };
    case 'o':
      return { dentro: [s.x + 0.8, s.z + p], fuera: [s.x - 0.8, s.z + p] };
    default:
      return { dentro: [s.x + ancho - 0.8, s.z + p], fuera: [s.x + ancho + 0.8, s.z + p] };
  }
}

/**
 * Ruta a pie (polilínea en planta) entre dos puestos: puesto → puerta → pasillo → puerta → puesto.
 * Si ambos puestos están en la misma sala va directo.
 */
export function rutaEntre(d: DefinicionOficina, de: string, a: string): [number, number][] {
  const pd = d.puestos.find((x) => x.id === de);
  const pa = d.puestos.find((x) => x.id === a);
  const sd = pd && d.salas.find((s) => s.id === pd.sala);
  const sa = pa && d.salas.find((s) => s.id === pa.sala);
  const o = posPuesto(d, de);
  const f = posPuesto(d, a);
  if (!o || !f || !sd || !sa) return [];
  if (sd.id === sa.id) return [o, f];
  const p1 = puertaSala(sd);
  const p2 = puertaSala(sa);
  const z = d.planta.pasilloZ;
  return [o, p1.dentro, p1.fuera, [p1.fuera[0], z], [p2.fuera[0], z], p2.fuera, p2.dentro, f];
}
