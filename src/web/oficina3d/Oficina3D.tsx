/**
 * «Ver oficina»: SIEMPRE 3D (Three.js en un chunk diferido). Sin 2D alterno: solo lista textual
 * accesible y el modo de bajo consumo (calidad Baja) del mismo 3D.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CALIDADES, type Calidad } from '../../shared/oficina3d/apariencia';
import type { SalaDef } from '../../shared/oficina3d/definicion';
import { Button, ErrorBanner, PageHeader, Skeleton, cx, useToast } from '../components/ui';
import { ListaAgentes } from './ListaAgentes';
import { PanelAgente } from './PanelAgente';
import { useTienda } from './tienda';
import { hayWebGL, movimientoReducido, useOficina, usePreferencias } from './usarOficina';

const Escena = lazy(() => import('./escena/Escena'));
const ETQ_CALIDAD: Record<Calidad, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja (bajo consumo)',
};
const sel = 'rounded-lg border border-line bg-white px-2 py-1.5 text-sm';

export function Oficina() {
  const [presentacion, setPresentacion] = useState(false);
  const { def, tienda, conectado, agentes } = useOficina(presentacion);
  const pref = usePreferencias();
  const [webgl] = useState(hayWebGL);
  const [quieto] = useState(movimientoReducido);
  const enPausa = useTienda(tienda, (e) => e.enPausa);
  const selId = useTienda(tienda, (e) => e.seleccionado);
  const navegar = useNavigate();
  const toast = useToast();
  const seleccionado = def?.agentes.find((a) => a.id === selId) ?? null;

  useEffect(() => {
    if (!presentacion) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPresentacion(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [presentacion]);

  const alSala = (s: SalaDef) => {
    if (presentacion) return;
    if (s.accion === 'biblioteca') navegar('/biblioteca');
    else toast('Sala de aprendizaje: próximamente (P6.5).');
  };
  const rotar = (d: number) => tienda.set({ rotacion: tienda.get().rotacion + d });

  const controles = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-sm">
        Piso
        <select aria-label="Piso" className={sel} value="1" onChange={() => undefined}>
          <option value="1">1 · {def?.office.nombre ?? 'Prospección'}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-sm">
        Calidad
        <select
          aria-label="Calidad gráfica"
          className={sel}
          value={pref.calidad}
          onChange={(e) => pref.setCalidad(e.target.value as Calidad)}
        >
          {CALIDADES.map((c) => (
            <option key={c} value={c}>
              {ETQ_CALIDAD[c]}
            </option>
          ))}
        </select>
      </label>
      <select
        aria-label="Iluminación"
        className={sel}
        value={pref.ciclo}
        onChange={(e) => pref.setCiclo(e.target.value as 'dia' | 'noche' | 'auto')}
      >
        <option value="dia">Día</option>
        <option value="noche">Noche</option>
        <option value="auto">Según la hora</option>
      </select>
      <Button onClick={() => rotar(-1)} aria-label="Girar vista a la izquierda">
        ⟲ 90°
      </Button>
      <Button onClick={() => rotar(1)} aria-label="Girar vista a la derecha">
        ⟳ 90°
      </Button>
    </div>
  );

  const escena = !webgl ? (
    <div className="rounded-2xl bg-deep p-8 text-center text-ice">
      Este navegador no puede mostrar gráficos 3D (WebGL desactivado). El estado de cada agente está
      en la lista de abajo.
    </div>
  ) : !def ? (
    agentes.error ? (
      <ErrorBanner mensaje={agentes.error} onRetry={agentes.reload} />
    ) : (
      <Skeleton className="h-[560px] rounded-2xl" />
    )
  ) : (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl bg-deep shadow-md',
        presentacion ? 'h-full' : 'h-[600px]',
      )}
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-ice/70">
            Construyendo la oficina…
          </div>
        }
      >
        <Escena
          d={def}
          t={tienda}
          calidad={pref.calidad}
          noche={pref.noche}
          quieto={quieto}
          onSeleccion={(id) => tienda.set({ seleccionado: presentacion ? null : id })}
          onSala={alSala}
        />
      </Suspense>
      {enPausa && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-deep/85 px-4 py-2 text-sm text-ice shadow-md"
            role="status"
          >
            <span>Oficina en pausa. Inicia una corrida para verla en acción.</span>
            {!presentacion && (
              <Link
                to="/corrida"
                className="rounded-full bg-brand-strong px-3 py-1 font-medium text-white"
              >
                Ir a Corrida
              </Link>
            )}
          </div>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-ice/70">
        Arrastra para mover · rueda para acercar · clic en un agente para ver su panel
      </p>
    </div>
  );

  if (presentacion)
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-deep p-6">
        <div className="mb-3 flex items-center justify-between text-ice">
          <div className="flex items-center gap-3">
            <img src="/logo-acit.png" alt="ACITMX" className="h-9 rounded bg-ice p-1" />
            <span className="text-lg font-semibold">{def?.office.nombre}</span>
          </div>
          <Button variante="secundario" onClick={() => setPresentacion(false)}>
            Salir (Esc)
          </Button>
        </div>
        <div className="flex-1">{escena}</div>
      </div>
    );

  return (
    <>
      <PageHeader
        titulo="Ver oficina"
        subtitulo="Tu equipo de agentes en 3D, en vivo (solo lectura)."
        acciones={
          <>
            <span className={cx('text-xs', conectado ? 'text-ok' : 'text-muted')}>
              {conectado ? '● En vivo' : '○ Reconectando…'}
            </span>
            <Button onClick={() => setPresentacion(true)}>Modo presentación</Button>
          </>
        }
      />
      <div className="mb-3">{controles}</div>
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">{escena}</div>
        {seleccionado && (
          <PanelAgente
            key={seleccionado.id}
            a={seleccionado}
            t={tienda}
            onCerrar={() => tienda.set({ seleccionado: null })}
          />
        )}
      </div>
      {def && <ListaAgentes d={def} t={tienda} />}
    </>
  );
}
