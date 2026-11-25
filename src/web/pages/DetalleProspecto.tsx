import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  CopyButton,
  CorreoBadge,
  ErrorBanner,
  EstadoBadge,
  NivelBadge,
  Skeleton,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { METODO_ETIQUETA, fechaCorta, type ProspectoDetalle } from '../lib/types';

const ESTADOS = [
  'Nuevo',
  'Calificado',
  'Reportado',
  'Canalizado',
  'En contacto',
  'Propuesta',
  'Ganado',
  'Perdido',
  'Revision humana',
];

const Seccion = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <Card>
    <h2 className="mb-3 font-semibold">{titulo}</h2>
    {children}
  </Card>
);

function Contactos({ d }: { d: ProspectoDetalle }) {
  if (d.contactos.length === 0)
    return <p className="text-warn">⚠ No hay contactos con fuente verificada todavía.</p>;
  return (
    <ul className="divide-y divide-line">
      {d.contactos.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2">
          <Chip>
            {c.tipo === 'telefono' ? 'Teléfono' : c.tipo === 'correo' ? 'Correo' : 'Persona'}
          </Chip>
          <span className="font-medium">{c.valor}</span>
          {c.nombre && (
            <span className="text-muted">
              {c.nombre}
              {c.puesto ? ` · ${c.puesto}` : ''}
            </span>
          )}
          <a
            href={c.fuente_url}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto text-xs text-brand-strong hover:underline"
            title={c.fuente_url}
          >
            fuente · {fechaCorta(c.fecha_fuente)}
          </a>
          <CopyButton texto={c.valor} />
        </li>
      ))}
    </ul>
  );
}

function Canalizacion({
  d,
  onPatch,
}: {
  d: ProspectoDetalle;
  onPatch: (b: object, ok: string) => Promise<void>;
}) {
  const [canal, setCanal] = useState(d.canalizado_a ?? '');
  const [notas, setNotas] = useState(d.notas_dueno ?? '');
  return (
    <Seccion titulo="Canalización">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-muted">Canalizado a</span>
          <input
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            placeholder="Ej. Ana — oficina Querétaro"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-muted">Notas del dueño</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas internas"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={() =>
            void onPatch({ canalizado_a: canal || null, notas_dueno: notas || null }, 'Guardado')
          }
        >
          Guardar
        </Button>
        <Button
          variante="primario"
          disabled={!canal.trim()}
          onClick={() =>
            void onPatch(
              { canalizado_a: canal.trim(), notas_dueno: notas || null, estado: 'Canalizado' },
              'Marcado como canalizado',
            )
          }
        >
          Marcar como canalizado
        </Button>
      </div>
    </Seccion>
  );
}

export function DetalleProspecto() {
  const { id } = useParams();
  const { data: d, loading, error, reload } = useApi<ProspectoDetalle>(`/prospectos/${id}`);
  const toast = useToast();
  const [motivoPara, setMotivoPara] = useState<'Descartado' | 'Perdido' | null>(null);

  useEffect(() => {
    if (!d) return;
    if (d.visto_por_dueno === 0)
      void api(`/prospectos/${d.id}`, { method: 'PATCH', body: { visto_por_dueno: true } }).catch(
        () => undefined,
      );
  }, [d]);

  const patch = async (body: object, ok: string) => {
    try {
      await api(`/prospectos/${id}`, { method: 'PATCH', body });
      toast(ok);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    }
  };

  if (error) return <ErrorBanner mensaje={error} onRetry={reload} />;
  if (loading || !d)
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );

  const reenviar = async () => {
    try {
      const r = await api<{ enviados: number; fallidos: number }>(`/prospectos/${d.id}/reenviar`, {
        method: 'POST',
        body: {},
      });
      toast(
        r.enviados > 0 ? 'Correo reenviado' : 'El correo sigue sin poder enviarse',
        r.enviados > 0 ? 'ok' : 'error',
      );
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo reenviar', 'error');
    }
  };
  const desglose = d.score_desglose
    ? (JSON.parse(d.score_desglose) as Record<string, number>)
    : null;
  const falloCorreo = d.envios.some((e) => e.estado === 'fallido');

  return (
    <div className="space-y-4">
      <Link to="/prospectos" className="text-brand-strong hover:underline">
        ← Prospectos
      </Link>
      <Card className="flex flex-wrap items-center gap-4">
        <NivelBadge nivel={d.nivel} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{d.empresa}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-muted">
            {d.sitio_web && (
              <a
                href={d.sitio_web}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-strong hover:underline"
              >
                {d.sitio_web}
              </a>
            )}
            {d.sitio_web &&
              (d.sitio_verificado ? (
                <span className="text-ok">✓ sitio verificado</span>
              ) : (
                <span className="text-warn">⚠ sitio sin verificar</span>
              ))}
            <span>{d.zona ?? 'Zona sin definir'}</span>
            {d.giro && <span>{d.giro}</span>}
          </div>
        </div>
        <span className="text-2xl font-bold">
          {d.score ?? '—'}
          <span className="text-sm font-normal text-muted">/100</span>
        </span>
        <select
          aria-label="Estado"
          value={d.estado}
          onChange={(e) => {
            if (e.target.value === 'Perdido') setMotivoPara('Perdido');
            else void patch({ estado: e.target.value }, 'Estado actualizado');
          }}
          className="rounded-lg border border-line bg-white px-3 py-2"
        >
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s === 'Revision humana' ? 'Revisión humana' : s}
            </option>
          ))}
        </select>
        <Button variante="peligro" onClick={() => setMotivoPara('Descartado')}>
          Descartar
        </Button>
      </Card>

      {falloCorreo && (
        <div className="flex items-center justify-between rounded-lg border border-warn/40 bg-warn/10 px-4 py-3">
          <span>El correo no se envió, pero el prospecto está guardado aquí.</span>
          <Button variante="secundario" onClick={reenviar}>
            Reenviar
          </Button>
        </div>
      )}

      {d.reporte_md && (
        <Seccion titulo="Reporte">
          <p className="whitespace-pre-wrap leading-relaxed">{d.reporte_md}</p>
        </Seccion>
      )}
      <Seccion titulo="Contactos">
        <Contactos d={d} />
      </Seccion>

      {d.paquetes.length > 0 && (
        <Seccion titulo="Paquetes sugeridos">
          <div className="grid grid-cols-3 gap-3">
            {d.paquetes.map((p) => (
              <div key={p.nombre} className="rounded-lg border border-line p-4">
                <h3 className="font-semibold text-brand-strong">{p.nombre}</h3>
                <div className="my-2 flex flex-wrap gap-1">
                  {(JSON.parse(p.componentes) as string[]).map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
                <p className="text-muted">{p.argumento}</p>
                {p.dirigido_a && (
                  <p className="mt-2 text-xs text-muted">Dirigido a: {p.dirigido_a}</p>
                )}
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {d.productos.length > 0 && (
        <Seccion titulo="Productos propuestos">
          <ul className="divide-y divide-line">
            {d.productos.map((p, i) => (
              <li key={i} className="flex items-start gap-3 py-2">
                <Chip>{p.marca}</Chip>
                <span className="w-48 font-medium">{p.categoria}</span>
                <span className="flex-1 text-muted">{p.razon}</span>
                <span className="text-xs uppercase text-muted">{p.prioridad}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Seccion titulo="Ficha de la empresa">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
            <dt className="text-muted">Tamaño</dt>
            <dd>{d.tamano ?? '—'}</dd>
            <dt className="text-muted">Sucursales</dt>
            <dd>{d.sucursales ?? '—'}</dd>
            <dt className="text-muted">Dirección</dt>
            <dd>{d.direccion ?? '—'}</dd>
            <dt className="text-muted">Descubierta</dt>
            <dd>
              {METODO_ETIQUETA[d.metodo_descubrimiento] ?? d.metodo_descubrimiento}
              {d.origen_url && (
                <>
                  {' '}
                  ·{' '}
                  <a
                    href={d.origen_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-strong hover:underline"
                  >
                    origen
                  </a>
                </>
              )}
            </dd>
            {d.origen_nota && (
              <>
                <dt className="text-muted">Nota</dt>
                <dd>{d.origen_nota}</dd>
              </>
            )}
          </dl>
          {d.resumen && <p className="mt-3 leading-relaxed">{d.resumen}</p>}
        </Seccion>
        <Seccion titulo="Necesidades detectadas">
          {d.necesidades.length === 0 ? (
            <p className="text-muted">Sin necesidades registradas.</p>
          ) : (
            <ul className="space-y-2">
              {d.necesidades.map((n, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Chip tono={n.tipo}>{n.tipo === 'evidencia' ? 'Evidencia' : 'Inferencia'}</Chip>
                  <span>{n.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>

      {desglose && (
        <Seccion titulo="Score">
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(desglose).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-ice p-3 text-center">
                <div className="text-xl font-bold">{v}</div>
                <div className="text-xs capitalize text-muted">{k}</div>
              </div>
            ))}
          </div>
          {d.justificacion && <p className="mt-3 text-muted">{d.justificacion}</p>}
        </Seccion>
      )}

      {d.borrador_correo && (
        <Seccion titulo="Borrador de correo para el vendedor">
          <p className="whitespace-pre-wrap rounded-lg bg-ice p-4 leading-relaxed">
            {d.borrador_correo}
          </p>
          <div className="mt-2">
            <CopyButton texto={d.borrador_correo} etiqueta="Copiar borrador" />
          </div>
        </Seccion>
      )}

      <Canalizacion key={d.id} d={d} onPatch={patch} />

      <Seccion titulo="Historial">
        <ul className="space-y-1.5">
          {d.revisiones.map((r, i) => (
            <li key={`r${i}`}>
              {r.etapa.toUpperCase()}{' '}
              {r.aprobado ? '✓ aprobó' : `↩ devolvió${r.devolver_a ? ` a ${r.devolver_a}` : ''}`}{' '}
              <span className="text-muted">
                · {(JSON.parse(r.motivos) as string[]).join(' | ')} · {fechaCorta(r.creado_en)}
              </span>
            </li>
          ))}
          {d.envios.map((e) => (
            <li key={`e${e.id}`}>
              Correo a {e.destinatario}: <CorreoBadge estado={e.estado as 'enviado'} />
              {e.error && <span className="text-bad"> · {e.error}</span>}
            </li>
          ))}
          {d.actividad.map((a, i) => (
            <li key={`a${i}`} className="text-muted">
              {a.agente} · {a.accion}
              {a.detalle ? ` · ${a.detalle}` : ''} · {fechaCorta(a.creado_en)}
            </li>
          ))}
          <li className="text-muted">
            Estado actual: <EstadoBadge estado={d.estado} />
          </li>
        </ul>
      </Seccion>

      {motivoPara && (
        <ConfirmDialog
          titulo={motivoPara === 'Perdido' ? '¿Marcar como perdido?' : '¿Descartar esta empresa?'}
          mensaje={
            motivoPara === 'Perdido'
              ? 'Indica por qué se perdió para aprender de ello.'
              : 'Indica el motivo para no volver a trabajarla.'
          }
          pedirMotivo
          confirmar={motivoPara === 'Perdido' ? 'Marcar perdido' : 'Descartar'}
          onCancel={() => setMotivoPara(null)}
          onConfirm={(motivo) => {
            const est = motivoPara;
            setMotivoPara(null);
            void patch(
              { estado: est, motivo },
              est === 'Perdido' ? 'Marcado como perdido' : 'Prospecto descartado',
            );
          }}
        />
      )}
    </div>
  );
}
