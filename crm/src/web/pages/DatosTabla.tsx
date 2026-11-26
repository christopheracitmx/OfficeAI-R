import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Skeleton, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { oficinaActiva } from '../lib/oficinaActiva';
import type { Coleccion, ListaRegistros, Registro, ValorDato } from '../lib/types-datos';
import { DatosRegistro } from './DatosRegistro';

const mostrar = (v: ValorDato | undefined): string =>
  v === undefined ? '' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);

/** Vista de tabla de una colección: buscar, filtrar por estado, editar, archivar/restaurar y exportar CSV. */
export function DatosTabla({ col, onCambio }: { col: Coleccion; onCambio: () => void }) {
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'activo' | 'archivado'>('activo');
  const [form, setForm] = useState<{ r: Registro | null } | null>(null);
  const toast = useToast();
  const ruta = `/colecciones/${col.id}/registros?estado=${estado}&limite=200${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''}`;
  const lista = useApi<ListaRegistros>(ruta);
  const archivada = col.estado === 'archivada';

  const accion = async (r: Registro, a: 'archivar' | 'restaurar') => {
    try {
      await api(`/colecciones/${col.id}/registros/${r.id}/${a}`, { method: 'POST', body: {} });
      toast(a === 'archivar' ? 'Registro archivado' : 'Registro restaurado');
      lista.reload();
      onCambio();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const estadoColeccion = async (a: 'archivar' | 'restaurar') => {
    try {
      await api(`/colecciones/${col.id}/${a}`, { method: 'POST', body: {} });
      onCambio();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-deep">{col.nombre}</h2>
          <p className="text-sm text-muted">
            {col.descripcion || 'Sin descripción'} ·{' '}
            {col.clave
              ? `clave: ${col.campos.find((c) => c.nombre === col.clave)?.etiqueta}`
              : 'sin clave'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!archivada && (
            <Button variante="primario" onClick={() => setForm({ r: null })}>
              Nuevo registro
            </Button>
          )}
          <a
            className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-deep hover:bg-brand-soft"
            href={`/api/colecciones/${col.id}/csv?office_id=${encodeURIComponent(oficinaActiva())}`}
            download
          >
            Exportar CSV
          </a>
          <Button
            variante="fantasma"
            onClick={() => void estadoColeccion(archivada ? 'restaurar' : 'archivar')}
          >
            {archivada ? 'Restaurar colección' : 'Archivar colección'}
          </Button>
        </div>
      </div>
      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusqueda(q.trim());
        }}
      >
        <input
          aria-label="Buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar texto…"
          className="w-64 rounded-lg border border-line px-3 py-2"
        />
        <Button type="submit">Buscar</Button>
        <select
          aria-label="Estado"
          value={estado}
          onChange={(e) => setEstado(e.target.value as 'activo' | 'archivado')}
          className="rounded-lg border border-line px-3 py-2"
        >
          <option value="activo">Activos</option>
          <option value="archivado">Archivados</option>
        </select>
        {lista.data && <span className="text-sm text-muted">{lista.data.total} registro(s)</span>}
      </form>
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      {lista.loading && <Skeleton className="mt-4 h-32 w-full" />}
      {lista.data && lista.data.registros.length === 0 && (
        <div className="mt-4">
          <EmptyState mensaje="No hay registros con este filtro." />
        </div>
      )}
      {lista.data && lista.data.registros.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                {col.campos.map((c) => (
                  <th key={c.nombre} className="px-2 py-2">
                    {c.etiqueta}
                  </th>
                ))}
                <th className="px-2 py-2">Fuente</th>
                <th className="px-2 py-2">v</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.data.registros.map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top">
                  {col.campos.map((c) => (
                    <td key={c.nombre} className="max-w-[220px] break-words px-2 py-2">
                      {mostrar(r.datos[c.nombre])}
                    </td>
                  ))}
                  <td className="max-w-[160px] break-all px-2 py-2">
                    {r.fuente_url ? (
                      <a
                        className="text-brand-strong underline"
                        href={r.fuente_url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        enlace
                      </a>
                    ) : (
                      <span className="text-muted">{r.nota}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted">{r.version}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {estado === 'activo' ? (
                      <>
                        <Button variante="fantasma" onClick={() => setForm({ r })}>
                          Editar
                        </Button>
                        <Button variante="fantasma" onClick={() => void accion(r, 'archivar')}>
                          Archivar
                        </Button>
                      </>
                    ) : (
                      <Button variante="fantasma" onClick={() => void accion(r, 'restaurar')}>
                        Restaurar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <DatosRegistro
          col={col}
          registro={form.r}
          onCerrar={() => setForm(null)}
          onGuardado={() => {
            setForm(null);
            lista.reload();
            onCambio();
          }}
        />
      )}
    </Card>
  );
}
