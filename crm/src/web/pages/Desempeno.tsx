import { Card, EmptyState, ErrorBanner, KPICard, Skeleton } from '../components/ui';
import { useApi } from '../lib/api';
import type { DesempenoUi, PuntoTendenciaUi } from '../lib/types';

const pct = (v: number | null): string => (v === null ? '—' : `${v} %`);
const num = (v: number | null): string => (v === null ? '—' : v.toLocaleString('es-MX'));

/** Tendencia por corrida: barras de tokens por empresa (solo transform/opacity, sin animación de layout). */
function Tendencia({ puntos }: { puntos: PuntoTendenciaUi[] }) {
  const vals = puntos.map((p) => p.tokens_por_empresa ?? 0);
  const max = Math.max(1, ...vals);
  if (puntos.length === 0) return <span className="text-muted">—</span>;
  return (
    <svg
      width={Math.max(24, puntos.length * 10)}
      height="24"
      role="img"
      aria-label={`Tokens por empresa en ${puntos.length} corrida(s): ${puntos.map((p) => `#${p.corrida_id} ${p.tokens_por_empresa ?? 's/d'}`).join(', ')}`}
    >
      {puntos.map((p, i) => {
        const h = Math.max(2, Math.round(((p.tokens_por_empresa ?? 0) / max) * 22));
        return (
          <rect
            key={p.corrida_id}
            x={i * 10}
            y={24 - h}
            width="7"
            height={h}
            rx="1.5"
            fill="var(--color-brand)"
          >
            <title>{`Corrida #${p.corrida_id}: ${num(p.tokens_por_empresa)} tokens/empresa, ${p.ok_pct} % ok`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted';

/** Tablero de desempeño por agente y resumen por oficina. */
export function Desempeno() {
  const d = useApi<DesempenoUi>('/desempeno');
  if (d.error) return <ErrorBanner mensaje={d.error} onRetry={d.reload} />;
  if (!d.data) return <Skeleton className="h-64" />;
  const o = d.data.oficina;
  const res = Object.entries(o.resultados);
  if (o.llamadas === 0 && o.qa_revisiones === 0 && d.data.agentes.every((a) => a.llamadas === 0))
    return (
      <EmptyState mensaje="Aún no hay datos de desempeño: aparecen tras la primera corrida y con tu retroalimentación." />
    );
  return (
    <div className="space-y-6">
      <section aria-label="Resumen de la oficina" className="grid grid-cols-4 gap-4">
        <KPICard
          titulo="Aprobación de QA"
          valor={pct(o.qa_aprobacion_pct)}
          nota={`${o.qa_revisiones} revisiones · ${o.devoluciones} devoluciones`}
        />
        <KPICard
          titulo="Tokens por prospecto"
          valor={num(o.tokens_por_prospecto)}
          nota={`${num(o.tokens)} ponderados en ${o.corridas} corrida(s)`}
        />
        <KPICard
          titulo="Tu opinión"
          valor={`👍 ${o.aciertos_dueno} · 👎 ${o.errores_dueno}`}
          nota="Retroalimentación manual"
        />
        <KPICard
          titulo="Resultados del dueño"
          valor={res.reduce((t, [, v]) => t + v, 0)}
          nota={`${res.map(([k, v]) => `${k} ${v}`).join(' · ') || 'Sin resultados aún'} — ${o.prospectos} prospectos · ${o.lecciones.aprobadas} lecciones activas · ${o.lecciones.propuestas} por revisar`}
        />
      </section>
      <Card className="overflow-x-auto p-0">
        <table className="w-full">
          <caption className="sr-only">Desempeño por agente</caption>
          <thead className="border-b border-line bg-ice">
            <tr>
              {[
                'Agente',
                'Llamadas',
                'OK',
                'Tokens/empresa',
                'Tiempo medio',
                'Aprobación QA',
                'Devoluciones',
                '👍 / 👎',
                'Lecciones',
                'Tendencia',
              ].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.data.agentes.map((a) => (
              <tr key={a.agente}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {a.agente}
                </th>
                <td className="px-3 py-2">{a.llamadas}</td>
                <td className="px-3 py-2">{pct(a.ok_pct)}</td>
                <td className="px-3 py-2">{num(a.tokens_por_empresa)}</td>
                <td className="px-3 py-2">
                  {a.tiempo_medio_s === null ? '—' : `${a.tiempo_medio_s} s`}
                </td>
                <td className="px-3 py-2">
                  {a.qa_revisiones > 0 ? `${pct(a.qa_aprobacion_pct)} (${a.qa_revisiones})` : '—'}
                </td>
                <td className="px-3 py-2">{a.devoluciones}</td>
                <td className="px-3 py-2">
                  {a.aciertos_dueno} / {a.errores_dueno}
                </td>
                <td className="px-3 py-2">
                  {a.lecciones_aprobadas} activas
                  {a.lecciones_propuestas > 0 ? ` · ${a.lecciones_propuestas} por revisar` : ''}
                </td>
                <td className="px-3 py-2">
                  <Tendencia puntos={a.tendencia} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted">
        Tokens ponderados = entrada + salida + 1.25 × caché escrita + 0.1 × caché leída.
        «Tendencia»: tokens por empresa en las últimas corridas (más a la derecha, más reciente).
      </p>
    </div>
  );
}
