import { useState } from 'react';
import { Button, Card, ErrorBanner, useToast, cx } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fechaCorta } from '../lib/types';
import type { EstadoArchivos } from '../lib/types-datos';

const ETQ: Record<string, string> = {
  listar: 'Listó',
  leer: 'Leyó',
  mover_cuarentena: 'Movió a cuarentena',
  revertir: 'Revirtió',
};

/** Archivos seguros del piso: carpetas autorizadas, activación (apagado por defecto) y registro con «Revertir». */
export function ConfArchivos({ oficina, onCambio }: { oficina: string; onCambio: () => void }) {
  const est = useApi<EstadoArchivos>(`/oficinas/${oficina}/archivos`, { refreshMs: 10000 });
  const toast = useToast();
  const [ruta, setRuta] = useState('');
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      est.reload();
      onCambio();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const d = est.data;
  return (
    <Card>
      <h3 className="font-semibold text-deep">Archivos (sandbox)</h3>
      <p className="mt-1 text-sm text-muted">
        Los agentes solo pueden listar y leer archivos de texto dentro de las carpetas que autorices
        aquí. «Mover» manda el archivo a una carpeta <code>_cuarentena</code> dentro de la misma
        carpeta (reversible). <b>Nunca se borra nada.</b> Desactivado por defecto.
      </p>
      {est.error && <ErrorBanner mensaje={est.error} onRetry={est.reload} />}
      {d && (
        <>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={d.activo}
              onChange={(e) =>
                void run(
                  () =>
                    api(`/oficinas/${oficina}/archivos`, {
                      method: 'PUT',
                      body: { activo: e.target.checked },
                    }),
                  e.target.checked ? 'Archivos activados' : 'Archivos desactivados',
                )
              }
            />
            <span className={cx('font-medium', d.activo ? 'text-ok' : 'text-muted')}>
              {d.activo ? 'Activados en este piso' : 'Desactivados'}
            </span>
          </label>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {d.carpetas.length === 0 && (
              <li className="px-3 py-2 text-muted">Sin carpetas autorizadas.</li>
            )}
            {d.carpetas.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <code className="flex-1 break-all text-sm">{c.ruta}</code>
                <Button
                  variante="fantasma"
                  onClick={() =>
                    void run(
                      () =>
                        api(`/oficinas/${oficina}/archivos/carpetas/${c.id}`, { method: 'DELETE' }),
                      'Carpeta quitada',
                    )
                  }
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  api(`/oficinas/${oficina}/archivos/carpetas`, {
                    method: 'POST',
                    body: { ruta },
                  }).then(() => setRuta('')),
                'Carpeta autorizada',
              );
            }}
          >
            <input
              aria-label="Ruta absoluta de la carpeta"
              value={ruta}
              onChange={(e) => setRuta(e.target.value)}
              placeholder="C:\Documentos\Facturas"
              className="flex-1 rounded-lg border border-line px-3 py-2"
            />
            <Button type="submit" disabled={ruta.trim().length < 3}>
              Autorizar carpeta
            </Button>
          </form>
          <h4 className="mt-5 text-sm font-semibold text-deep">Registro de cambios de archivos</h4>
          <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
            {d.log.length === 0 && <li className="px-3 py-2 text-muted">Sin actividad todavía.</li>}
            {d.log.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-32 shrink-0 text-xs text-muted">{fechaCorta(l.creado_en)}</span>
                <span className="flex-1 break-all">
                  <b>{ETQ[l.accion] ?? l.accion}</b> {l.ruta}
                  {l.destino && <span className="text-muted"> → {l.destino}</span>}
                  {l.detalle && <span className="text-muted"> ({l.detalle})</span>}
                </span>
                {l.accion === 'mover_cuarentena' && (
                  <Button
                    variante="fantasma"
                    onClick={() =>
                      void run(
                        () =>
                          api(`/oficinas/${oficina}/archivos/log/${l.id}/revertir`, {
                            method: 'POST',
                            body: {},
                          }),
                        'Archivo devuelto a su lugar',
                      )
                    }
                  >
                    Revertir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
