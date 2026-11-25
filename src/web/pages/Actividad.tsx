import { useState } from 'react';
import { EmptyState, ErrorBanner, PageHeader, Skeleton } from '../components/ui';
import { useApi, type EventoActividad } from '../lib/api';
import { fechaCorta } from '../lib/types';

const AGENTES = [
  'Cartografo',
  'Explorador',
  'Guardian',
  'Rastreador',
  'Analista',
  'Estratega',
  'Armador',
  'QA-1',
  'Calificador',
  'Redactor',
  'QA-2',
  'Coordinador',
];

export function Actividad() {
  const [agente, setAgente] = useState('');
  const { data, loading, error, reload } = useApi<EventoActividad[]>(
    `/actividad?limit=200${agente ? `&agente=${agente}` : ''}`,
    { refreshMs: 5000 },
  );
  return (
    <>
      <PageHeader
        titulo="Actividad"
        subtitulo="Bitácora de lo que han hecho los agentes. Útil para auditar y ver dónde se atoran."
      />
      <select
        aria-label="Agente"
        value={agente}
        onChange={(e) => setAgente(e.target.value)}
        className="mb-4 rounded-lg border border-line bg-white px-3 py-2"
      >
        <option value="">Todos los agentes</option>
        {AGENTES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {error && <ErrorBanner mensaje={error} onRetry={reload} />}
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState mensaje="Todavía no hay actividad. Aparecerá cuando los agentes empiecen a trabajar en una corrida." />
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          {data.map((e) => (
            <li key={e.id} className="flex items-baseline gap-4 px-4 py-2.5">
              <span className="w-28 shrink-0 text-xs text-muted">{fechaCorta(e.creado_en)}</span>
              <span className="w-28 shrink-0 font-medium text-brand-strong">{e.agente}</span>
              <span className="flex-1">
                {e.accion}
                {e.detalle ? <span className="text-muted"> · {e.detalle}</span> : null}
              </span>
              {e.corrida_id && <span className="text-xs text-muted">corrida #{e.corrida_id}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
