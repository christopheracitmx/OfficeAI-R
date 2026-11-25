import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
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
import { fechaCorta, type ProspectoDetalle, jsonLista } from '../lib/types';

import {
  Canalizacion,
  Contactos,
  FichaNecesidades,
  Paquetes,
  Productos,
  Seccion,
} from './DetalleSecciones';

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

      <Paquetes d={d} />
      <Productos d={d} />
      <FichaNecesidades d={d} />
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
          {d.revisiones.map((r) => (
            <li key={`r${r.etapa}${r.creado_en}${String(r.aprobado)}`}>
              {r.etapa.toUpperCase()}{' '}
              {r.aprobado ? '✓ aprobó' : `↩ devolvió${r.devolver_a ? ` a ${r.devolver_a}` : ''}`}{' '}
              <span className="text-muted">
                · {jsonLista(r.motivos).join(' | ')} · {fechaCorta(r.creado_en)}
              </span>
            </li>
          ))}
          {d.envios.map((e) => (
            <li key={`e${e.id}`}>
              Correo a {e.destinatario}: <CorreoBadge estado={e.estado as 'enviado'} />
              {e.error && <span className="text-bad"> · {e.error}</span>}
            </li>
          ))}
          {d.actividad.map((a) => (
            <li key={`a${a.creado_en}${a.accion}`} className="text-muted">
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
