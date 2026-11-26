import { useEffect } from 'react';
import type { OficinaResumen } from '../../shared/oficinas';
import { useApi, type UseApi } from './api';
import { fijarOficinaActiva, useOficinaActiva } from './oficinaActiva';

export type Oficina = OficinaResumen;

/** Pisos activos del edificio (con estado, agentes, última corrida y pendientes). */
export function useOficinas(refreshMs = 15000): UseApi<Oficina[]> {
  return useApi<Oficina[]>('/oficinas', { refreshMs });
}

/** Oficina activa resuelta contra la lista; si la guardada ya no existe o se archivó, vuelve a la primera. */
export function useOficinaActual(): { id: string; oficina: Oficina | null; lista: Oficina[] } {
  const id = useOficinaActiva();
  const { data } = useOficinas();
  const lista = data ?? [];
  const oficina = lista.find((o) => o.id === id) ?? null;
  useEffect(() => {
    if (data && data.length > 0 && !oficina) fijarOficinaActiva(data[0]!.id);
  }, [data, oficina]);
  return { id, oficina, lista };
}
