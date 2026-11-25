import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export * from './badges';

export { cx } from './cx';
import { cx } from './cx';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-line bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  titulo,
  subtitulo,
  acciones,
}: {
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold text-deep">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-muted">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  );
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-brand-strong text-white hover:bg-deep-2',
  secundario: 'border border-line bg-white text-deep hover:bg-brand-soft',
  peligro: 'bg-bad text-white hover:opacity-90',
  fantasma: 'text-brand-strong hover:bg-brand-soft',
};

export function Button({
  variante = 'secundario',
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        className,
      )}
    />
  );
}

export function KPICard({
  titulo,
  valor,
  delta,
  nota,
}: {
  titulo: string;
  valor: number | string;
  delta?: number;
  nota?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{titulo}</span>
      <span className="text-3xl font-bold text-deep">{valor}</span>
      {delta !== undefined && (
        <span
          className={cx(
            'text-xs font-medium',
            delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-muted',
          )}
        >
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {delta > 0 ? '+' : ''}
          {delta} vs. periodo anterior
        </span>
      )}
      {nota && <span className="text-xs text-muted">{nota}</span>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-line/70', className)} />;
}

export function EmptyState({ mensaje, accion }: { mensaje: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="max-w-md text-muted">{mensaje}</p>
      {accion}
    </div>
  );
}

export function ErrorBanner({ mensaje, onRetry }: { mensaje: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-bad"
    >
      <span>⚠ {mensaje}</span>
      {onRetry && (
        <Button variante="secundario" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Chip({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'evidencia' | 'inferencia';
}) {
  const t =
    tono === 'evidencia'
      ? 'bg-emerald-100 text-emerald-800'
      : tono === 'inferencia'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-brand-soft text-brand-strong';
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', t)}>
      {children}
    </span>
  );
}

export function CopyButton({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      variante="fantasma"
      onClick={() => {
        void navigator.clipboard.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
    >
      {ok ? '✓ Copiado' : etiqueta}
    </Button>
  );
}

export function ConfirmDialog({
  titulo,
  mensaje,
  pedirMotivo,
  confirmar,
  onConfirm,
  onCancel,
}: {
  titulo: string;
  mensaje: string;
  pedirMotivo?: boolean;
  confirmar: string;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className="anim-pop w-full max-w-md rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="mt-2 text-muted">{mensaje}</p>
        {pedirMotivo && (
          <input
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (obligatorio)"
            className="mt-4 w-full rounded-lg border border-line px-3 py-2"
          />
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancelar</Button>
          <Button
            variante="peligro"
            disabled={pedirMotivo && motivo.trim().length < 2}
            onClick={() => onConfirm(motivo.trim())}
          >
            {confirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Toasts
interface Toast {
  id: number;
  texto: string;
  tipo: 'ok' | 'error';
}
const ToastCtx = createContext<(texto: string, tipo?: 'ok' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, texto, tipo }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'anim-pop rounded-lg px-4 py-3 text-sm text-white shadow-md',
              t.tipo === 'ok' ? 'bg-deep' : 'bg-bad',
            )}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
