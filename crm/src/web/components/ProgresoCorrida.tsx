import { useApi } from '../lib/api';
import type { ProgresoCorrida as ProgresoT } from '../lib/types';

const FASES: Record<string, string> = {
  iniciando: 'Iniciando',
  descubriendo: 'Descubriendo empresas',
  filtrando: 'Filtrando el lote',
  procesando: 'Investigando y armando expedientes',
};

const PASOS: Record<string, string> = {
  cartografo: 'Cartógrafo',
  explorador: 'Explorador',
  guardian: 'Guardián',
  rastreador: 'Rastreador',
  analista: 'Analista',
  estratega: 'Estratega',
  armador: 'Armador',
  estratega_armador: 'Estratega y Armador',
  qa1: 'QA-1',
  calificador: 'Calificador',
  redactor: 'Redactor',
  calificador_redactor: 'Calificador y Redactor',
  qa2: 'QA-2',
};

/** Progreso en vivo de una corrida (consulta cada 3 s; los detalles finos llegan por "Ver oficina"). */
export function ProgresoCorrida({ corridaId }: { corridaId: number }) {
  const p = useApi<ProgresoT>(`/corridas/${corridaId}/progreso`, { refreshMs: 3000 });
  const r = p.data?.runner ?? null;
  const pct = r && r.pasos_max > 0 ? Math.min((r.pasos_ejecutados / r.pasos_max) * 100, 100) : 0;

  return (
    <div className="mt-4 rounded-lg bg-brand-soft p-4" aria-live="polite">
      <p className="font-medium">
        {r ? (FASES[r.fase ?? ''] ?? r.fase) : 'Esperando el estado del runner…'}
        {r?.paso_actual ? (
          <span className="text-muted">
            {' '}
            · ahora trabaja {PASOS[r.paso_actual] ?? r.paso_actual}
            {r.item_actual ? ` en «${r.item_actual.nombre ?? `#${r.item_actual.id}`}»` : ''}
          </span>
        ) : null}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className="h-full origin-left bg-brand transition-transform"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      {r && (
        <p className="mt-1 text-xs text-muted">
          {r.pasos_ejecutados} llamadas al motor (tope de seguridad {r.pasos_max})
          {r.fallos_seguidos > 0 ? ` · ${r.fallos_seguidos} fallo(s) seguido(s)` : ''}
        </p>
      )}
      {p.error && <p className="mt-2 text-sm text-red-700">{p.error}</p>}
      <dl className="mt-3 grid grid-cols-5 gap-3">
        {(p.data?.progreso ?? []).map((x) => (
          <div key={x.id}>
            <dt className="text-xs text-muted">{x.etiqueta}</dt>
            <dd className="text-xl font-semibold">{x.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
