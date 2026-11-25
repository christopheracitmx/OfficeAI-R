/** Pestaña «Aprendizaje» del panel del agente: lecciones del agente y sus métricas, con enlace a la pantalla Aprendizaje. */
import { Link } from 'react-router-dom';
import { Chip, EmptyState, ErrorBanner, Skeleton } from '../components/ui';
import { useApi } from '../lib/api';
import type { DesempenoUi, LeccionFila } from '../lib/types';

const pct = (v: number | null): string => (v === null ? '—' : `${v} %`);

function Lista({ titulo, ls }: { titulo: string; ls: LeccionFila[] }) {
  return (
    <section aria-label={titulo}>
      <h3 className="mb-1 text-sm font-semibold">
        {titulo} ({ls.length})
      </h3>
      {ls.length === 0 ? (
        <p className="text-sm text-muted">Ninguna.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {ls.map((l) => (
            <li key={l.id} className="rounded-lg border border-line p-2">
              <Chip tono={l.tipo === 'error' ? 'inferencia' : 'evidencia'}>
                {l.tipo === 'error' ? 'EVITA' : 'REPITE'}
              </Chip>{' '}
              {l.texto}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PanelAprendizaje({ id }: { id: string }) {
  const ls = useApi<LeccionFila[]>(`/lecciones?agente=${encodeURIComponent(id)}`);
  const d = useApi<DesempenoUi>('/desempeno');
  if (ls.error) return <ErrorBanner mensaje={ls.error} onRetry={ls.reload} />;
  if (!ls.data || !d.data) return <Skeleton className="h-32" />;
  const m = d.data.agentes.find((a) => a.agente === id);
  const aprobadas = ls.data.filter((l) => l.estado === 'aprobada');
  const propuestas = ls.data.filter((l) => l.estado === 'propuesta');
  return (
    <div className="space-y-4">
      {m ? (
        <dl className="grid grid-cols-[130px_1fr] gap-y-1 text-sm">
          <dt className="text-muted">Llamadas / OK</dt>
          <dd>
            {m.llamadas} / {pct(m.ok_pct)}
          </dd>
          <dt className="text-muted">Tokens por empresa</dt>
          <dd>
            {m.tokens_por_empresa === null ? '—' : m.tokens_por_empresa.toLocaleString('es-MX')}
          </dd>
          <dt className="text-muted">Aprobación QA</dt>
          <dd>{m.qa_revisiones > 0 ? `${pct(m.qa_aprobacion_pct)} (${m.qa_revisiones})` : '—'}</dd>
          <dt className="text-muted">Devoluciones</dt>
          <dd>{m.devoluciones}</dd>
          <dt className="text-muted">Tu opinión</dt>
          <dd>
            👍 {m.aciertos_dueno} · 👎 {m.errores_dueno}
          </dd>
        </dl>
      ) : (
        <EmptyState mensaje="Sin métricas todavía." />
      )}
      <Lista titulo="Lecciones activas" ls={aprobadas} />
      <Lista titulo="Propuestas por revisar" ls={propuestas} />
      <Link to="/aprendizaje" className="inline-block text-sm text-brand-strong hover:underline">
        Abrir la pantalla Aprendizaje
      </Link>
    </div>
  );
}
