/** Datos vivos de la oficina 3D: definición (desde /api/agentes), SSE real, estado del runner y pausa. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CALIDADES, type Calidad } from '../../shared/oficina3d/apariencia';
import { oficinaEnPausa } from '../../shared/oficina3d/eventos';
import { definicionProspeccion } from '../../shared/oficina3d/prospeccion';
import { useApi, useEventosEnVivo, type EventoActividad } from '../lib/api';
import type { AgenteFila, EstadoApp } from '../lib/types';
import { Tienda } from './tienda';

export const OFICINA_ID = 'prospeccion';

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

/** Preferencias locales del visor (no son datos de la oficina). */
export function usePreferencias() {
  const [calidad, setCalidadE] = useState<Calidad>(() => {
    const v = leer('oficina3d.calidad');
    return (CALIDADES as readonly string[]).includes(v ?? '') ? (v as Calidad) : 'alta';
  });
  const [ciclo, setCicloE] = useState<'dia' | 'noche' | 'auto'>(() => {
    const v = leer('oficina3d.ciclo');
    return v === 'noche' || v === 'auto' ? v : 'dia';
  });
  const setCalidad = (c: Calidad) => {
    setCalidadE(c);
    guardar('oficina3d.calidad', c);
  };
  const setCiclo = (c: 'dia' | 'noche' | 'auto') => {
    setCicloE(c);
    guardar('oficina3d.ciclo', c);
  };
  const hora = new Date().getHours();
  const noche = ciclo === 'noche' || (ciclo === 'auto' && (hora >= 19 || hora < 7));
  return { calidad, setCalidad, ciclo, setCiclo, noche };
}

export function useOficina(presentacion: boolean) {
  const agentes = useApi<AgenteFila[]>(`/agentes?office_id=${OFICINA_ID}`);
  const estado = useApi<EstadoApp>('/estado', { refreshMs: 6000 });
  const def = useMemo(
    () => (agentes.data ? definicionProspeccion(agentes.data) : null),
    [agentes.data],
  );
  const [tienda] = useState(() => new Tienda(null, movimientoReducido()));
  useEffect(() => {
    tienda.definir(def);
  }, [tienda, def]);

  const alEvento = useCallback(
    (e: EventoActividad) => tienda.evento(e, presentacion),
    [tienda, presentacion],
  );
  const conectado = useEventosEnVivo(alEvento, OFICINA_ID);

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

  return { def, tienda, conectado, estado, agentes };
}
