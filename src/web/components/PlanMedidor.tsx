import { useApi } from '../lib/api';
import type { EstadoPlanUi, VentanaPlanUi } from '../lib/types-plan';
import { cx } from './cx';

const hora = (s: number | null): string =>
  s
    ? new Date(s * 1000).toLocaleString('es-MX', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'hace un momento';
  return min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
}

function Barra({ pct, reserva, claro }: { pct: number; reserva: number; claro?: boolean }) {
  return (
    <div
      className={cx('relative h-2 overflow-hidden rounded-full', claro ? 'bg-white/15' : 'bg-line')}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx('h-full', pct >= reserva ? 'bg-warn' : 'bg-brand')}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
      <div
        className="absolute inset-y-0 w-px bg-ice/80"
        style={{ left: `${reserva}%` }}
        title={`Reserva ${reserva} %`}
      />
    </div>
  );
}

function Ventana(p: { nombre: string; v: VentanaPlanUi; reserva: number; claro: boolean }) {
  return (
    <div>
      <div className="flex justify-between">
        <span>{p.nombre}</span>
        <span className="font-medium">{p.v.pct} %</span>
      </div>
      <Barra pct={p.v.pct} reserva={p.reserva} claro={p.claro} />
      <div className={cx('mt-0.5', p.claro ? 'text-ice/60' : 'text-muted')}>
        Reinicia {hora(p.v.reinicia_en)} · dato del CLI {haceCuanto(p.v.actualizado_en)}
      </div>
    </div>
  );
}

/** Medidor del plan de suscripción: % real que informa el CLI o, si no lo informa, un estimado rotulado. */
export function PlanMedidor({ compacto = false }: { compacto?: boolean }) {
  const p = useApi<EstadoPlanUi>('/plan', { refreshMs: compacto ? 20000 : 8000 });
  const d = p.data;
  const nota = compacto ? 'text-ice/60' : 'text-muted';
  if (!d) return <div className={cx('text-xs', nota)}>Plan: consultando…</div>;
  const cinco = d.ventanas['five_hour'];
  const sem = d.ventanas['seven_day'];
  return (
    <div
      className={cx('space-y-2', compacto ? 'text-xs text-ice/80' : 'text-sm')}
      aria-label="Uso del plan de suscripción"
    >
      {d.modo === 'cli' && (
        <>
          {cinco && (
            <Ventana
              nombre="Plan · ventana de 5 h"
              v={cinco}
              reserva={d.reserva.five_hour_pct}
              claro={compacto}
            />
          )}
          {sem && (
            <Ventana
              nombre="Plan · semanal"
              v={sem}
              reserva={d.reserva.seven_day_pct}
              claro={compacto}
            />
          )}
        </>
      )}
      {d.modo === 'estimado' && d.estimado.pct !== null && (
        <div>
          <div className="flex justify-between">
            <span>Plan 5 h (estimado)</span>
            <span className="font-medium">≈ {d.estimado.pct} %</span>
          </div>
          <Barra pct={d.estimado.pct} reserva={d.reserva.five_hour_pct} claro={compacto} />
          <div className={cx('mt-0.5', nota)}>
            ESTIMADO: {d.estimado.tokens_5h.toLocaleString('es-MX')} de{' '}
            {d.estimado.presupuesto.toLocaleString('es-MX')} tokens (solo lo que gasta esta app).
          </div>
        </div>
      )}
      {d.modo === 'sin_datos' && (
        <div className={nota}>
          Plan: sin datos. El CLI informa el porcentaje en cuanto corre un agente; también puedes
          fijar un presupuesto en Configuración para un estimado.
        </div>
      )}
      {!compacto && d.modo === 'cli' && (
        <p className={nota}>
          La marca vertical es tu reserva: la corrida se pausa al llegar ahí. El porcentaje cuenta
          TODO el uso de tu suscripción (también otras sesiones de Claude), no solo el de esta app.
        </p>
      )}
    </div>
  );
}
