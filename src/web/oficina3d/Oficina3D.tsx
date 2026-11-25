/**
 * «Ver oficina»: SIEMPRE 3D (Three.js en un chunk diferido). Sin 2D alterno: solo lista textual
 * accesible y el modo de bajo consumo (calidad Baja) del mismo 3D.
 */
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SalaDef } from '../../shared/oficina3d/definicion';
import { Button, ErrorBanner, PageHeader, Skeleton, cx, useToast } from '../components/ui';
import { Controles } from './Controles';
import { ListaAgentes } from './ListaAgentes';
import { PanelAgente } from './PanelAgente';
import { BarraPantalla, usePantallaCompleta } from './PantallaCompleta';
import { useTienda } from './tienda';
import { hayWebGL, movimientoReducido, useOficina, usePreferencias } from './usarOficina';

const Escena = lazy(() => import('./escena/Escena'));
export function Oficina() {
  const [presentacion, setPresentacion] = useState(false);
  const { def, tienda, conectado, agentes } = useOficina(presentacion);
  const pref = usePreferencias();
  const [webgl] = useState(hayWebGL);
  const [quieto] = useState(movimientoReducido);
  const pantalla = useRef<HTMLDivElement>(null);
  const fs = usePantallaCompleta(pantalla);
  const enPausa = useTienda(tienda, (e) => e.enPausa);
  const selId = useTienda(tienda, (e) => e.seleccionado);
  const navegar = useNavigate();
  const toast = useToast();
  const seleccionado = def?.agentes.find((a) => a.id === selId) ?? null;

  useEffect(() => {
    if (!presentacion) return;
    const k = (e: KeyboardEvent) =>
      e.key === 'Escape' && !document.fullscreenElement && setPresentacion(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [presentacion]);

  const alSala = (s: SalaDef) => {
    if (presentacion) return;
    if (fs.activa) fs.alternar();
    if (s.accion === 'biblioteca') navegar('/biblioteca');
    else toast('Sala de aprendizaje: próximamente (P6.5).');
  };

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
        presentacion || fs.activa ? 'h-full' : 'h-[600px]',
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
      {fs.disponible && (
        <BarraPantalla activa={fs.activa} alternar={fs.alternar} pref={pref} t={tienda} />
      )}
      <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-ice/70">
        Arrastra para mover · rueda para acercar · clic en un agente para ver su panel · F: pantalla
        completa
      </p>
    </div>
  );

  if (presentacion)
    return (
      <div ref={pantalla} className="fixed inset-0 z-40 flex flex-col bg-deep p-6">
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
      <div className="mb-3">
        <Controles nombre={def?.office.nombre ?? 'Prospección'} pref={pref} t={tienda} d={def} />
      </div>
      <div ref={pantalla} className={cx('flex gap-4', fs.activa && 'h-screen bg-deep p-3')}>
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
