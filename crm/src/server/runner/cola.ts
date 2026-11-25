import type { EjecutarAgenteFn, ResultadoAgente } from './types';

export interface EstadoCola {
  /** Hay una llamada de IA en curso en el edificio. */
  usando: boolean;
  /** Oficina que tiene el turno ahora. */
  oficina: string | null;
  esperando: number;
  /** Máximo de llamadas simultáneas observadas (debe ser 1). */
  maximo_simultaneas: number;
}

interface Espera {
  oficina: string;
  listo: (liberar: (() => void) | null) => void;
}

/**
 * Cola global del edificio: SOLO UNA llamada de IA a la vez en todas las oficinas (cuida el plan y la
 * reserva, que son globales). FIFO; una espera abortada sale de la cola sin consumir turno.
 */
export class ColaIa {
  private ocupada = false;
  private oficina: string | null = null;
  private fila: Espera[] = [];
  private maximo = 0;
  private enUso = 0;

  estado(): EstadoCola {
    return {
      usando: this.ocupada,
      oficina: this.oficina,
      esperando: this.fila.length,
      maximo_simultaneas: this.maximo,
    };
  }

  private adquirir(oficina: string, signal?: AbortSignal): Promise<(() => void) | null> {
    return new Promise((resolver) => {
      const entregar = (e: Espera): void => {
        this.ocupada = true;
        this.oficina = e.oficina;
        e.listo(() => {
          this.ocupada = false;
          this.oficina = null;
          const sig = this.fila.shift();
          if (sig) entregar(sig);
        });
      };
      const espera: Espera = { oficina, listo: resolver };
      if (!this.ocupada) return entregar(espera);
      this.fila.push(espera);
      signal?.addEventListener(
        'abort',
        () => {
          const i = this.fila.indexOf(espera);
          if (i >= 0) {
            this.fila.splice(i, 1);
            resolver(null);
          }
        },
        { once: true },
      );
    });
  }

  /** Envuelve el motor: toda llamada pasa por la cola global. */
  envolver(ejecutar: EjecutarAgenteFn): EjecutarAgenteFn {
    return async (i) => {
      if (i.signal?.aborted) return abortada();
      const liberar = await this.adquirir(i.officeId, i.signal);
      if (!liberar) return abortada();
      this.enUso++;
      this.maximo = Math.max(this.maximo, this.enUso);
      try {
        return await ejecutar(i);
      } finally {
        this.enUso--;
        liberar();
      }
    };
  }
}

function abortada(): ResultadoAgente {
  return { ok: false, salida: '', abortado: true, error: 'Detenida mientras esperaba su turno' };
}
