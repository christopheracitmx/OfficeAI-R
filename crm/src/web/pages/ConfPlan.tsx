import { useState } from 'react';
import { Button, Card, cx, useToast } from '../components/ui';
import { PlanMedidor } from '../components/PlanMedidor';
import { api, useApi } from '../lib/api';
import { numeroSeguro, type Config } from '../lib/types';
import { inp } from './ConfListas';

type Campo =
  'reserva_5h_pct' | 'reserva_semanal_pct' | 'presupuesto_5h_tokens' | 'umbral_confirmacion_tokens';

/** Reserva del plan, presupuesto para el estimado y umbral de confirmación por corrida. */
export function ConfPlan() {
  const cfg = useApi<Config>('/config');
  const toast = useToast();
  const [v, setV] = useState<Partial<Record<Campo, number>>>({});
  if (!cfg.data) return null;
  const val = (k: Campo): number => v[k] ?? cfg.data![k];
  const campo = (k: Campo, etiqueta: string, ayuda: string, min: number, max: number) => (
    <label className="block text-muted">
      {etiqueta}
      <input
        type="number"
        min={min}
        max={max}
        className={cx(inp, 'mt-1 w-full')}
        value={val(k)}
        onChange={(e) => setV({ ...v, [k]: numeroSeguro(e.target.value, val(k)) })}
      />
      <span className="text-sm">{ayuda}</span>
    </label>
  );
  const guardar = async () => {
    try {
      await api('/config', { method: 'PATCH', body: v });
      toast('Reserva y presupuesto guardados');
      setV({});
      cfg.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  return (
    <div className="grid max-w-4xl grid-cols-2 gap-6">
      <div className="space-y-4">
        {campo(
          'reserva_5h_pct',
          'Reserva de la ventana de 5 horas (%)',
          'La corrida se pausa al llegar a este % de uso (estado «Pausada: reserva del plan») y la reanudas tú. 100 casi la desactiva.',
          10,
          100,
        )}
        {campo(
          'reserva_semanal_pct',
          'Reserva de la ventana semanal (%)',
          'Igual, para el límite semanal.',
          10,
          100,
        )}
        {campo(
          'presupuesto_5h_tokens',
          'Presupuesto de 5 horas para el estimado (tokens ponderados)',
          'Solo se usa si el CLI no informa el porcentaje. 0 = sin presupuesto. Se rotula siempre como «estimado».',
          0,
          100_000_000,
        )}
        {campo(
          'umbral_confirmacion_tokens',
          'Pedir confirmación si una corrida estima más de (tokens)',
          'Antes de iniciar se muestra el consumo estimado; sobre este umbral pide confirmación.',
          10_000,
          100_000_000,
        )}
        <Button
          variante="primario"
          disabled={Object.keys(v).length === 0}
          onClick={() => void guardar()}
        >
          Guardar
        </Button>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Uso actual del plan</h2>
        <PlanMedidor />
      </Card>
    </div>
  );
}
