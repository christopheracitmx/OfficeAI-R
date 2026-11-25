import { useState } from 'react';
import { Card, EmptyState, ErrorBanner, Skeleton } from '../components/ui';
import { useApi } from '../lib/api';
import type { PasoOficina } from '../lib/types';

/** Vista de solo lectura del prompt EXACTO que recibe un paso, con estimado de tokens. */
export function PromptFinal() {
  const pasos = useApi<PasoOficina[]>('/prompts-pasos');
  const [paso, setPaso] = useState('');
  const elegido = paso || pasos.data?.[0]?.paso || '';
  const final = useApi<{ texto: string; tokens: number }>(
    elegido ? `/prompt-final?paso=${elegido}` : '/prompts-pasos',
  );
  const f = elegido && final.data && 'texto' in final.data ? final.data : null;

  if (pasos.error) return <ErrorBanner mensaje={pasos.error} onRetry={pasos.reload} />;
  if (!pasos.data) return <Skeleton className="h-40" />;
  if (pasos.data.length === 0)
    return (
      <EmptyState mensaje="El servidor no tiene el runner activo: no hay pasos que mostrar." />
    );
  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-muted">Paso</span>
          <select
            value={elegido}
            onChange={(e) => setPaso(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2"
          >
            {pasos.data.map((p) => (
              <option key={p.paso} value={p.paso}>
                {p.roles.join(' + ')} ({p.paso})
              </option>
            ))}
          </select>
        </label>
        {pasos.data.find((p) => p.paso === elegido)?.modelo && (
          <span
            className="rounded-full border border-line px-3 py-1 text-sm"
            title="Se cambia con el campo «modelo» del paso en workflow.json o con «modelo:» en engine.yaml"
          >
            Modelo: {pasos.data.find((p) => p.paso === elegido)?.modelo}
          </span>
        )}
        {f && (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-sm">
            ≈ {f.tokens.toLocaleString('es-MX')} tokens de prompt
          </span>
        )}
      </div>
      <p className="mb-2 text-sm text-muted">
        Orden: global → rol → lecciones aprobadas → habilidades activas → contexto de la corrida →
        candados fijos (siempre al final, no editables).
      </p>
      {final.error && <ErrorBanner mensaje={final.error} onRetry={final.reload} />}
      {f ? (
        <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg bg-ice p-4 text-[13px]">
          {f.texto}
        </pre>
      ) : (
        <Skeleton className="h-40" />
      )}
    </Card>
  );
}
