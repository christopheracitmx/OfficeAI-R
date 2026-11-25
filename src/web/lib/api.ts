import { useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* no JSON */
  }
  if (!res.ok)
    throw new ApiError(
      res.status,
      (json as { error?: string } | null)?.error ?? `Error ${res.status}`,
    );
  return json as T;
}

export interface UseApi<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface Resultado<T> {
  path: string;
  data: T | null;
  error: string | null;
}

/** Carga datos con estados loading/error y recarga manual o periódica. */
export function useApi<T>(path: string, opts?: { refreshMs?: number }): UseApi<T> {
  const [res, setRes] = useState<Resultado<T> | null>(null);
  const [tick, setTick] = useState(0);
  const refreshMs = opts?.refreshMs;

  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      api<T>(path)
        .then((d) => vivo && setRes({ path, data: d, error: null }))
        .catch((e: unknown) => {
          if (!vivo) return;
          const msg = e instanceof Error ? e.message : 'Error desconocido';
          setRes((prev) => ({ path, data: prev?.path === path ? prev.data : null, error: msg }));
        });
    };
    cargar();
    let t: ReturnType<typeof setInterval> | undefined;
    if (refreshMs) t = setInterval(cargar, refreshMs);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [path, refreshMs, tick]);

  const actual = res && res.path === path ? res : null;
  return {
    data: actual?.data ?? null,
    loading: actual === null,
    error: actual?.error ?? null,
    reload: () => setTick((n) => n + 1),
  };
}

export interface EventoActividad {
  id: number;
  corrida_id: number | null;
  agente: string;
  accion: string;
  entidad: string | null;
  entidad_id: number | null;
  detalle: string | null;
  creado_en: string;
}

/** Suscripción SSE a la actividad de agentes (alimenta "Ver oficina"). */
export function useEventosEnVivo(onEvento: (e: EventoActividad) => void): boolean {
  const [conectado, setConectado] = useState(false);
  const cb = useRef(onEvento);
  useEffect(() => {
    cb.current = onEvento;
  });
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setConectado(true);
    es.onerror = () => setConectado(false);
    es.addEventListener('actividad', (m) =>
      cb.current(JSON.parse((m as MessageEvent<string>).data) as EventoActividad),
    );
    return () => es.close();
  }, []);
  return conectado;
}
