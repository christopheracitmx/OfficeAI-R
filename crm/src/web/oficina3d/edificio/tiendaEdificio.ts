/** Estado vivo del edificio 3D fuera de React (se lee en useFrame sin re-render). */
export class TiendaEdificio {
  /** Última actividad (ms) por oficina, según los eventos SSE. */
  vivo: Record<string, number> = {};
  hover: string | null = null;
  /** Piso al que la cámara está entrando. */
  entrando: string | null = null;

  sobre(id: string | null): void {
    this.hover = id;
  }

  entrar(id: string | null): void {
    this.entrando = id;
  }

  actividad(officeId: string, ahora = Date.now()): void {
    this.vivo[officeId] = ahora;
  }

  /** ¿Hubo actividad en los últimos `ms`? */
  reciente(officeId: string, ms = 10000, ahora = Date.now()): boolean {
    return ahora - (this.vivo[officeId] ?? 0) < ms;
  }
}
