/**
 * Plano de la oficina: validación del layout (traslapes, límites, puestos, pasillo y puertas) y
 * distribución de puestos dentro de una sala. Puro: lo usan el servidor (al guardar) y el editor
 * de plano de la UI (validación en vivo con el MISMO código).
 */
import { z } from 'zod';
import {
  definicionOficina,
  puertaSala,
  type DefinicionOficina,
  type PuestoDef,
  type SalaDef,
} from './definicion';

export const DISTRIBUCIONES = ['fila', 'doble_fila', 'cuadricula'] as const;
export type Distribucion = (typeof DISTRIBUCIONES)[number];
export const ETQ_DISTRIBUCION: Record<Distribucion, string> = {
  fila: 'Una fila',
  doble_fila: 'Dos filas',
  cuadricula: 'Cuadrícula',
};

/** Ajuste de puestos de una sala: cuántos y cómo se reparten. */
export const ajustePuestos = z.object({
  cantidad: z.number().int().min(0).max(12),
  distribucion: z.enum(DISTRIBUCIONES),
});
export type AjustePuestos = z.infer<typeof ajustePuestos>;

const SEPARACION = 2.6;
const MARGEN_PASILLO = 0.6;

/** Filas (valores z dentro de la sala) disponibles según la distribución. */
function filasDe(fondo: number, dist: Distribucion): number[] {
  const z1 = Math.min(2.6, fondo - 1);
  const z2 = Math.min(5.4, fondo - 1);
  if (dist === 'fila') return [z1];
  if (dist === 'doble_fila') return fondo >= 6.5 ? [z1, z2] : [fondo * 0.33, fondo * 0.7];
  return fondo >= 8.5 ? [z1, z2, Math.min(8.2, fondo - 1)] : [z1, z2];
}

/** Capacidad máxima de puestos de una sala para una distribución. */
export function capacidadPuestos(ancho: number, fondo: number, dist: Distribucion): number {
  return filasDe(fondo, dist).length * Math.max(1, Math.floor(ancho / SEPARACION));
}

/**
 * Reparte `cantidad` puestos en la sala. Conserva los ids existentes (primero los ocupados) para no
 * romper a los agentes; los puestos sobrantes (sin agente) desaparecen y los faltantes se crean.
 * Devuelve null si la cantidad no cabe o es menor que los puestos ocupados.
 */
export function distribuirPuestos(
  sala: SalaDef,
  todos: PuestoDef[],
  ocupados: ReadonlySet<string>,
  ajuste: AjustePuestos,
): PuestoDef[] | null {
  const { ancho, fondo } = sala.apariencia;
  const propios = todos.filter((p) => p.sala === sala.id);
  const usados = propios.filter((p) => ocupados.has(p.id));
  if (ajuste.cantidad < usados.length) return null;
  if (ajuste.cantidad > capacidadPuestos(ancho, fondo, ajuste.distribucion)) return null;
  const filas = filasDe(fondo, ajuste.distribucion);
  const porFila = Math.ceil(ajuste.cantidad / filas.length) || 1;
  const ids = [
    ...usados.sort((a, b) => a.x - b.x).map((p) => p.id),
    ...propios
      .filter((p) => !ocupados.has(p.id))
      .sort((a, b) => a.x - b.x)
      .map((p) => p.id),
  ];
  const tomados = new Set(todos.map((p) => p.id));
  let n = 1;
  const siguiente = (): string => {
    while (tomados.has(`${sala.id}-${n}`)) n++;
    const id = `${sala.id}-${n}`;
    tomados.add(id);
    return id;
  };
  const nuevos: PuestoDef[] = [];
  for (let i = 0; i < ajuste.cantidad; i++) {
    const fila = Math.floor(i / porFila);
    const col = i % porFila;
    const enFila = Math.min(porFila, ajuste.cantidad - fila * porFila);
    const x = Math.round((col + 0.5) * (ancho / enFila) * 10) / 10;
    nuevos.push({
      id: ids[i] ?? siguiente(),
      sala: sala.id,
      x: Math.min(x, ancho - 0.5),
      z: filas[fila]!,
      rot: 180,
    });
  }
  return nuevos;
}

export interface ResultadoPlano {
  errores: string[];
  avisos: string[];
}

const dentro = (px: number, pz: number, s: SalaDef, e = 0.05): boolean =>
  px > s.x + e &&
  px < s.x + s.apariencia.ancho - e &&
  pz > s.z + e &&
  pz < s.z + s.apariencia.fondo - e;

/** El tramo vertical que usa la ruta a pie (puerta → pasillo) no debe cruzar otra sala. */
function bloqueaRuta(d: DefinicionOficina, s: SalaDef): boolean {
  const [fx, fz] = puertaSala(s).fuera;
  const z0 = Math.min(fz, d.planta.pasilloZ);
  const z1 = Math.max(fz, d.planta.pasilloZ);
  return d.salas.some((o) => {
    if (o.id === s.id) return false;
    for (let z = z0; z <= z1; z += 0.25) if (dentro(fx, z, o)) return true;
    return false;
  });
}

/**
 * Valida el plano completo: el esquema (traslapes, límites, puertas, puestos) y las reglas de
 * circulación (el pasillo no puede quedar tapado por una sala, ni las puertas bloqueadas).
 */
export function validarPlano(d: unknown): ResultadoPlano {
  const p = definicionOficina.safeParse(d);
  if (!p.success)
    return {
      errores: [...new Set(p.error.issues.map((i) => i.message))],
      avisos: [],
    };
  const def = p.data;
  const errores: string[] = [];
  const avisos: string[] = [];
  const z = def.planta.pasilloZ;
  if (z > def.planta.fondo) errores.push('El pasillo queda fuera de la planta');
  for (const s of def.salas) {
    const { fondo } = s.apariencia;
    if (s.z < z + MARGEN_PASILLO && s.z + fondo > z - MARGEN_PASILLO)
      errores.push(`La sala ${s.id} bloquea el pasillo`);
    else if (bloqueaRuta(def, s))
      errores.push(`La puerta de ${s.id} queda bloqueada por otra sala`);
  }
  if (def.puestos.length < def.agentes.length) avisos.push('Hay más agentes que puestos');
  return { errores, avisos };
}

/** ¿El candidato añade errores que la base no tenía? (las bases ya imperfectas no bloquean ediciones). */
export function erroresNuevos(base: DefinicionOficina, candidato: DefinicionOficina): string[] {
  const previos = new Set(validarPlano(base).errores);
  return validarPlano(candidato).errores.filter((e) => !previos.has(e));
}
