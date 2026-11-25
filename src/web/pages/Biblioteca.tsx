import { useState } from 'react';
import { PageHeader, cx } from '../components/ui';
import { BibliotecaDocs } from './BibliotecaDocs';
import { BibliotecaProductos } from './BibliotecaProductos';

const TABS = [
  { id: 'docs', etiqueta: 'Documentos' },
  { id: 'productos', etiqueta: 'Productos' },
] as const;

export function Biblioteca() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('docs');
  return (
    <>
      <PageHeader
        titulo="Biblioteca"
        subtitulo="La fuente única de verdad de la oficina: los agentes consultan fragmentos de aquí en lugar de adivinar. Nunca guarda precios."
      />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2',
              tab === t.id
                ? 'border-brand font-medium text-deep'
                : 'border-transparent text-muted hover:text-deep',
            )}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>
      {tab === 'docs' ? <BibliotecaDocs /> : <BibliotecaProductos />}
    </>
  );
}
