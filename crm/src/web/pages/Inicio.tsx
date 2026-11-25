import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  KPICard,
  NivelBadge,
  PageHeader,
  Skeleton,
  EstadoBadge,
} from '../components/ui';
import { useApi } from '../lib/api';
import { METODO_ETIQUETA, type Dashboard } from '../lib/types';

function Barras({ datos, vacio }: { datos: { etiqueta: string; n: number }[]; vacio: string }) {
  if (datos.length === 0) return <p className="text-muted">{vacio}</p>;
  const max = Math.max(...datos.map((d) => d.n), 1);
  return (
    <ul className="space-y-2">
      {datos.map((d) => (
        <li key={d.etiqueta} className="flex items-center gap-3">
          <span className="w-40 truncate text-muted" title={d.etiqueta}>
            {d.etiqueta}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(d.n / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right font-semibold">{d.n}</span>
        </li>
      ))}
    </ul>
  );
}

function PorSemana({ datos }: { datos: Dashboard['por_semana'] }) {
  if (datos.length === 0)
    return <p className="text-muted">Todavía no hay semanas con prospectos reportados.</p>;
  const max = Math.max(...datos.map((d) => d.n), 1);
  return (
    <div className="flex h-36 items-end gap-3" role="img" aria-label="Prospectos nuevos por semana">
      {datos.map((d) => (
        <div key={d.semana} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-semibold">{d.n}</span>
          <div
            className="w-full rounded-t-md bg-brand"
            style={{ height: `${Math.max((d.n / max) * 100, 4)}%` }}
          />
          <span className="text-[11px] text-muted">S{d.semana.split('-')[1]}</span>
        </div>
      ))}
    </div>
  );
}

export function Inicio() {
  const { data, loading, error, reload } = useApi<Dashboard>('/dashboard', { refreshMs: 20000 });
  if (error)
    return (
      <ErrorBanner
        mensaje="No pudimos leer la base de datos. Revisa que el servidor del CRM esté encendido."
        onRetry={reload}
      />
    );
  if (loading || !data) {
    return (
      <>
        <PageHeader titulo="Inicio" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64" />
      </>
    );
  }
  const vacio = data.ultimos.length === 0 && data.directorio_pendiente === 0;
  const avisos: { texto: string; to: string; cta: string }[] = [];
  if (data.sin_ver > 0)
    avisos.push({
      texto: `Tienes ${data.sin_ver} prospecto${data.sin_ver > 1 ? 's' : ''} nuevo${data.sin_ver > 1 ? 's' : ''} sin ver`,
      to: '/prospectos?sinVer=1',
      cta: 'Ver ahora',
    });
  if (data.correos_fallidos > 0)
    avisos.push({
      texto: `${data.correos_fallidos} correo${data.correos_fallidos > 1 ? 's' : ''} no se enviaron (los prospectos sí están guardados)`,
      to: '/prospectos',
      cta: 'Revisar',
    });
  const pct = Math.round((data.places.usado / Math.max(data.places.tope, 1)) * 100);
  if (pct >= 80)
    avisos.push({ texto: `Cuota de Places al ${pct} %`, to: '/configuracion', cta: 'Ver cuotas' });

  return (
    <>
      <PageHeader
        titulo="Inicio"
        subtitulo="Así va la prospección de ACITMX."
        acciones={
          <Link to="/corrida">
            <Button variante="primario">Iniciar corrida</Button>
          </Link>
        }
      />
      {avisos.length > 0 && (
        <div className="mb-6 space-y-2">
          {avisos.map((a) => (
            <div
              key={a.texto}
              className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand-soft px-4 py-3"
            >
              <span className="font-medium">{a.texto}</span>
              <Link to={a.to}>
                <Button variante="secundario">{a.cta}</Button>
              </Link>
            </div>
          ))}
        </div>
      )}
      {vacio ? (
        <EmptyState
          mensaje="Aún no hay prospectos. Inicia una corrida para que los agentes busquen empresas en CDMX y Estado de México."
          accion={
            <Link to="/corrida">
              <Button variante="primario">Ir a Corrida</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              titulo="Prospectos esta semana"
              valor={data.semana}
              delta={data.semana - data.semana_anterior}
            />
            <KPICard titulo="Nivel A listos para canalizar" valor={data.nivel_a_pendientes} />
            <KPICard titulo="Canalizados (mes)" valor={data.canalizados_mes} />
            <KPICard titulo="Ganados (mes)" valor={data.ganados_mes} />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Card className="col-span-2">
              <h2 className="mb-4 font-semibold">Prospectos nuevos por semana</h2>
              <PorSemana datos={data.por_semana} />
            </Card>
            <Card>
              <h2 className="mb-4 font-semibold">Embudo</h2>
              <Barras
                datos={data.embudo.map((e) => ({
                  etiqueta: e.estado === 'Revision humana' ? 'Revisión humana' : e.estado,
                  n: e.n,
                }))}
                vacio="Sin prospectos todavía."
              />
            </Card>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Card>
              <h2 className="mb-4 font-semibold">Por giro (top 5)</h2>
              <Barras datos={data.por_giro} vacio="Sin datos de giro." />
            </Card>
            <Card>
              <h2 className="mb-4 font-semibold">Por zona (top 5)</h2>
              <Barras datos={data.por_zona} vacio="Sin datos de zona." />
            </Card>
            <Card>
              <h2 className="mb-1 font-semibold">Directorio</h2>
              <p className="mb-3 text-muted">
                <span className="text-2xl font-bold text-deep">{data.directorio_pendiente}</span>{' '}
                empresas descubiertas sin procesar
              </p>
              <Barras
                datos={data.directorio_por_metodo.map((m) => ({
                  etiqueta: METODO_ETIQUETA[m.metodo] ?? m.metodo,
                  n: m.n,
                }))}
                vacio="Aún no se descubren empresas."
              />
            </Card>
          </div>
          <Card className="mt-4">
            <h2 className="mb-3 font-semibold">Últimos prospectos</h2>
            {data.ultimos.length === 0 ? (
              <p className="text-muted">
                Cuando los agentes aprueben un prospecto, aparecerá aquí.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.ultimos.map((u) => (
                  <li key={u.id}>
                    <Link
                      to={`/prospectos/${u.id}`}
                      className="flex items-center gap-4 py-2.5 hover:bg-ice"
                    >
                      <NivelBadge nivel={u.nivel} />
                      <span className="flex-1 font-medium">{u.empresa}</span>
                      <span className="w-10 text-right font-semibold">{u.score ?? '—'}</span>
                      <EstadoBadge estado={u.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
