import { useState } from 'react';
import { Button, ErrorBanner, Skeleton } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { Oficina } from '../lib/useOficinas';

interface RespuestaWorkflow {
  editable: boolean;
  ref: string;
  workflow: unknown;
}

/** Vista avanzada: el flujo de la oficina como JSON, validado en el servidor antes de guardarse. */
export function WorkflowEditor({
  oficina,
  onCerrar,
  onGuardado,
}: {
  oficina: Oficina;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const w = useApi<RespuestaWorkflow>(`/oficinas/${oficina.id}/workflow`);
  const [editado, setTexto] = useState<string | null>(null);
  const texto = editado ?? (w.data ? JSON.stringify(w.data.workflow, null, 2) : '');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string[]>([]);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  let invalido: string | null = null;
  try {
    JSON.parse(texto || 'null');
  } catch (e) {
    invalido = e instanceof Error ? e.message : 'JSON inválido';
  }

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      const r = await api<{ advertencias: string[] }>(`/oficinas/${oficina.id}/workflow`, {
        method: 'PUT',
        body: { workflow: JSON.parse(texto) },
      });
      setAviso(r.advertencias);
      setOk(true);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Flujo de ${oficina.nombre}`}
    >
      <div className="anim-pop flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">Flujo de «{oficina.nombre}» (vista avanzada)</h2>
        <p className="mt-1 text-sm text-muted">
          Define los agentes (pasos), las herramientas permitidas y las fases de la corrida. Se
          valida antes de guardar; las herramientas fuera de las permitidas del piso (Biblioteca,
          lectura web y aviso interno) impiden iniciar la corrida.
        </p>
        {w.loading && <Skeleton className="mt-4 h-64" />}
        {w.error && <ErrorBanner mensaje={w.error} onRetry={w.reload} />}
        {w.data && !w.data.editable && (
          <p className="mt-3 rounded-lg bg-warn/30 p-2 text-sm" role="note">
            Este flujo viene de un archivo del sistema y es de solo lectura. Duplica el piso para
            tener una copia editable.
          </p>
        )}
        {w.data && (
          <textarea
            aria-label="Workflow en JSON"
            spellCheck={false}
            readOnly={!w.data.editable}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="mt-3 min-h-[320px] flex-1 rounded-lg border border-line bg-ice/40 p-3 font-mono text-xs"
          />
        )}
        {invalido && <p className="mt-2 text-sm text-bad">JSON inválido: {invalido}</p>}
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error}
          </p>
        )}
        {ok && (
          <p role="status" className="mt-2 text-sm text-ok">
            Guardado y validado.
            {aviso.length > 0 && ` Aviso: ${aviso.join('; ')}`}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCerrar}>Cerrar</Button>
          {w.data?.editable && (
            <Button
              variante="primario"
              disabled={guardando || invalido !== null}
              onClick={() => void guardar()}
            >
              Validar y guardar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
