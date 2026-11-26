/**
 * Oficina (piso) activa de TODA la app: la elige el selector de piso (barra lateral y «Ver oficina»)
 * y viaja en cada petición como encabezado `x-office-id`. Se recuerda en el navegador.
 */
import { useSyncExternalStore } from 'react';

export const OFICINA_PRINCIPAL = 'prospeccion';
const CLAVE = 'oficina.activa';

function leer(): string {
  try {
    const v = localStorage.getItem(CLAVE);
    return v && /^[a-z0-9_-]{2,40}$/.test(v) ? v : OFICINA_PRINCIPAL;
  } catch {
    return OFICINA_PRINCIPAL;
  }
}

let activa = leer();
const oyentes = new Set<() => void>();

export const oficinaActiva = (): string => activa;

export function fijarOficinaActiva(id: string): void {
  if (id === activa) return;
  activa = id;
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    /* sin almacenamiento: solo se pierde la preferencia */
  }
  oyentes.forEach((f) => f());
}

export function useOficinaActiva(): string {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => activa,
  );
}
