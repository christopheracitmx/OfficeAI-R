import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Skeleton, cx } from '../components/ui';
import { useApi } from '../lib/api';
import type { Coleccion } from '../lib/types-datos';
import { useOficinaActual } from '../lib/useOficinas';
import { DatosNueva } from './DatosNueva';
import { DatosTabla } from './DatosTabla';

/** «Datos»: las colecciones (tablas) del piso. Las crea el dueño y las llenan los agentes con fuente por registro. */
export function Datos() {
  const { oficina } = useOficinaActual();
  const lista = useApi<Coleccion[]>('/colecciones?archivadas=1');
  const [sel, setSel] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);
  const cols = lista.data ?? [];
  const actual = cols.find((c) => c.id === sel) ?? cols.find((c) => c.estado === 'activa') ?? null;

  return (
    <>
      <PageHeader
        titulo="Datos"
        subtitulo={`Tablas del piso «${oficina?.nombre ?? ''}». Cada registro guarda su fuente y su historial; nada se borra, se archiva.`}
        acciones={
          <Button variante="primario" onClick={() => setNueva(true)}>
            Nueva colección
          </Button>
        }
      />
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      {lista.loading && <Skeleton className="h-40 w-full" />}
      {lista.data && cols.length === 0 && (
        <EmptyState
          mensaje="Este piso aún no tiene colecciones. Crea una para que los agentes guarden aquí sus resultados."
          accion={<Button onClick={() => setNueva(true)}>Crear la primera</Button>}
        />
      )}
      {cols.length > 0 && (
        <div className="grid grid-cols-[240px_1fr] gap-6">
          <nav aria-label="Colecciones" className="space-y-1">
            {cols.map((c) => (
              <button
                key={c.id}
                onClick={() => setSel(c.id)}
                aria-current={actual?.id === c.id}
                className={cx(
                  'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                  actual?.id === c.id
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-white hover:bg-brand-soft',
                  c.estado === 'archivada' && 'opacity-60',
                )}
              >
                <div className="font-medium text-deep">{c.nombre}</div>
                <div className="text-xs text-muted">
                  {c.estado === 'archivada' ? 'Archivada · ' : ''}
                  {c.registros} registro(s)
                </div>
              </button>
            ))}
          </nav>
          {actual && (
            <DatosTabla
              key={`${actual.id}-${actual.campos.length}`}
              col={actual}
              onCambio={lista.reload}
            />
          )}
        </div>
      )}
      {nueva && (
        <DatosNueva
          onCerrar={() => setNueva(false)}
          onCreada={(c) => {
            setNueva(false);
            setSel(c.id);
            lista.reload();
          }}
        />
      )}
      <Card className="mt-6 text-sm text-muted">
        Los agentes escriben aquí con la herramienta <code>coleccion_upsert</code>: valida el
        esquema, evita duplicados por la clave y exige el enlace de la fuente.
      </Card>
    </>
  );
}
