import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Button,
  CorreoBadge,
  EmptyState,
  ErrorBanner,
  EstadoBadge,
  NivelBadge,
  PageHeader,
  ScoreBar,
  Skeleton,
} from '../components/ui';
import { useApi } from '../lib/api';
import { METODO_ETIQUETA, fechaCorta, type ProspectoFila } from '../lib/types';

const ESTADOS = [
  'Nuevo',
  'Calificado',
  'Reportado',
  'Canalizado',
  'En contacto',
  'Propuesta',
  'Ganado',
  'Perdido',
  'Descartado',
  'Revision humana',
];

export function Prospectos() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(() => sp.get('q') ?? '');
  const query = new URLSearchParams();
  for (const k of ['estado', 'nivel', 'metodo', 'sinVer', 'zona'])
    if (sp.get(k)) query.set(k, sp.get(k)!);
  if (sp.get('q')) query.set('q', sp.get('q')!);
  const { data, loading, error, reload } = useApi<ProspectoFila[]>(
    `/prospectos?${query.toString()}`,
  );

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };
  const hayFiltros = [...sp.keys()].length > 0;
  const sel = 'rounded-lg border border-line bg-white px-3 py-2';

  return (
    <>
      <PageHeader titulo="Prospectos" subtitulo="Lo nuevo y mejor calificado aparece primero." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim());
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por empresa o dominio"
            aria-label="Buscar"
            className={`${sel} w-64`}
          />
        </form>
        <select
          aria-label="Estado"
          className={sel}
          value={sp.get('estado') ?? ''}
          onChange={(e) => set('estado', e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e === 'Revision humana' ? 'Revisión humana' : e}
            </option>
          ))}
        </select>
        <select
          aria-label="Nivel"
          className={sel}
          value={sp.get('nivel') ?? ''}
          onChange={(e) => set('nivel', e.target.value)}
        >
          <option value="">Todos los niveles</option>
          {['A', 'B', 'C'].map((n) => (
            <option key={n} value={n}>
              Nivel {n}
            </option>
          ))}
        </select>
        <select
          aria-label="Método de descubrimiento"
          className={sel}
          value={sp.get('metodo') ?? ''}
          onChange={(e) => set('metodo', e.target.value)}
        >
          <option value="">Cualquier método</option>
          {Object.entries(METODO_ETIQUETA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={sp.get('sinVer') === '1'}
            onChange={(e) => set('sinVer', e.target.checked ? '1' : '')}
          />{' '}
          Solo sin ver
        </label>
        {hayFiltros && (
          <Button
            variante="fantasma"
            onClick={() => {
              setQ('');
              setSp({}, { replace: true });
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {error && <ErrorBanner mensaje={error} onRetry={reload} />}
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState
          mensaje={
            hayFiltros
              ? 'Ningún prospecto coincide con estos filtros.'
              : 'Cuando los agentes aprueben un prospecto, aparecerá aquí.'
          }
        />
      )}
      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-ice text-xs uppercase tracking-wide text-muted">
              <tr>
                {[
                  'Empresa',
                  'Giro',
                  'Zona',
                  'Score',
                  'Nivel',
                  'Estado',
                  'Canalizado a',
                  'Fecha',
                  'Correo',
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((p) => (
                <tr key={p.id} className="hover:bg-ice">
                  <td className="px-4 py-3">
                    <Link
                      to={`/prospectos/${p.id}`}
                      className="flex items-center gap-2 font-medium text-brand-strong hover:underline"
                    >
                      {p.visto_por_dueno === 0 && (
                        <span className="h-2 w-2 rounded-full bg-brand" title="Sin ver" />
                      )}
                      {p.empresa}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.giro ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{p.zona ?? '—'}</td>
                  <td className="px-4 py-3">
                    <ScoreBar score={p.score} />
                  </td>
                  <td className="px-4 py-3">
                    <NivelBadge nivel={p.nivel} />
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={p.estado} />
                  </td>
                  <td className="px-4 py-3 text-muted">{p.canalizado_a ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">
                    {fechaCorta(p.reportado_en ?? p.creado_en)}
                  </td>
                  <td className="px-4 py-3">
                    <CorreoBadge estado={p.correo_estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
