import { useState } from 'react';
import {
  Button,
  Card,
  CopyButton,
  EmptyState,
  ErrorBanner,
  PageHeader,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { fechaCorta, type Config, type Corrida as CorridaT, type EstadoApp } from '../lib/types';

const FIN: Record<string, string> = {
  en_curso: 'En curso',
  terminada: 'Terminada',
  detenida: 'Detenida',
  pausada_limite_plan: 'Pausada: límite del plan de IA',
  pausada_cuota_places: 'Pausada: cuota de Places',
  error: 'Error',
};

export function Corrida() {
  const estado = useApi<EstadoApp>('/estado', { refreshMs: 5000 });
  const cfg = useApi<Config>('/config');
  const giros = useApi<{ id: number; nombre: string }[]>('/config/giros');
  const hist = useApi<CorridaT[]>('/corridas', { refreshMs: 8000 });
  const toast = useToast();
  const [zona, setZona] = useState('');
  const [giro, setGiro] = useState('Cualquiera');
  const [max, setMax] = useState<number | null>(null);

  const zonas = cfg.data?.zonas_piloto ?? [];
  const zonaSel = zona || zonas[0] || '';
  const maxSel = max ?? cfg.data?.max_empresas_por_corrida ?? 10;
  const activa = estado.data?.corrida_activa ?? null;

  const iniciar = async () => {
    try {
      await api('/corridas', {
        method: 'POST',
        body: { zona: zonaSel, giro, max_empresas: maxSel },
      });
      toast('Corrida registrada. Pídele a Michael que la ejecute.');
      estado.reload();
      hist.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo iniciar', 'error');
    }
  };
  const detener = async () => {
    if (!activa) return;
    try {
      await api(`/corridas/${activa.id}/detener`, { method: 'POST', body: {} });
      toast('Corrida detenida');
      estado.reload();
      hist.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo detener', 'error');
    }
  };

  const usado = estado.data?.places.usado ?? 0;
  const tope = estado.data?.places.tope ?? 1;
  const sel = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2';
  const instruccion = activa
    ? `Michael, ejecuta la corrida #${activa.id}: zona ${activa.zona}, giro ${activa.giro}, máximo ${activa.max_empresas} empresas. Usa el pipeline completo y respeta el máximo.`
    : '';

  return (
    <>
      <PageHeader
        titulo="Corrida"
        subtitulo="Nada corre solo: los agentes trabajan únicamente cuando tú lo indicas."
      />
      {estado.error && <ErrorBanner mensaje={estado.error} onRetry={estado.reload} />}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <h2 className="mb-4 font-semibold">
            {activa ? `Corrida #${activa.id} en curso` : 'Nueva corrida'}
          </h2>
          {activa ? (
            <>
              <p className="mb-3">
                Zona <b>{activa.zona}</b> · Giro <b>{activa.giro}</b> · Máximo{' '}
                <b>{activa.max_empresas}</b> empresas · desde {fechaCorta(activa.iniciada_en)}
              </p>
              <div className="rounded-lg bg-brand-soft p-4">
                <p className="mb-2 text-sm text-muted">
                  Para ponerla en marcha, copia esta instrucción y pégala en Munder Difflin:
                </p>
                <p className="rounded bg-white p-3 text-sm">{instruccion}</p>
                <div className="mt-2">
                  <CopyButton texto={instruccion} etiqueta="Copiar instrucción para Michael" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variante="peligro" onClick={() => void detener()}>
                  Detener corrida
                </Button>
                <a href="/oficina">
                  <Button>Ver oficina</Button>
                </a>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <label className="block text-muted">
                  Zona
                  <select className={sel} value={zonaSel} onChange={(e) => setZona(e.target.value)}>
                    {zonas.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-muted">
                  Giro
                  <select className={sel} value={giro} onChange={(e) => setGiro(e.target.value)}>
                    <option>Cualquiera</option>
                    {(giros.data ?? []).map((g) => (
                      <option key={g.id}>{g.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-muted">
                  Máximo de empresas
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className={sel}
                    value={maxSel}
                    onChange={(e) => setMax(Number(e.target.value))}
                  />
                </label>
              </div>
              <p className="text-sm text-muted">
                Una corrida consume plan de IA ({estado.data?.motor_ia ?? '—'}). Lotes pequeños
                cuidan tu plan.
              </p>
              <Button
                variante="primario"
                disabled={!zonaSel || maxSel < 1 || maxSel > 50}
                onClick={() => void iniciar()}
              >
                Iniciar corrida
              </Button>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Antes de iniciar</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-muted">Cuota de Places este mes</dt>
              <dd className="font-semibold">
                {usado.toLocaleString('es-MX')} de {tope.toLocaleString('es-MX')}
              </dd>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.min((usado / tope) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <dt className="text-muted">Motor de IA activo</dt>
              <dd className="font-semibold">{estado.data?.motor_ia ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Correo de alertas</dt>
              <dd className="font-semibold">
                {estado.data?.resend_configurado ? 'Resend conectado' : '⚠ Resend sin configurar'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Historial de corridas</h2>
      {hist.data && hist.data.length === 0 && (
        <EmptyState mensaje="Aún no hay corridas. Inicia la primera para ver resultados aquí." />
      )}
      {hist.data && hist.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-ice text-xs uppercase tracking-wide text-muted">
              <tr>
                {['#', 'Fecha', 'Zona', 'Giro', 'Máx.', 'Resultado'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {hist.data.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">{c.id}</td>
                  <td className="px-4 py-2.5">{fechaCorta(c.iniciada_en)}</td>
                  <td className="px-4 py-2.5">{c.zona}</td>
                  <td className="px-4 py-2.5">{c.giro}</td>
                  <td className="px-4 py-2.5">{c.max_empresas}</td>
                  <td className="px-4 py-2.5">
                    {FIN[c.estado] ?? c.estado}
                    {c.motivo_fin ? <span className="text-muted"> · {c.motivo_fin}</span> : null}
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
