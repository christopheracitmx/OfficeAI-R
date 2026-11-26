import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
  cx,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { fijarOficinaActiva } from '../lib/oficinaActiva';
import type { EstadoCons, SesionCons } from '../lib/types-constructor';
import type { CandadoCat, HerramientaCat } from '../lib/types-datos';
import { NuevoPisoChat } from './NuevoPisoChat';
import { NuevoPisoForm } from './NuevoPisoForm';
import { NuevoPisoRevision } from './NuevoPisoRevision';

/** «Nuevo piso»: asistente guiado en 9 fases (con IA o formulario sin IA) que termina en un piso válido. */
export function NuevoPiso() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const toast = useToast();
  const id = Number(params.get('s')) || null;
  const estado = useApi<EstadoCons>('/constructor/estado');
  const cat = useApi<{ herramientas: HerramientaCat[]; candados: CandadoCat[] }>(
    '/catalogo-herramientas',
  );
  const ses = useApi<SesionCons>(`/constructor/sesiones/${id ?? 0}`);
  const [local, setLocal] = useState<SesionCons | null>(null);
  const s = local && local.id === id ? local : ses.data;
  const [error, setError] = useState<string | null>(null);

  const iniciar = async (modo: 'ia' | 'formulario', plantilla?: string) => {
    setError(null);
    try {
      const n = await api<SesionCons>('/constructor/sesiones', {
        method: 'POST',
        body: { modo, ...(plantilla ? { plantilla } : {}) },
      });
      setLocal(n);
      setParams({ s: String(n.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar');
    }
  };
  const guardar = async (parche: Record<string, unknown>, fase?: number) => {
    if (!s) return;
    try {
      const r = await api<SesionCons>(`/constructor/sesiones/${s.id}`, {
        method: 'PATCH',
        body: { parche, ...(fase ? { fase } : {}) },
      });
      setLocal(r);
      if (r.rechazos && r.rechazos.length > 0)
        toast(`No se aplicó: ${r.rechazos.join('; ')}`, 'error');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const irFase = async (fase: number) => {
    if (!s) return;
    try {
      setLocal(
        await api<SesionCons>(`/constructor/sesiones/${s.id}`, { method: 'PATCH', body: { fase } }),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const cambiarModo = async (modo: 'ia' | 'formulario') => {
    if (!s) return;
    setLocal(
      await api<SesionCons>(`/constructor/sesiones/${s.id}`, { method: 'PATCH', body: { modo } }),
    );
  };
  const descartar = async () => {
    if (!s) return;
    await api(`/constructor/sesiones/${s.id}/descartar`, { method: 'POST', body: {} });
    navegar('/edificio');
  };

  return (
    <>
      <PageHeader
        titulo="Nuevo piso"
        subtitulo="Diseña una oficina nueva conversando con la Arquitecta (o con un formulario guiado). Nada se crea hasta que apruebes."
        acciones={
          <Button variante="fantasma" onClick={() => navegar('/edificio')}>
            Volver al Edificio
          </Button>
        }
      />
      {error && <ErrorBanner mensaje={error} />}
      {!id && (
        <div className="grid grid-cols-2 gap-4">
          {estado.loading && <Skeleton className="h-32" />}
          {estado.data && (
            <>
              <Card>
                <h3 className="font-semibold text-deep">Con asistente (IA)</h3>
                <p className="mt-1 text-sm text-muted">
                  Conversas y la Arquitecta arma el borrador. Cada mensaje gasta una llamada de IA
                  de tu plan.
                </p>
                {!estado.data.ia.disponible && (
                  <p role="status" className="mt-2 text-sm text-deep">
                    No disponible ahora: {estado.data.ia.motivo}
                  </p>
                )}
                <Button
                  className="mt-3"
                  variante="primario"
                  disabled={!estado.data.ia.disponible}
                  onClick={() => void iniciar('ia')}
                >
                  Empezar conversación
                </Button>
              </Card>
              <Card>
                <h3 className="font-semibold text-deep">Formulario guiado (sin IA)</h3>
                <p className="mt-1 text-sm text-muted">
                  Mismas 9 fases, llenando campos. No consume tu plan.
                </p>
                <Button className="mt-3" onClick={() => void iniciar('formulario')}>
                  Empezar formulario
                </Button>
              </Card>
              {estado.data.plantillas.map((p) => (
                <Card key={p.id}>
                  <h3 className="font-semibold text-deep">Plantilla: {p.nombre}</h3>
                  <p className="mt-1 text-sm text-muted">{p.descripcion}</p>
                  <Button className="mt-3" onClick={() => void iniciar('formulario', p.id)}>
                    Partir de esta plantilla
                  </Button>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
      {id && ses.loading && !s && <Skeleton className="h-64" />}
      {id && ses.error && !s && <ErrorBanner mensaje={ses.error} />}
      {s && s.estado !== 'abierta' && <EmptyState mensaje={`Esta sesión está ${s.estado}.`} />}
      {s && s.estado === 'abierta' && (
        <div className="grid grid-cols-[220px_1fr] gap-6">
          <nav aria-label="Fases" className="space-y-1">
            {s.fases.map((f, i) => (
              <button
                key={f}
                onClick={() => void irFase(i + 1)}
                aria-current={s.fase === i + 1 ? 'step' : undefined}
                className={cx(
                  'w-full rounded-lg border px-3 py-2 text-left text-sm',
                  s.fase === i + 1
                    ? 'border-brand bg-brand-soft font-medium'
                    : 'border-line bg-white hover:bg-brand-soft',
                )}
              >
                {i + 1}. {f}
              </button>
            ))}
            <div className="space-y-1 pt-3 text-xs text-muted">
              <p>Modo: {s.modo === 'ia' ? 'asistente (IA)' : 'formulario (sin IA)'}</p>
              {s.faltan.length > 0 && <p>Falta: {s.faltan.slice(0, 3).join('; ')}</p>}
              <Button
                variante="fantasma"
                onClick={() => void cambiarModo(s.modo === 'ia' ? 'formulario' : 'ia')}
              >
                Cambiar a {s.modo === 'ia' ? 'formulario' : 'asistente'}
              </Button>
              <Button variante="fantasma" onClick={() => void descartar()}>
                Descartar
              </Button>
            </div>
          </nav>
          <div className="space-y-4">
            {s.modo === 'ia' && <NuevoPisoChat s={s} onSesion={setLocal} />}
            {s.fase <= 6 && cat.data && (
              <NuevoPisoForm
                s={s}
                cat={cat.data.herramientas}
                candados={cat.data.candados}
                guardar={guardar}
              />
            )}
            {s.fase >= 7 && (
              <NuevoPisoRevision
                s={s}
                guardar={guardar}
                onSesion={setLocal}
                onCreado={(oficina) => {
                  // Se sale primero de esta pantalla (desmonta el 3D) y luego se entra al piso nuevo, como «Entrar» del Edificio.
                  navegar('/edificio');
                  toast('Piso creado');
                  setTimeout(() => {
                    fijarOficinaActiva(oficina);
                    navegar('/oficina');
                  }, 200);
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
