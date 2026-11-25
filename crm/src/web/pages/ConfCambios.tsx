import { useState } from 'react';
import { Card, EmptyState, ErrorBanner, Skeleton, cx } from '../components/ui';
import { useApi } from '../lib/api';
import { fechaCorta, type CambioUi } from '../lib/types';
import { inp } from './ConfListas';

/** Registro de cambios consultable: cuándo cambió qué (prompts, lecciones, Biblioteca, respaldos...). */
export function ConfCambios() {
  const c = useApi<CambioUi[]>('/cambios?limit=500');
  const [entidad, setEntidad] = useState('');
  const [q, setQ] = useState('');
  if (c.error) return <ErrorBanner mensaje={c.error} onRetry={c.reload} />;
  if (!c.data) return <Skeleton className="h-32" />;
  const entidades = [...new Set(c.data.map((x) => x.entidad))].sort();
  const filtro = q.trim().toLowerCase();
  const filas = c.data.filter(
    (x) =>
      (!entidad || x.entidad === entidad) &&
      (!filtro ||
        `${x.accion} ${x.detalle ?? ''} ${x.entidad_ref ?? ''}`.toLowerCase().includes(filtro)),
  );
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filtrar por tipo"
          className={inp}
          value={entidad}
          onChange={(e) => setEntidad(e.target.value)}
        >
          <option value="">Todo</option>
          {entidades.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <input
          aria-label="Buscar en el registro"
          className={cx(inp, 'w-64')}
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="self-center text-sm text-muted">
          {filas.length} de {c.data.length} (últimos 500)
        </span>
      </div>
      {filas.length === 0 ? (
        <EmptyState mensaje="Sin cambios registrados con ese filtro." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full">
            <caption className="sr-only">Registro de cambios</caption>
            <thead className="border-b border-line bg-ice text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Cuándo
                </th>
                <th scope="col" className="px-3 py-2">
                  Qué
                </th>
                <th scope="col" className="px-3 py-2">
                  Quién
                </th>
                <th scope="col" className="px-3 py-2">
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filas.map((x) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">
                    {fechaCorta(x.creado_en)}
                  </td>
                  <td className="px-3 py-2">
                    <b>{x.entidad}</b>
                    {x.entidad_ref ? ` · ${x.entidad_ref}` : ''} — {x.accion}
                  </td>
                  <td className="px-3 py-2">Dueño</td>
                  <td className="px-3 py-2 text-muted">{x.detalle ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
