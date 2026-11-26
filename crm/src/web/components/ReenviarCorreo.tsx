import { useState } from 'react';
import { api, useApi } from '../lib/api';
import type { Destinatario, ProspectoDetalle } from '../lib/types';
import { Button, CorreoBadge, useToast } from './ui';

interface Resultado {
  resultados: { destinatario: string; estado: 'enviado' | 'fallido'; error: string | null }[];
  enviados: number;
  fallidos: number;
}

/** Botón + diálogo para reenviar el correo del prospecto a los destinatarios internos que se elijan. */
export function ReenviarCorreo({
  prospecto,
  onListo,
}: {
  prospecto: ProspectoDetalle;
  onListo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variante="secundario" onClick={() => setAbierto(true)}>
        Reenviar correo…
      </Button>
      {abierto && (
        <Dialogo
          prospecto={prospecto}
          onCerrar={() => setAbierto(false)}
          onListo={() => {
            setAbierto(false);
            onListo();
          }}
        />
      )}
    </>
  );
}

function Dialogo({
  prospecto,
  onCerrar,
  onListo,
}: {
  prospecto: ProspectoDetalle;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const lista = useApi<Destinatario[]>('/config/destinatarios');
  const toast = useToast();
  const activos = (lista.data ?? []).filter((d) => d.activo);
  const estadoDe = (email: string): string | null =>
    prospecto.envios.find((e) => e.destinatario.toLowerCase() === email.toLowerCase())?.estado ??
    null;
  const [marcados, setMarcados] = useState<Record<number, boolean> | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Por defecto: los que aún no recibieron el correo correctamente.
  const sel =
    marcados ?? Object.fromEntries(activos.map((d) => [d.id, estadoDe(d.email) !== 'enviado']));
  const ids = activos.filter((d) => sel[d.id]).map((d) => d.id);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api<Resultado>(`/prospectos/${prospecto.id}/reenviar`, {
        method: 'POST',
        body: { destinatario_ids: ids },
      });
      if (r.fallidos === 0) toast(`Correo enviado a ${r.enviados} destinatario(s)`);
      else
        toast(
          `Enviados ${r.enviados}, con error ${r.fallidos}: ${r.resultados
            .filter((x) => x.estado === 'fallido')
            .map((x) => `${x.destinatario} (${x.error ?? 'error'})`)
            .join('; ')}`,
          'error',
        );
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo reenviar', 'error');
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reenviar correo"
    >
      <div className="anim-pop w-full max-w-md rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">Reenviar correo de {prospecto.empresa}</h2>
        <p className="mt-2 text-muted">
          Elige a quién reenviarlo. Solo aparecen los correos activos de Configuración → Correos de
          reportes.
        </p>
        {activos.length === 0 && !lista.loading && (
          <p className="mt-3 text-warn">No hay destinatarios activos.</p>
        )}
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {activos.map((d) => {
            const est = estadoDe(d.email);
            return (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!!sel[d.id]}
                    onChange={(e) => setMarcados({ ...sel, [d.id]: e.target.checked })}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {d.nombre ? `${d.nombre} · ` : ''}
                    {d.email}
                  </span>
                  {est ? (
                    <CorreoBadge estado={est as 'enviado'} />
                  ) : (
                    <span className="text-sm text-muted">sin envío</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={ids.length === 0 || enviando}>
            {enviando ? 'Enviando…' : `Reenviar a ${ids.length}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
