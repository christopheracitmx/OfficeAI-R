import { useState } from 'react';
import { Button, Card, ErrorBanner, Skeleton, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fechaCorta, numeroSeguro } from '../lib/types';

interface Fuente {
  id: string;
  nombre: string;
  tipo: 'api' | 'dataset_local';
  requiere_token: boolean;
  token_configurado: boolean | null;
  activa: boolean;
  limites: string;
  licencia: string;
  atribucion: string;
  info_url: string;
  cuota: { usado: number; tope: number | null; mes: string };
  dataset: {
    version: string;
    fecha_dataset: string | null;
    importado_en: string;
    registros: number;
  } | null;
}
interface Descartada {
  id: string;
  nombre: string;
  motivo: string;
  info_url: string;
}
interface Resp {
  fuentes: Fuente[];
  descartadas: Descartada[];
  config: { tamano_min: number; incluir_sin_tamano: boolean };
}

const inp = 'rounded-lg border border-line bg-white px-3 py-2';

export function ConfFuentes() {
  const { data, error, reload } = useApi<Resp>('/fuentes');
  const toast = useToast();
  const [prueba, setPrueba] = useState<Record<string, string>>({});
  const [min, setMin] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const probar = async (id: string) => {
    setPrueba((p) => ({ ...p, [id]: 'Probando…' }));
    try {
      const r = await api<{ ok: boolean; detalle: string }>(`/fuentes/${id}/probar`, {
        method: 'POST',
      });
      setPrueba((p) => ({ ...p, [id]: `${r.ok ? '✓' : '✗'} ${r.detalle}` }));
      reload();
    } catch (e) {
      setPrueba((p) => ({ ...p, [id]: `✗ ${e instanceof Error ? e.message : 'Error'}` }));
    }
  };
  if (error) return <ErrorBanner mensaje={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <p className="text-muted">
        Fuentes gratuitas que el sistema consulta <b>por código</b> (sin gastar IA) antes de Google
        Places. Los tokens se ponen en el archivo <code>crm\.env</code>; aquí solo se ve si están
        configurados.
      </p>
      <Card>
        <h3 className="mb-2 font-semibold">Filtro de tamaño</h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-muted">
            Personal mínimo estimado (para no gastar IA en micronegocios)
            <input
              aria-label="Personal mínimo"
              type="number"
              min={0}
              className={cx(inp, 'ml-2 w-24')}
              value={min ?? data.config.tamano_min}
              onChange={(e) => setMin(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={data.config.incluir_sin_tamano}
              onChange={(e) =>
                void run(() =>
                  api('/fuentes-config', {
                    method: 'PATCH',
                    body: { incluir_sin_tamano: e.target.checked },
                  }),
                )
              }
            />
            Incluir empresas sin tamaño conocido (OSM, Overture)
          </label>
          <Button
            onClick={() =>
              void run(
                () =>
                  api('/fuentes-config', {
                    method: 'PATCH',
                    body: { tamano_min: numeroSeguro(min ?? '', data.config.tamano_min) },
                  }),
                'Filtro guardado',
              )
            }
          >
            Guardar
          </Button>
        </div>
      </Card>
      {data.fuentes.map((f) => (
        <Card key={f.id}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">
                {f.nombre}{' '}
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-normal">
                  {f.tipo === 'api' ? 'API' : 'Dataset local'}
                </span>
              </h3>
              <p className="text-sm text-muted">{f.limites}</p>
            </div>
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                aria-label={`Activar ${f.nombre}`}
                checked={f.activa}
                onChange={(e) =>
                  void run(() =>
                    api(`/fuentes/${f.id}`, {
                      method: 'PATCH',
                      body: { activa: e.target.checked },
                    }),
                  )
                }
              />
              Activa en este piso
            </label>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {f.requiere_token && (
              <>
                <dt className="text-muted">Token</dt>
                <dd>
                  {f.token_configurado
                    ? 'Configurado ✓'
                    : 'No configurado (ver PASOS-MANUALES-FUENTES.md)'}
                </dd>
              </>
            )}
            <dt className="text-muted">
              {f.tipo === 'api' ? 'Cuota del mes' : 'Consultas del mes'}
            </dt>
            <dd>
              {f.cuota.usado}
              {f.cuota.tope !== null ? ` / ${f.cuota.tope}` : ' (sin tope: local)'}
              {f.cuota.tope !== null && (
                <button
                  className="ml-2 text-brand-strong hover:underline"
                  onClick={() => {
                    const v = window.prompt(
                      'Nuevo tope mensual de solicitudes',
                      String(f.cuota.tope),
                    );
                    if (v !== null)
                      void run(
                        () =>
                          api(`/fuentes/${f.id}`, {
                            method: 'PATCH',
                            body: { tope_mensual: numeroSeguro(v, f.cuota.tope ?? 0) },
                          }),
                        'Tope actualizado',
                      );
                  }}
                >
                  cambiar
                </button>
              )}
            </dd>
            {f.tipo === 'dataset_local' && (
              <>
                <dt className="text-muted">Dataset</dt>
                <dd>
                  {f.dataset
                    ? `${f.dataset.version} · ${f.dataset.registros.toLocaleString('es-MX')} registros · importado ${fechaCorta(f.dataset.importado_en)}`
                    : 'Sin importar todavía'}
                </dd>
              </>
            )}
            <dt className="text-muted">Licencia</dt>
            <dd>
              {f.licencia} ·{' '}
              <a
                className="text-brand-strong hover:underline"
                href={f.info_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                fuente oficial
              </a>
            </dd>
            <dt className="text-muted">Atribución</dt>
            <dd>{f.atribucion}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => void probar(f.id)}>Probar conexión</Button>
            {prueba[f.id] && <span aria-live="polite">{prueba[f.id]}</span>}
          </div>
        </Card>
      ))}
      <Card>
        <h3 className="mb-2 font-semibold">Fuentes descartadas</h3>
        <ul className="space-y-1 text-sm">
          {data.descartadas.map((d) => (
            <li key={d.id}>
              <b>{d.nombre}</b>: {d.motivo}{' '}
              <a
                className="text-brand-strong hover:underline"
                href={d.info_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                ver
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
