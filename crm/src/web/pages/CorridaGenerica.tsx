import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlanMedidor } from '../components/PlanMedidor';
import { ProgresoCorrida } from '../components/ProgresoCorrida';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  useToast,
} from '../components/ui';
import { api, ApiError, useApi } from '../lib/api';
import { useOficinaActual } from '../lib/useOficinas';
import {
  fechaCorta,
  numeroSeguro,
  type Corrida as CorridaT,
  type EstadoApp,
  type EstimadoCorridaUi,
} from '../lib/types';

const FIN: Record<string, string> = {
  en_curso: 'En curso',
  terminada: 'Terminada',
  detenida: 'Detenida',
  pausada_limite_plan: 'Pausada: límite del plan de IA',
  pausada_reserva_plan: 'Pausada: reserva del plan',
  error: 'Error',
};

/** Corrida de una oficina distinta de prospección: una tarea y un tope de elementos (parámetros genéricos). */
export function CorridaGenerica() {
  const { id, oficina } = useOficinaActual();
  const estado = useApi<EstadoApp>('/estado', { refreshMs: 5000 });
  const hist = useApi<CorridaT[]>('/corridas', { refreshMs: 8000 });
  const toast = useToast();
  const [tarea, setTarea] = useState('');
  const [max, setMax] = useState(1);
  const [pedir, setPedir] = useState<EstimadoCorridaUi | null>(null);
  const est = useApi<EstimadoCorridaUi>(`/corridas/estimado?max_empresas=${max}`);
  const activa = estado.data?.corrida_activa ?? null;

  const iniciar = async (confirmado = false) => {
    try {
      await api('/corridas', {
        method: 'POST',
        body: { office_id: id, params: { tarea: tarea.trim(), max_items: max }, confirmado },
      });
      setPedir(null);
      toast('Corrida iniciada.');
      estado.reload();
      hist.reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && est.data?.requiere_confirmacion)
        return setPedir(est.data);
      toast(e instanceof Error ? e.message : 'No se pudo iniciar', 'error');
    }
  };
  const detener = async () => {
    if (!activa) return;
    try {
      await api(`/corridas/${activa.id}/detener`, { method: 'POST', body: {} });
      toast('Corrida detenida');
      estado.reload();
      hist.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo detener', 'error');
    }
  };
  const campo = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2';
  return (
    <>
      <PageHeader
        titulo={`Corrida · ${oficina?.nombre ?? id}`}
        subtitulo="Nada corre solo. La IA atiende una llamada a la vez en todo el edificio, así que si otro piso está trabajando tu corrida espera su turno."
      />
      {estado.error && <ErrorBanner mensaje={estado.error} onRetry={estado.reload} />}
      {oficina && oficina.advertencias.length > 0 && (
        <p role="alert" className="mb-4 rounded-lg bg-warn/30 p-3 text-sm">
          {oficina.advertencias.join(' · ')}. Edita el flujo en Edificio → Flujo (avanzado).
        </p>
      )}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <h2 className="mb-4 font-semibold">
            {activa ? `Corrida #${activa.id} en curso` : 'Nueva corrida'}
          </h2>
          {activa ? (
            <>
              <ProgresoCorrida corridaId={activa.id} />
              <div className="mt-4 flex gap-2">
                <Button variante="peligro" onClick={() => void detener()}>
                  Detener corrida
                </Button>
                <Link
                  to="/oficina"
                  className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-deep hover:bg-brand-soft"
                >
                  Ver oficina
                </Link>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <label className="block text-muted">
                Tarea para el equipo
                <textarea
                  className={campo}
                  rows={3}
                  maxLength={500}
                  value={tarea}
                  onChange={(e) => setTarea(e.target.value)}
                  placeholder="Qué debe hacer la oficina en esta corrida"
                />
              </label>
              <label className="block max-w-xs text-muted">
                Máximo de elementos
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={campo}
                  value={max}
                  onChange={(e) => setMax(numeroSeguro(e.target.value, 1))}
                />
              </label>
              {est.data && (
                <p className="rounded-lg border border-line bg-ice px-3 py-2 text-sm">
                  Consumo estimado: ≈ <b>{est.data.tokens.toLocaleString('es-MX')}</b> tokens
                  ponderados ({est.data.base === 'historial' ? 'según tus corridas' : 'referencia'}
                  ).
                </p>
              )}
              <Button
                variante="primario"
                disabled={tarea.trim().length < 3 || max < 1 || max > 50 || !oficina?.ejecutable}
                onClick={() => void iniciar(false)}
              >
                Iniciar corrida
              </Button>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Plan de suscripción (global)</h2>
          <PlanMedidor />
        </Card>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Historial de corridas</h2>
      {hist.data && hist.data.length === 0 && (
        <EmptyState mensaje="Esta oficina aún no tiene corridas." />
      )}
      {hist.data && hist.data.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-sm">
          {hist.data.map((c) => (
            <li key={c.id} className="px-4 py-2.5">
              #{c.id} · {fechaCorta(c.iniciada_en)} · {FIN[c.estado] ?? c.estado}
              {c.motivo_fin ? <span className="text-muted"> · {c.motivo_fin}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {pedir && (
        <ConfirmDialog
          titulo="Esta corrida consumirá bastante plan"
          mensaje={`Consumo estimado ≈ ${pedir.tokens.toLocaleString('es-MX')} tokens ponderados, sobre tu umbral de ${pedir.umbral.toLocaleString('es-MX')}. ¿Iniciar de todos modos?`}
          confirmar="Iniciar corrida"
          onCancel={() => setPedir(null)}
          onConfirm={() => void iniciar(true)}
        />
      )}
    </>
  );
}
