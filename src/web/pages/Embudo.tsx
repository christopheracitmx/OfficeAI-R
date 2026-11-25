import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  NivelBadge,
  PageHeader,
  Skeleton,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import type { ProspectoFila } from '../lib/types';

const COLUMNAS = ['Reportado', 'Canalizado', 'En contacto', 'Propuesta', 'Ganado', 'Perdido'];

function dias(iso: string | null): string {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : `hace ${d} d`;
}

export function Embudo() {
  const { data, loading, error, reload } = useApi<ProspectoFila[]>('/prospectos');
  const toast = useToast();
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [pendiente, setPendiente] = useState<{ id: number; estado: string } | null>(null);

  const mover = async (id: number, estado: string, motivo?: string) => {
    try {
      await api(`/prospectos/${id}`, {
        method: 'PATCH',
        body: { estado, ...(motivo ? { motivo } : {}) },
      });
      toast(`Movido a ${estado}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo mover', 'error');
    }
  };
  const pedirMover = (id: number, estado: string) => {
    if (estado === 'Perdido') setPendiente({ id, estado });
    else void mover(id, estado);
  };

  if (error) return <ErrorBanner mensaje={error} onRetry={reload} />;
  if (loading && !data)
    return (
      <div className="grid grid-cols-6 gap-3">
        {COLUMNAS.map((c) => (
          <Skeleton key={c} className="h-64" />
        ))}
      </div>
    );
  if (!data || data.every((p) => !COLUMNAS.includes(p.estado)))
    return (
      <>
        <PageHeader titulo="Embudo" />
        <EmptyState mensaje="Aún no hay prospectos en el embudo. Aparecerán cuando los agentes reporten el primero." />
      </>
    );

  return (
    <>
      <PageHeader
        titulo="Embudo"
        subtitulo="Arrastra una tarjeta o usa «Mover a…» para cambiar su estado."
      />
      <div className="grid grid-cols-6 gap-3">
        {COLUMNAS.map((col) => {
          const items = data.filter((p) => p.estado === col);
          return (
            <section
              key={col}
              aria-label={col}
              className="min-h-[320px] rounded-xl border border-line bg-white/70 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (arrastrando !== null) pedirMover(arrastrando, col);
                setArrastrando(null);
              }}
            >
              <h2 className="mb-2 flex items-center justify-between px-2 pt-1 text-sm font-semibold">
                {col}
                <span className="rounded-full bg-brand-soft px-2 text-xs text-brand-strong">
                  {items.length}
                </span>
              </h2>
              <div className="space-y-2">
                {items.map((p) => (
                  <article
                    key={p.id}
                    draggable
                    onDragStart={() => setArrastrando(p.id)}
                    className="anim-pop cursor-grab rounded-lg border border-line bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <NivelBadge nivel={p.nivel} />
                      <Link
                        to={`/prospectos/${p.id}`}
                        className="truncate font-medium text-brand-strong hover:underline"
                      >
                        {p.empresa}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Score {p.score ?? '—'} · {dias(p.reportado_en)}
                    </div>
                    {p.canalizado_a && (
                      <div className="mt-1 truncate text-xs">→ {p.canalizado_a}</div>
                    )}
                    <select
                      aria-label={`Mover ${p.empresa} a`}
                      value=""
                      onChange={(e) => e.target.value && pedirMover(p.id, e.target.value)}
                      className="mt-2 w-full rounded border border-line bg-white px-1 py-1 text-xs"
                    >
                      <option value="">Mover a…</option>
                      {COLUMNAS.filter((c) => c !== col).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {pendiente && (
        <ConfirmDialog
          titulo="¿Marcar como perdido?"
          mensaje="Indica por qué se perdió para aprender de ello."
          pedirMotivo
          confirmar="Marcar perdido"
          onCancel={() => setPendiente(null)}
          onConfirm={(m) => {
            const p = pendiente;
            setPendiente(null);
            void mover(p.id, p.estado, m);
          }}
        />
      )}
    </>
  );
}
