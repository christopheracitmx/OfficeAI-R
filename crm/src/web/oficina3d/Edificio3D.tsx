/** Vista «Edificio»: fachada 3D con los pisos apilados; clic en un piso y la cámara entra a esa oficina. */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { ErrorBanner, Skeleton, cx } from '../components/ui';
import { api, useEventosEnVivo, type EventoActividad } from '../lib/api';
import { useOficinaActiva } from '../lib/oficinaActiva';
import { useOficinas } from '../lib/useOficinas';
import { TiendaEdificio } from './edificio/tiendaEdificio';
import type { usePreferencias } from './usarOficina';

const EscenaEdificio = lazy(() => import('./edificio/EscenaEdificio'));

/** Plantas de los pisos, cargadas de una en una y solo las que faltan. */
function usePlantas(ids: string[]): Record<string, DefinicionOficina> {
  const [plantas, setPlantas] = useState<Record<string, DefinicionOficina>>({});
  const clave = ids.join(',');
  useEffect(() => {
    let vivo = true;
    for (const id of clave.split(',').filter(Boolean))
      if (!plantas[id])
        api<DefinicionOficina>(`/oficinas/${id}/definicion`)
          .then((d) => vivo && setPlantas((p) => ({ ...p, [id]: d })))
          .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // `plantas` se omite a propósito: solo se piden las que faltan al cambiar la lista de pisos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return plantas;
}

export function Edificio3D({
  pref,
  quieto,
  onEntrar,
}: {
  pref: ReturnType<typeof usePreferencias>;
  quieto: boolean;
  onEntrar: (id: string) => void;
}) {
  const oficinas = useOficinas(5000);
  const activo = useOficinaActiva();
  const [tienda] = useState(() => new TiendaEdificio());
  const [saliendo, setSaliendo] = useState(false);
  const lista = useMemo(() => oficinas.data ?? [], [oficinas.data]);
  const plantas = usePlantas(lista.map((o) => o.id));

  // Un solo flujo SSE sin filtro: cada evento trae su office_id y enciende la luz de su piso.
  const alEvento = useCallback(
    (e: EventoActividad) => e.office_id && tienda.actividad(e.office_id),
    [tienda],
  );
  const conectado = useEventosEnVivo(alEvento);

  const pisos = useMemo(
    () =>
      lista.map((o) => ({
        id: o.id,
        nombre: o.nombre,
        def: plantas[o.id] ?? null,
        corriendo: o.corrida_activa,
      })),
    [lista, plantas],
  );

  const entrar = (id: string) => {
    if (saliendo) return;
    tienda.entrar(id);
    setSaliendo(true);
  };
  const terminar = (id: string) => {
    tienda.entrar(null);
    onEntrar(id);
  };

  if (oficinas.error) return <ErrorBanner mensaje={oficinas.error} onRetry={oficinas.reload} />;
  if (!oficinas.data) return <Skeleton className="h-[600px] rounded-2xl" />;
  return (
    <div>
      <div
        className={cx(
          'relative h-[600px] overflow-hidden rounded-2xl bg-deep shadow-md transition-opacity duration-500',
          saliendo && 'opacity-60',
        )}
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-ice/70">
              Construyendo el edificio…
            </div>
          }
        >
          <EscenaEdificio
            pisos={pisos}
            activo={activo}
            calidad={pref.calidad}
            noche={pref.noche}
            quieto={quieto}
            tienda={tienda}
            onPiso={entrar}
            onEntrar={terminar}
          />
        </Suspense>
        <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-ice/70">
          Clic en un piso para entrar a esa oficina · la luz del piso se enciende cuando trabaja
        </p>
        <span className="absolute right-4 top-3 text-xs text-ice/70">
          {conectado ? '● En vivo' : '○ Reconectando…'}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Pisos del edificio">
        {[...lista].reverse().map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => entrar(o.id)}
              className={cx(
                'w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-sm hover:bg-brand-soft',
                o.id === activo && 'ring-2 ring-brand',
              )}
            >
              <b>Piso {o.piso}</b> · {o.nombre}
              <span className="block text-xs text-muted">
                {o.corrida_activa ? '● En operación' : 'Libre'} · {o.agentes} agente(s)
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
