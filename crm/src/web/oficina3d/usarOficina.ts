/** Datos vivos de la oficina 3D: definición (desde /api/agentes), SSE real, estado del runner y pausa. */
import { useCallback, useEffect, useState } from 'react';
import {
  CALIDADES,
  esNoche,
  type AparienciaOficina,
  type Calidad,
} from '../../shared/oficina3d/apariencia';
import { oficinaEnPausa } from '../../shared/oficina3d/eventos';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { useOficinaActiva } from '../lib/oficinaActiva';
import { useApi, useEventosEnVivo, type EventoActividad } from '../lib/api';
import type { EstadoApp } from '../lib/types';
import { compartir } from './compartir';
import { Tienda } from './tienda';

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, v: string): void {
  try {
    localStorage.setItem(clave, v);
  } catch {
    /* almacenamiento no disponible: solo se pierde la preferencia */
  }
}

export function movimientoReducido(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export function hayWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

type CicloVista = 'dia' | 'noche' | 'auto';

/**
 * Preferencias del visor. Lo que el visitante elige en los controles se recuerda en este navegador y
 * gana; si no ha elegido nada, valen la calidad y el ciclo día/noche de la oficina (Personalizar).
 */
export function usePreferencias(ap?: Pick<AparienciaOficina, 'ciclo' | 'hora' | 'calidad'>) {
  const [calidadLocal, setCalidadE] = useState<Calidad | null>(() => {
    const v = leer('oficina3d.calidad');
    return (CALIDADES as readonly string[]).includes(v ?? '') ? (v as Calidad) : null;
  });
  const [cicloLocal, setCicloE] = useState<CicloVista | null>(() => {
    const v = leer('oficina3d.ciclo');
    return v === 'dia' || v === 'noche' || v === 'auto' ? v : null;
  });
  const setCalidad = (c: Calidad) => {
    setCalidadE(c);
    guardar('oficina3d.calidad', c);
  };
  const setCiclo = (c: CicloVista) => {
    setCicloE(c);
    guardar('oficina3d.ciclo', c);
  };
  const calidad = calidadLocal ?? ap?.calidad ?? 'alta';
  const hora = new Date().getHours();
  const noche = cicloLocal
    ? cicloLocal === 'noche' || (cicloLocal === 'auto' && (hora >= 19 || hora < 7))
    : ap
      ? esNoche(ap, hora)
      : false;
  const ciclo: CicloVista =
    cicloLocal ?? (ap?.ciclo === 'noche' ? 'noche' : !ap || ap.ciclo === 'dia' ? 'dia' : 'auto');
  return { calidad, setCalidad, ciclo, setCiclo, noche };
}

export function useOficina(presentacion: boolean) {
  const oficinaId = useOficinaActiva();
  // La planta la entrega el servidor (esquema zod validado); el roster sigue siendo el de la oficina activa.
  const planta = useApi<DefinicionOficina>(`/oficinas/${oficinaId}/definicion`);
  const estado = useApi<EstadoApp>('/estado', { refreshMs: 6000 });
  // Se conserva la identidad de lo que no cambió (solo se reconstruye lo modificado).
  const [estable, setEstable] = useState<{
    fuente: DefinicionOficina | null;
    def: DefinicionOficina | null;
  }>({ fuente: null, def: null });
  if (estable.fuente !== planta.data)
    setEstable({
      fuente: planta.data,
      def: planta.data ? compartir(estable.def, planta.data) : null,
    });
  const def = estable.def;
  const [tienda] = useState(() => new Tienda(null, movimientoReducido()));
  useEffect(() => {
    tienda.definir(def);
  }, [tienda, def]);

  const alEvento = useCallback(
    (e: EventoActividad) => tienda.evento(e, presentacion),
    [tienda, presentacion],
  );
  const conectado = useEventosEnVivo(alEvento, oficinaId);

  const corridaActiva = !!estado.data?.corrida_activa || !!estado.data?.runner?.activo;
  useEffect(() => {
    const revisar = () => {
      const p = oficinaEnPausa(corridaActiva, tienda.get().registros, Date.now());
      if (p !== tienda.get().enPausa) tienda.set({ enPausa: p });
    };
    revisar();
    const id = setInterval(revisar, 2000);
    return () => clearInterval(id);
  }, [tienda, corridaActiva]);

  return { def, tienda, conectado, estado, agentes: planta };
}
