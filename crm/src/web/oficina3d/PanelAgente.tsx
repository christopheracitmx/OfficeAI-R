/** Panel lateral del agente seleccionado: pestañas conectadas a lo que ya existe en el backend. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgenteDef3d } from '../../shared/oficina3d/definicion';
import { ETIQUETA_ESTADO, estadoVisible } from '../../shared/oficina3d/eventos';
import { Button, EmptyState, ErrorBanner, Skeleton, cx } from '../components/ui';
import { useApi, type EventoActividad } from '../lib/api';
import { fechaCorta, type Habilidad, type Salida } from '../lib/types';
import { PromptEditor } from '../pages/PromptEditor';
import { PanelAprendizaje } from './PanelAprendizaje';
import { useTienda, type Tienda } from './tienda';

const TABS = ['Estado', 'Salidas', 'Prompt', 'Habilidades', 'Historial', 'Aprendizaje'] as const;
type Tab = (typeof TABS)[number];

/** Nombre del archivo/prompt de un rol (QA-1 -> qa1). */
const nombrePrompt = (id: string) => id.toLowerCase().replace(/-/g, '');

function Estado({ a, t }: { a: AgenteDef3d; t: Tienda }) {
  const reg = useTienda(t, (e) => e.registros[a.id]);
  const pausa = useTienda(t, (e) => e.enPausa);
  const camina = useTienda(t, (e) => !!e.caminatas[a.id]);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const est = estadoVisible(reg, ahora, pausa, camina);
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
      <dt className="text-muted">Estado</dt>
      <dd className="font-medium">{ETIQUETA_ESTADO[est]}</dd>
      <dt className="text-muted">Actividad</dt>
      <dd>{reg ? reg.burbuja : 'Sin actividad en esta sesión.'}</dd>
      <dt className="text-muted">Desde</dt>
      <dd>{reg ? `hace ${Math.max(0, Math.round((ahora - reg.t) / 1000))} s` : '—'}</dd>
      <dt className="text-muted">Área</dt>
      <dd>{a.area}</dd>
      <dt className="text-muted">Tarea</dt>
      <dd>{a.tarea}</dd>
    </dl>
  );
}

function Salidas({ id }: { id: string }) {
  const s = useApi<Salida[]>(`/salidas?limit=20&agente=${encodeURIComponent(id)}`);
  if (s.error) return <ErrorBanner mensaje={s.error} onRetry={s.reload} />;
  if (!s.data) return <Skeleton className="h-24" />;
  if (s.data.length === 0)
    return <EmptyState mensaje="Aún no ha generado salidas. Aparecen al ejecutar una corrida." />;
  return (
    <ul className="divide-y divide-line text-sm">
      {s.data.map((x) => (
        <li key={x.id} className="py-2">
          <div className="flex justify-between text-xs text-muted">
            <span>{x.resultado}</span>
            <span>{fechaCorta(x.creado_en)}</span>
          </div>
          <p className="line-clamp-2">{x.resumen || '—'}</p>
          {x.prospecto_id && (
            <Link
              to={`/prospectos/${x.prospecto_id}`}
              className="text-brand-strong hover:underline"
            >
              Ver prospecto
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function Habilidades({ id }: { id: string }) {
  const h = useApi<Habilidad[]>('/habilidades');
  if (h.error) return <ErrorBanner mensaje={h.error} onRetry={h.reload} />;
  if (!h.data) return <Skeleton className="h-24" />;
  const mias = h.data.filter((x) => x.agentes.includes(id));
  return (
    <>
      {mias.length === 0 ? (
        <EmptyState mensaje="No tiene habilidades asignadas." />
      ) : (
        <ul className="space-y-2 text-sm">
          {mias.map((x) => (
            <li key={x.id} className="rounded-lg border border-line p-2">
              <div className="font-medium">
                {x.nombre} {x.activo ? '' : <span className="text-muted">(inactiva)</span>}
              </div>
              <p className="text-muted">{x.descripcion}</p>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/habilidades"
        className="mt-3 inline-block text-sm text-brand-strong hover:underline"
      >
        Gestionar habilidades
      </Link>
    </>
  );
}

function Historial({ id }: { id: string }) {
  const h = useApi<EventoActividad[]>(`/actividad?limit=30&agente=${encodeURIComponent(id)}`);
  if (h.error) return <ErrorBanner mensaje={h.error} onRetry={h.reload} />;
  if (!h.data) return <Skeleton className="h-24" />;
  if (h.data.length === 0) return <EmptyState mensaje="Sin acciones registradas." />;
  return (
    <ul className="space-y-1 text-sm">
      {h.data.map((e) => (
        <li key={e.id}>
          <span className="text-xs text-muted">{fechaCorta(e.creado_en)}</span> · {e.accion}
          {e.detalle ? <span className="text-muted"> · {e.detalle}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function PanelAgente({
  a,
  t,
  onCerrar,
}: {
  a: AgenteDef3d;
  t: Tienda;
  onCerrar: () => void;
}) {
  const [tab, setTab] = useState<Tab>('Estado');
  return (
    <aside
      className="flex max-h-full w-[420px] shrink-0 flex-col rounded-2xl border border-line bg-white shadow-md"
      aria-label={`Panel de ${a.persona}`}
    >
      <header className="flex items-start justify-between border-b border-line p-4">
        <div>
          <h2 className="text-lg font-semibold">{a.persona}</h2>
          <p className="text-sm text-muted">
            {a.rol} · {a.area}
          </p>
          <Link
            to={`/personalizar?tab=personajes&id=${encodeURIComponent(a.id)}`}
            className="mt-1 inline-block text-sm text-brand-strong hover:underline"
          >
            Personalizar apariencia
          </Link>
        </div>
        <Button variante="fantasma" onClick={onCerrar} aria-label="Cerrar panel">
          ✕
        </Button>
      </header>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line px-2 pt-2">
        {TABS.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={cx(
              '-mb-px border-b-2 px-2.5 py-1.5 text-sm',
              tab === x
                ? 'border-brand font-medium text-deep'
                : 'border-transparent text-muted hover:text-deep',
            )}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4" role="tabpanel">
        {tab === 'Estado' && <Estado a={a} t={t} />}
        {tab === 'Salidas' && <Salidas id={a.id} />}
        {tab === 'Prompt' &&
          (a.id === 'Coordinador' ? (
            <EmptyState mensaje="La coordinación la hace el runner en código: no tiene prompt propio." />
          ) : (
            <PromptEditor nombre={nombrePrompt(a.id)} onGuardado={() => undefined} />
          ))}
        {tab === 'Habilidades' && <Habilidades id={a.id} />}
        {tab === 'Historial' && <Historial id={a.id} />}
        {tab === 'Aprendizaje' && <PanelAprendizaje id={a.id} />}
      </div>
    </aside>
  );
}
