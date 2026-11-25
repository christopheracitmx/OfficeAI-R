import { useState } from 'react';
import { EmptyState, ErrorBanner, PageHeader, cx } from '../components/ui';
import { useApi } from '../lib/api';
import type { FilaPrompt } from '../lib/types';
import { PromptEditor } from './PromptEditor';
import { PromptFinal } from './PromptFinal';

export function Prompts() {
  const lista = useApi<FilaPrompt[]>('/prompts');
  const [sel, setSel] = useState('_comun');
  const [vista, setVista] = useState<'editar' | 'final'>('editar');
  return (
    <>
      <PageHeader
        titulo="Prompts"
        subtitulo="Instrucciones de cada agente, con versiones y rollback. Cada guardado crea una versión nueva; nada se pierde."
      />
      <div className="mb-4 flex gap-2" role="tablist">
        {(['editar', 'final'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={vista === t}
            onClick={() => setVista(t)}
            className={cx(
              'rounded-lg border px-4 py-2',
              vista === t ? 'border-brand bg-brand-soft font-medium' : 'border-line bg-white',
            )}
          >
            {t === 'editar' ? 'Editar prompts' : 'Prompt final compuesto'}
          </button>
        ))}
      </div>
      {vista === 'final' ? (
        <PromptFinal />
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-4">
          <div>
            {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
            {lista.data?.length === 0 && <EmptyState mensaje="Sin prompts cargados." />}
            <ul className="space-y-1">
              {lista.data?.map((p) => (
                <li key={p.prompt}>
                  <button
                    onClick={() => setSel(p.prompt)}
                    className={cx(
                      'w-full rounded-lg border px-3 py-2 text-left hover:bg-brand-soft',
                      sel === p.prompt ? 'border-brand bg-brand-soft' : 'border-line bg-white',
                    )}
                  >
                    <div className="font-medium">
                      {p.prompt === '_comun' ? 'Global (común)' : p.prompt}
                    </div>
                    <div className="text-xs text-muted">
                      v{p.version} · ≈{p.tokens} tokens
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <PromptEditor nombre={sel} onGuardado={lista.reload} />
        </div>
      )}
    </>
  );
}
