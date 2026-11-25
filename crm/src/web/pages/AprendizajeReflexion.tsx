import { useState } from 'react';
import { PlanMedidor } from '../components/PlanMedidor';
import { Button, Card, ConfirmDialog, ErrorBanner, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import {
  ESFUERZOS_UI,
  MODELOS_UI,
  type EstimadoIaUi,
  type ResultadoReflexionUi,
} from '../lib/types';
import { inp } from './ConfListas';

/** «Reflexión» a petición: una llamada por oficina con datos agregados. Nunca automática, siempre con confirmación. */
export function AprendizajeReflexion({ onCambio }: { onCambio: () => void }) {
  const toast = useToast();
  const [modelo, setModelo] = useState<string>(MODELOS_UI[0]);
  const [esfuerzo, setEsfuerzo] = useState<string>('low');
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [res, setRes] = useState<ResultadoReflexionUi | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const est = useApi<EstimadoIaUi>(`/reflexion/estimado?modelo=${modelo}&esfuerzo=${esfuerzo}`);

  const ejecutar = async () => {
    setConfirmando(false);
    setTrabajando(true);
    setFallo(null);
    setRes(null);
    try {
      const r = await api<ResultadoReflexionUi>('/reflexion', {
        method: 'POST',
        body: { confirmado: true, modelo, esfuerzo },
      });
      setRes(r);
      toast(`Reflexión lista: ${r.creadas} propuesta(s) nuevas`);
      onCambio();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setTrabajando(false);
    }
  };
  const tokens = est.data?.tokens ?? 0;
  return (
    <div className="grid max-w-5xl grid-cols-[1fr_300px] gap-6">
      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="font-semibold">Pedir una reflexión</h2>
          <p className="text-muted">
            Una sola llamada a la IA lee un resumen recortado de lo que opinaste, de lo que devolvió
            QA y de cómo terminaron los prospectos, y propone lecciones nuevas (y fusiones de
            duplicadas). No cambia ningún prompt: todo llega como «propuesta» y tú decides. Se
            ejecuta solo cuando tú lo pides.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-muted">
              Modelo
              <select
                className={cx(inp, 'mt-1 block')}
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              >
                {MODELOS_UI.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-muted">
              Esfuerzo
              <select
                className={cx(inp, 'mt-1 block')}
                value={esfuerzo}
                onChange={(e) => setEsfuerzo(e.target.value)}
              >
                {ESFUERZOS_UI.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variante="primario"
              disabled={trabajando || !est.data || (est.data.feedback_total ?? 0) === 0}
              onClick={() => setConfirmando(true)}
            >
              {trabajando ? 'Reflexionando…' : 'Pedir reflexión'}
            </Button>
          </div>
          <p className="text-sm text-muted" aria-live="polite">
            {est.data
              ? (est.data.feedback_total ?? 0) === 0
                ? 'Aún no hay retroalimentación (👍/👎, QA o resultados) sobre la cual reflexionar.'
                : `Consumo estimado ≈ ${tokens.toLocaleString('es-MX')} tokens${est.data.pct_presupuesto !== null ? ` (${est.data.pct_presupuesto} % del presupuesto de 5 h)` : ''} · ${est.data.feedback_total} registro(s) de retroalimentación.`
              : 'Calculando estimado…'}
          </p>
        </Card>
        {fallo && <ErrorBanner mensaje={fallo} />}
        {res && (
          <Card className="space-y-2">
            <h2 className="font-semibold">Resultado</h2>
            <p>
              {res.creadas} propuesta(s) nueva(s), {res.fusiones} fusión(es),{' '}
              {res.rechazadas.length} rechazada(s) por las reglas de seguridad · consumo real ≈{' '}
              {res.tokens.toLocaleString('es-MX')} tokens ponderados.
            </p>
            {res.rechazadas.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {res.rechazadas.map((r) => (
                  <li key={r.texto}>
                    «{r.texto}» — {r.motivo}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted">Revísalas en la pestaña «Propuestas».</p>
          </Card>
        )}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Uso del plan</h2>
        <PlanMedidor />
      </Card>
      {confirmando && (
        <ConfirmDialog
          titulo="¿Ejecutar la reflexión?"
          mensaje={`Gastará aprox. ${tokens.toLocaleString('es-MX')} tokens de tu plan con ${modelo} (esfuerzo ${esfuerzo}). Si el plan está en su reserva, se rechazará.`}
          confirmar="Sí, reflexionar"
          onCancel={() => setConfirmando(false)}
          onConfirm={() => void ejecutar()}
        />
      )}
    </div>
  );
}
