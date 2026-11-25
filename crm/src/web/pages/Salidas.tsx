import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton, cx } from '../components/ui';
import { useApi } from '../lib/api';
import { fechaCorta, type AgenteFila, type ResumenConsumo, type Salida } from '../lib/types';

const COLOR: Record<string, string> = {
  ok: 'text-ok',
  fallo: 'text-bad',
  timeout: 'text-warn',
  limite: 'text-warn',
  abortado: 'text-muted',
};

function Detalle({ id }: { id: number }) {
  const d = useApi<{ contenido: string | null; herramientas: string | null }>(`/salidas/${id}`);
  if (!d.data) return <Skeleton className="h-10" />;
  const h = d.data.herramientas ? (JSON.parse(d.data.herramientas) as Record<string, number>) : {};
  return (
    <div className="mt-2 text-sm">
      <p className="mb-1 text-muted">
        Herramientas:{' '}
        {Object.keys(h).length === 0
          ? 'ninguna'
          : Object.entries(h)
              .map(([k, n]) => `${k} ×${n}`)
              .join(', ')}
      </p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ice p-2 text-xs">
        {d.data.contenido || '(sin texto)'}
      </pre>
    </div>
  );
}

/** Lo que ha producido cada agente + consumo por agente. Se reutilizará como pestaña «Salidas» del panel 3D. */
export function Salidas() {
  const [agente, setAgente] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);
  const agentes = useApi<AgenteFila[]>('/agentes');
  const lista = useApi<Salida[]>(`/salidas?limit=100${agente ? `&agente=${agente}` : ''}`, {
    refreshMs: 8000,
  });
  const res = useApi<ResumenConsumo[]>('/salidas-resumen');
  return (
    <>
      <PageHeader
        titulo="Salidas de los agentes"
        subtitulo="Cada paso que ejecuta un agente queda registrado: qué entregó, cuánto tardó y cuánto plan consumió."
      />
      {res.data && res.data.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold">Consumo por agente (todas las corridas)</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                {[
                  'Agente',
                  'Llamadas',
                  'Tokens totales',
                  'Tokens por llamada',
                  'Prompt',
                  'Fallos',
                ].map((h) => (
                  <th key={h} className="py-1 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {res.data.map((r) => (
                <tr key={r.agente}>
                  <td className="py-1 pr-3 font-medium">{r.agente}</td>
                  <td className="pr-3">{r.llamadas}</td>
                  <td className="pr-3">{(r.tokens ?? 0).toLocaleString('es-MX')}</td>
                  <td className="pr-3">{(r.tokens_medio ?? 0).toLocaleString('es-MX')}</td>
                  <td className="pr-3">{(r.prompt_medio ?? 0).toLocaleString('es-MX')}</td>
                  <td className={cx('pr-3', r.no_ok > 0 && 'text-bad')}>{r.no_ok}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Tokens ponderados por costo (la caché leída pesa poco). «Prompt» es el tamaño medio del
            prompt que recibe el agente.
          </p>
        </Card>
      )}
      <select
        aria-label="Agente"
        value={agente}
        onChange={(e) => setAgente(e.target.value)}
        className="mb-3 rounded-lg border border-line bg-white px-3 py-2"
      >
        <option value="">Todos los agentes</option>
        {agentes.data?.map((a) => (
          <option key={a.id} value={a.id}>
            {a.id}
          </option>
        ))}
      </select>
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      {lista.data?.length === 0 && (
        <EmptyState mensaje="Todavía no hay salidas. Aparecen al ejecutar una corrida." />
      )}
      <ul className="space-y-2">
        {lista.data?.map((s) => (
          <li key={s.id}>
            <Card className="py-3">
              <button
                className="flex w-full items-center gap-3 text-left"
                aria-expanded={abierta === s.id}
                onClick={() => setAbierta(abierta === s.id ? null : s.id)}
              >
                <span className="w-28 font-medium">{s.agente}</span>
                <span className={cx('w-16 text-sm', COLOR[s.resultado])}>{s.resultado}</span>
                <span className="flex-1 truncate text-muted">{s.resumen || '—'}</span>
                <span className="text-xs text-muted">
                  {s.tokens_estimados?.toLocaleString('es-MX') ?? '?'} t ·{' '}
                  {s.duracion_ms ? Math.round(s.duracion_ms / 1000) : '?'} s ·{' '}
                  {fechaCorta(s.creado_en)}
                </span>
              </button>
              {s.prospecto_id && (
                <Link
                  to={`/prospectos/${s.prospecto_id}`}
                  className="text-sm text-brand-strong hover:underline"
                >
                  Ver prospecto
                </Link>
              )}
              {abierta === s.id && <Detalle id={s.id} />}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
