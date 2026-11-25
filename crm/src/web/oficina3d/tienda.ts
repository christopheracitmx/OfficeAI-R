/**
 * Estado vivo de la oficina 3D fuera de React (para leerlo en useFrame sin re-render):
 * registros por agente, caminatas con expediente, pausa, selección y rotación de cámara.
 * Los componentes de UI se suscriben con `useTienda(selector)`.
 */
import { useSyncExternalStore } from 'react';
import { rutaEntre, type DefinicionOficina } from '../../shared/oficina3d/definicion';
import {
  interpretarEvento,
  type EventoOficina,
  type RegistroAgente,
  type Traslado,
} from '../../shared/oficina3d/eventos';

export interface Caminata extends Traslado {
  ruta: [number, number][];
  /** performance.now() al iniciar. */
  t0: number;
  /** Duración de ida en segundos (la vuelta dura lo mismo). */
  ida: number;
}

export interface EstadoTienda {
  registros: Record<string, RegistroAgente>;
  caminatas: Record<string, Caminata>;
  enPausa: boolean;
  seleccionado: string | null;
  rotacion: number;
  /** Zoom cercano: se muestran los nombres de todos. */
  detalle: boolean;
  /** Encuadre pedido por el dueño (centro en celdas y múltiplo del zoom general); `n` distingue pedidos repetidos. */
  encuadre: { x: number; z: number; k: number; n: number } | null;
  feed: (EventoOficina & { burbuja: string })[];
}

export const VELOCIDAD = 1.6; // celdas por segundo

function largo(r: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < r.length; i++) {
    const [a, b] = [r[i - 1]!, r[i]!];
    l += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return l;
}

export class Tienda {
  private estado: EstadoTienda = {
    registros: {},
    caminatas: {},
    enPausa: true,
    seleccionado: null,
    rotacion: 0,
    detalle: false,
    encuadre: null,
    feed: [],
  };
  private oyentes = new Set<() => void>();
  constructor(
    public def: DefinicionOficina | null = null,
    public movimientoReducido = false,
  ) {}

  definir(d: DefinicionOficina | null): void {
    this.def = d;
  }

  get = (): EstadoTienda => this.estado;
  suscribir = (f: () => void): (() => void) => {
    this.oyentes.add(f);
    return () => this.oyentes.delete(f);
  };
  set(parcial: Partial<EstadoTienda>): void {
    this.estado = { ...this.estado, ...parcial };
    this.oyentes.forEach((f) => f());
  }

  /** Aplica un evento SSE real: estado del agente, burbuja, feed y traslado del expediente. */
  evento(e: EventoOficina, presentacion: boolean, ahora = Date.now()): void {
    const d = this.def;
    if (!d) return;
    const i = interpretarEvento(e, d.flujo, presentacion);
    const registros = {
      ...this.estado.registros,
      [i.agente]: { estado: i.estado, burbuja: i.burbuja, t: ahora },
    };
    const caminatas = { ...this.estado.caminatas };
    const tr = i.traslado;
    if (tr && !caminatas[tr.de] && !this.movimientoReducido) {
      const pd = d.agentes.find((a) => a.id === tr.de)?.puesto;
      const pa = d.agentes.find((a) => a.id === tr.a)?.puesto;
      const ruta = pd && pa ? rutaEntre(d, pd, pa) : [];
      if (ruta.length >= 2) {
        // Se detiene a un lado del puesto destino.
        const ult = ruta[ruta.length - 1]!;
        ruta[ruta.length - 1] = [ult[0] + 0.7, ult[1]];
        caminatas[tr.de] = { ...tr, ruta, t0: performance.now(), ida: largo(ruta) / VELOCIDAD };
      }
    }
    const feed = [{ ...e, burbuja: i.burbuja }, ...this.estado.feed].slice(0, 14);
    this.set({ registros, caminatas, feed });
  }

  terminarCaminata(agente: string): void {
    if (!this.estado.caminatas[agente]) return;
    const caminatas = { ...this.estado.caminatas };
    delete caminatas[agente];
    this.set({ caminatas });
  }
}

export function useTienda<T>(t: Tienda, sel: (e: EstadoTienda) => T): T {
  return useSyncExternalStore(t.suscribir, () => sel(t.get()));
}

/** Posición (x, z) y rumbo a lo largo de la caminata; null si terminó. */
export function puntoCaminata(
  c: Caminata,
  ahoraMs: number,
): { x: number; z: number; rumbo: number; ida: boolean } | null {
  const t = (ahoraMs - c.t0) / 1000;
  const pausa = 0.6;
  if (t > c.ida * 2 + pausa) return null;
  const ida = t < c.ida + pausa / 2;
  let dist = ida ? Math.min(t, c.ida) * VELOCIDAD : Math.max(0, c.ida * 2 + pausa - t) * VELOCIDAD;
  for (let i = 1; i < c.ruta.length; i++) {
    const [a, b] = [c.ruta[i - 1]!, c.ruta[i]!];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (dist <= l || i === c.ruta.length - 1) {
      const f = l > 0 ? Math.min(1, dist / l) : 1;
      const dx = (b[0] - a[0]) * (ida ? 1 : -1);
      const dz = (b[1] - a[1]) * (ida ? 1 : -1);
      return {
        x: a[0] + (b[0] - a[0]) * f,
        z: a[1] + (b[1] - a[1]) * f,
        rumbo: Math.atan2(-dx, -dz),
        ida,
      };
    }
    dist -= l;
  }
  return null;
}
