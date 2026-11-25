/**
 * Pantalla completa real (Fullscreen API) del lienzo 3D. El elemento que se expande es el contenedor
 * de la escena + el panel del agente, así el clic en un agente sigue abriendo su panel. Atajo: F.
 * Esc lo maneja el navegador (sale de pantalla completa sin salir del modo presentación).
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { CALIDADES, type Calidad } from '../../shared/oficina3d/apariencia';
import type { Tienda } from './tienda';
import type { usePreferencias } from './usarOficina';

export function usePantallaCompleta(ref: RefObject<HTMLElement | null>) {
  const [activa, setActiva] = useState(false);
  const disponible = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    const cambio = () => setActiva(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', cambio);
    return () => document.removeEventListener('fullscreenchange', cambio);
  }, []);

  const alternar = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void ref.current?.requestFullscreen().catch(() => undefined);
  }, [ref]);

  // Atajo F (no cuando se escribe en un campo ni con modificadores)
  useEffect(() => {
    if (!disponible) return;
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && /^(input|select|textarea)$/i.test(t.tagName)) return;
      e.preventDefault();
      alternar();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [disponible, alternar]);

  return { activa, alternar, disponible };
}

const btn =
  'rounded-lg bg-deep/85 px-3 py-1.5 text-sm text-ice shadow-md transition-colors hover:bg-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand';

/** Controles mínimos sobre el lienzo: entrar/salir, girar y calidad (el panel del agente sale al hacer clic). */
export function BarraPantalla({
  activa,
  alternar,
  pref,
  t,
}: {
  activa: boolean;
  alternar: () => void;
  pref: ReturnType<typeof usePreferencias>;
  t: Tienda;
}) {
  const rotar = (d: number) => t.set({ rotacion: t.get().rotacion + d });
  return (
    <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center justify-end gap-2">
      {activa && (
        <>
          <button className={btn} onClick={() => rotar(-1)} aria-label="Girar vista a la izquierda">
            ⟲ 90°
          </button>
          <button className={btn} onClick={() => rotar(1)} aria-label="Girar vista a la derecha">
            ⟳ 90°
          </button>
          <select
            aria-label="Calidad gráfica en pantalla completa"
            className={btn}
            value={pref.calidad}
            onChange={(e) => pref.setCalidad(e.target.value as Calidad)}
          >
            {CALIDADES.map((c) => (
              <option key={c} value={c}>
                {c === 'baja' ? 'Calidad baja' : c === 'media' ? 'Calidad media' : 'Calidad alta'}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        className={btn}
        onClick={alternar}
        aria-pressed={activa}
        aria-label={activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
        title="Atajo: F · Esc para salir"
      >
        {activa ? '✕ Salir (Esc)' : '⛶ Pantalla completa (F)'}
      </button>
    </div>
  );
}
