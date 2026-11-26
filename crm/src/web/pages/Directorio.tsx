import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { METODO_ETIQUETA, fechaCorta, type EmpresaDir } from '../lib/types';

const ETAPAS = ['descubierta', 'filtrada', 'enriquecida', 'analizada', 'prospecto', 'descartada'];

export function Directorio() {
  const [etapa, setEtapa] = useState('');
  const [metodo, setMetodo] = useState('');
  const [q, setQ] = useState('');
  const [descartando, setDescartando] = useState<EmpresaDir | null>(null);
  const [nueva, setNueva] = useState({ nombre: '', sitio_web: '', direccion: '' });
  const [agregando, setAgregando] = useState(false);
  const toast = useToast();
  const qs = new URLSearchParams();
  if (etapa) qs.set('etapa', etapa);
  if (metodo) qs.set('metodo', metodo);
  if (q) qs.set('q', q);
  const { data, loading, error, reload } = useApi<EmpresaDir[]>(`/directorio?${qs.toString()}`);

  const conteo = (campo: 'etapa' | 'metodo_descubrimiento') => {
    const m = new Map<string, number>();
    (data ?? []).forEach((e) => m.set(e[campo], (m.get(e[campo]) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const sel = 'rounded-lg border border-line bg-white px-3 py-2';

  const agregar = async () => {
    try {
      await api('/directorio', {
        method: 'POST',
        body: {
          nombre: nueva.nombre,
          ...(nueva.sitio_web ? { sitio_web: nueva.sitio_web } : {}),
          ...(nueva.direccion ? { direccion: nueva.direccion } : {}),
          origen_nota: 'Agregada manualmente por el dueño',
        },
      });
      toast('Empresa agregada al directorio');
      setNueva({ nombre: '', sitio_web: '', direccion: '' });
      setAgregando(false);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error');
    }
  };

  return (
    <>
      <PageHeader
        titulo="Directorio"
        subtitulo="Todas las empresas que hemos descubierto, de dónde salieron y en qué etapa están."
        acciones={
          <Button variante="primario" onClick={() => setAgregando((v) => !v)}>
            Agregar empresa
          </Button>
        }
      />
      {agregando && (
        <div className="anim-pop mb-4 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 rounded-xl border border-line bg-white p-4">
          <input
            aria-label="Nombre"
            placeholder="Nombre de la empresa"
            value={nueva.nombre}
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
            className={sel}
          />
          <input
            aria-label="Sitio web"
            placeholder="https://sitio.com (opcional)"
            value={nueva.sitio_web}
            onChange={(e) => setNueva({ ...nueva, sitio_web: e.target.value })}
            className={sel}
          />
          <input
            aria-label="Dirección"
            placeholder="Dirección con alcaldía o municipio (opcional)"
            value={nueva.direccion}
            onChange={(e) => setNueva({ ...nueva, direccion: e.target.value })}
            className={sel}
          />
          <Button
            variante="primario"
            disabled={nueva.nombre.trim().length < 2}
            onClick={() => void agregar()}
          >
            Guardar
          </Button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          aria-label="Buscar"
          placeholder="Buscar por nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${sel} w-64`}
        />
        <select
          aria-label="Etapa"
          className={sel}
          value={etapa}
          onChange={(e) => setEtapa(e.target.value)}
        >
          <option value="">Todas las etapas</option>
          {ETAPAS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select
          aria-label="Fuente"
          className={sel}
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
        >
          <option value="">Cualquier fuente</option>
          {Object.entries(METODO_ETIQUETA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {data && data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="font-medium text-deep">{data.length} empresas</span>
          {conteo('etapa').map(([k, n]) => (
            <span key={k} className="rounded-full bg-brand-soft px-2 py-0.5">
              {k}: {n}
            </span>
          ))}
          {conteo('metodo_descubrimiento').map(([k, n]) => (
            <span key={k} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-line">
              {METODO_ETIQUETA[k] ?? k}: {n}
            </span>
          ))}
        </div>
      )}
      {error && <ErrorBanner mensaje={error} onRetry={reload} />}
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState mensaje="El directorio está vacío. Cuando los agentes descubran empresas, aparecerán aquí con su origen." />
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
                  'Fuente',
                  'Tamaño',
                  'Contacto',
                  'Etapa',
                  'Origen',
                  'Fecha',
                  '',
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((e) => (
                <tr key={e.id} className="hover:bg-ice">
                  <td className="px-4 py-3 font-medium">
                    {e.sitio_web ? (
                      <a
                        href={e.sitio_web}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand-strong hover:underline"
                      >
                        {e.nombre}
                      </a>
                    ) : (
                      e.nombre
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{e.giro ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{e.zona ?? '—'}</td>
                  <td className="px-4 py-3" title={e.atribuciones ?? ''}>
                    {METODO_ETIQUETA[e.metodo_descubrimiento] ?? e.metodo_descubrimiento}
                    {e.atribuciones ? (
                      <span className="block max-w-[180px] truncate text-xs text-muted">
                        {e.atribuciones}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {e.personal_est != null ? `${e.personal_est}+ personas` : (e.tamano ?? '—')}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {[e.telefono, e.correo].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {e.etapa}
                    {e.descartada_motivo ? (
                      <span className="text-muted"> · {e.descartada_motivo}</span>
                    ) : null}
                  </td>
                  <td
                    className="max-w-[220px] truncate px-4 py-3 text-muted"
                    title={e.origen_nota ?? ''}
                  >
                    {e.origen_url ? (
                      <a
                        href={e.origen_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand-strong hover:underline"
                      >
                        {e.origen_nota ?? 'ver origen'}
                      </a>
                    ) : (
                      (e.origen_nota ?? '—')
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{fechaCorta(e.creado_en)}</td>
                  <td className="px-4 py-3 text-right">
                    {e.etapa !== 'descartada' && e.etapa !== 'prospecto' && (
                      <Button variante="fantasma" onClick={() => setDescartando(e)}>
                        Descartar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {descartando && (
        <ConfirmDialog
          titulo={`¿Descartar ${descartando.nombre}?`}
          mensaje="Indica el motivo para no volver a trabajarla."
          pedirMotivo
          confirmar="Descartar"
          onCancel={() => setDescartando(null)}
          onConfirm={(motivo) => {
            const emp = descartando;
            setDescartando(null);
            void api(`/empresas/${emp.id}/descartar`, { method: 'POST', body: { motivo } })
              .then(() => {
                toast('Empresa descartada');
                reload();
              })
              .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'error'));
          }}
        />
      )}
    </>
  );
}
