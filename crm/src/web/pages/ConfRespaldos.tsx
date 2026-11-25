import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Skeleton, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fechaCorta, type EstadoApp, type RespaldoUi } from '../lib/types';
import { inp } from './ConfListas';

const TIPO: Record<RespaldoUi['tipo'], string> = {
  manual: 'Manual',
  migracion: 'Antes de migrar',
  restauracion: 'Antes de restaurar',
  otro: 'Otro',
};
const kb = (n: number): string => `${Math.max(1, Math.round(n / 1024)).toLocaleString('es-MX')} KB`;

function Restaurar({
  r,
  onCancel,
  onListo,
}: {
  r: RespaldoUi;
  onCancel: () => void;
  onListo: () => void;
}) {
  const toast = useToast();
  const [palabra, setPalabra] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const ir = async () => {
    setTrabajando(true);
    try {
      const out = await api<{ respaldo_previo: string }>('/respaldos/restaurar', {
        method: 'POST',
        body: { archivo: r.archivo, confirmacion: palabra },
      });
      toast(`Base restaurada. Antes se respaldó el estado actual: ${out.respaldo_previo}`);
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo restaurar', 'error');
      setTrabajando(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Restaurar respaldo"
    >
      <div className="anim-pop w-full max-w-lg rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-bad">Restaurar la base de datos</h2>
        <p className="mt-2 text-muted">
          Vas a reemplazar TODOS los datos actuales (prospectos, lecciones, configuración) por los
          de <b>{r.archivo}</b> ({fechaCorta(r.creado_en)}). Lo que hayas hecho después de esa fecha
          se perderá, salvo que lo recuperes del respaldo que se crea automáticamente justo antes.
        </p>
        <label className="mt-4 block text-muted">
          Para confirmar escribe <b>RESTAURAR</b>
          <input
            autoFocus
            className={cx(inp, 'mt-1 w-full')}
            value={palabra}
            onChange={(e) => setPalabra(e.target.value)}
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancelar</Button>
          <Button
            variante="peligro"
            disabled={palabra !== 'RESTAURAR' || trabajando}
            onClick={() => void ir()}
          >
            {trabajando ? 'Restaurando…' : 'Restaurar ahora'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Respaldo manual y restauración de la base (data/backups). */
export function ConfRespaldos() {
  const lista = useApi<RespaldoUi[]>('/respaldos');
  const estado = useApi<EstadoApp>('/estado');
  const toast = useToast();
  const [restaurando, setRestaurando] = useState<RespaldoUi | null>(null);
  const crear = async () => {
    try {
      const r = await api<RespaldoUi>('/respaldos', { method: 'POST' });
      toast(`Respaldo creado: ${r.archivo}`);
      lista.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo respaldar', 'error');
    }
  };
  return (
    <div className="max-w-4xl space-y-4">
      <Card className="space-y-2">
        <p className="text-muted">
          La base real está en <code>{estado.data?.base_datos.ruta ?? '…'}</code>. Se respalda sola
          antes de cada migración; aquí puedes respaldar cuando quieras y volver a una copia
          anterior.
        </p>
        <Button variante="primario" onClick={() => void crear()}>
          Crear respaldo ahora
        </Button>
      </Card>
      {lista.error ? (
        <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />
      ) : !lista.data ? (
        <Skeleton className="h-24" />
      ) : lista.data.length === 0 ? (
        <EmptyState mensaje="Todavía no hay respaldos. Crea el primero." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {lista.data.map((r) => (
              <li key={r.archivo} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1">
                  <span className="font-medium">{r.archivo}</span>
                  <span className="text-muted">
                    {' '}
                    · {TIPO[r.tipo]} · {fechaCorta(r.creado_en)} · {kb(r.tamano)}
                  </span>
                </span>
                <Button variante="peligro" onClick={() => setRestaurando(r)}>
                  Restaurar…
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {restaurando && (
        <Restaurar
          r={restaurando}
          onCancel={() => setRestaurando(null)}
          onListo={() => window.location.reload()}
        />
      )}
    </div>
  );
}
