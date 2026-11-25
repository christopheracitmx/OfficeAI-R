import { useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Skeleton,
  cx,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import {
  fechaCorta,
  type EstimadoIaUi,
  type EvaluacionDetalleUi,
  type EvaluacionUi,
} from '../lib/types';
import { CasosLista } from './CasosDorados';
import { inp } from './ConfListas';

const nota = (e: EvaluacionUi): string =>
  e.criterios_total > 0 ? `${Math.round((e.criterios_ok / e.criterios_total) * 100)} %` : '—';

/** Matriz caso x evaluación: qué pasa/falla en cada versión. */
function Comparar({ ids }: { ids: number[] }) {
  const d1 = useApi<EvaluacionDetalleUi>(`/evaluaciones/${ids[0]}`);
  const d2 = useApi<EvaluacionDetalleUi>(`/evaluaciones/${ids[1] ?? ids[0]}`);
  if (!d1.data || !d2.data) return <Skeleton className="h-24" />;
  const cols = ids.length > 1 ? [d1.data, d2.data] : [d1.data];
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full">
        <caption className="sr-only">Comparación de evaluaciones por caso</caption>
        <thead className="border-b border-line bg-ice">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-xs uppercase text-muted">
              Caso
            </th>
            {cols.map((c) => (
              <th
                key={c.resumen.id}
                scope="col"
                className="px-3 py-2 text-left text-xs uppercase text-muted"
              >
                {c.resumen.etiqueta} ({nota(c.resumen)})
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cols[0]!.casos.map((c) => (
            <tr key={c.caso_id}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {c.caso_nombre}
              </th>
              {cols.map((col) => {
                const x = col.casos.find((y) => y.caso_id === c.caso_id);
                const fallos = x?.resultados.filter((r) => !r.ok) ?? [];
                return (
                  <td key={col.resumen.id} className="px-3 py-2">
                    {!x ? (
                      '—'
                    ) : x.ok ? (
                      <span className="text-ok">✓ pasa</span>
                    ) : (
                      <span
                        className="text-bad"
                        title={fallos.map((r) => `${r.criterio}: ${r.detalle}`).join('\n')}
                      >
                        ✗ {fallos.length} criterio(s): {fallos.map((r) => r.criterio).join(', ')}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Evaluar({ onListo }: { onListo: () => void }) {
  const toast = useToast();
  const est = useApi<EstimadoIaUi>('/evaluaciones-estimado');
  const [etiqueta, setEtiqueta] = useState('');
  const [cambio, setCambio] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const ejecutar = async () => {
    setConfirmando(false);
    setTrabajando(true);
    setFallo(null);
    try {
      const r = await api<EvaluacionUi>('/evaluaciones', {
        method: 'POST',
        body: {
          etiqueta: etiqueta.trim(),
          ...(cambio.trim() ? { cambio: cambio.trim() } : {}),
          confirmado: true,
        },
      });
      toast(`Evaluación lista: ${nota(r)} de criterios cumplidos`);
      onListo();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'Error');
    } finally {
      setTrabajando(false);
    }
  };
  const tokens = est.data?.tokens ?? 0;
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Evaluar un cambio</h2>
      <p className="text-muted">
        Corre los casos activos con el prompt real de cada agente (más el texto que quieras probar)
        y revisa los criterios por código. Déjalo vacío para medir la línea base. Gasta plan: se
        pide confirmación.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Etiqueta de la evaluación"
          className={cx(inp, 'w-64')}
          placeholder="Etiqueta (p. ej. «Línea base»)"
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
        />
        <input
          aria-label="Cambio a evaluar"
          className={cx(inp, 'min-w-[320px] flex-1')}
          maxLength={300}
          placeholder="Lección o cambio de prompt a probar (opcional, máx. 300)"
          value={cambio}
          onChange={(e) => setCambio(e.target.value)}
        />
        <Button
          variante="primario"
          disabled={trabajando || etiqueta.trim().length < 2}
          onClick={() => setConfirmando(true)}
        >
          {trabajando ? 'Evaluando…' : 'Evaluar'}
        </Button>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {est.data
          ? `Consumo estimado ≈ ${tokens.toLocaleString('es-MX')} tokens (${est.data.casos} casos) con ${est.data.modelo}.`
          : 'Calculando estimado…'}
      </p>
      {fallo && <ErrorBanner mensaje={fallo} />}
      {confirmando && (
        <ConfirmDialog
          titulo="¿Ejecutar la evaluación?"
          mensaje={`Hará ${est.data?.casos ?? 0} llamadas a la IA (≈ ${tokens.toLocaleString('es-MX')} tokens de tu plan). Se detiene sola si llega a la reserva del plan.`}
          confirmar="Sí, evaluar"
          onCancel={() => setConfirmando(false)}
          onConfirm={() => void ejecutar()}
        />
      )}
    </Card>
  );
}

/** Casos dorados + evaluación comparable entre versiones. */
export function Evaluaciones() {
  const ev = useApi<EvaluacionUi[]>('/evaluaciones');
  const [sel, setSel] = useState<number[]>([]);
  const alternar = (id: number) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));
  return (
    <div className="space-y-6">
      <Evaluar onListo={ev.reload} />
      <section aria-label="Evaluaciones guardadas" className="space-y-3">
        <h2 className="font-semibold">Evaluaciones guardadas</h2>
        {ev.error ? (
          <ErrorBanner mensaje={ev.error} onRetry={ev.reload} />
        ) : !ev.data ? (
          <Skeleton className="h-20" />
        ) : ev.data.length === 0 ? (
          <EmptyState mensaje="Aún no hay evaluaciones. Corre una «línea base» para tener contra qué comparar." />
        ) : (
          <>
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {ev.data.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Comparar ${e.etiqueta}`}
                      checked={sel.includes(e.id)}
                      onChange={() => alternar(e.id)}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{e.etiqueta}</span>
                      <span className="text-muted">
                        {' '}
                        · {fechaCorta(e.creado_en)} · {e.modelo ?? ''}
                        {e.cambio ? ` · cambio: «${e.cambio}»` : ' · línea base'}
                      </span>
                      {e.estado !== 'terminada' && (
                        <span className="text-warn"> · incompleta: {e.nota}</span>
                      )}
                    </span>
                    <span className="font-semibold">{nota(e)}</span>
                    <span className="text-sm text-muted">
                      {e.aprobados}/{e.casos} casos · {e.tokens.toLocaleString('es-MX')} tok
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <p className="text-sm text-muted">
              Marca hasta dos evaluaciones para compararlas caso por caso.
            </p>
            {sel.length > 0 && <Comparar key={sel.join('-')} ids={sel} />}
          </>
        )}
      </section>
      <section aria-label="Casos dorados" className="space-y-3">
        <h2 className="font-semibold">Casos dorados</h2>
        <CasosLista />
      </section>
    </div>
  );
}
