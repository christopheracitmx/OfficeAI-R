import { cx } from './cx';
export function NivelBadge({ nivel }: { nivel: string | null }) {
  if (!nivel) return <span className="text-muted">—</span>;
  const color = nivel === 'A' ? 'bg-brand-strong' : nivel === 'B' ? 'bg-warn' : 'bg-nivel-c';
  return (
    <span
      className={cx(
        'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-white',
        color,
      )}
      title={`Nivel ${nivel}`}
    >
      {nivel}
    </span>
  );
}

const ESTADO_COLOR: Record<string, string> = {
  Nuevo: 'bg-slate-100 text-slate-700',
  Calificado: 'bg-sky-100 text-sky-800',
  Reportado: 'bg-brand-soft text-brand-strong',
  Canalizado: 'bg-indigo-100 text-indigo-800',
  'En contacto': 'bg-amber-100 text-amber-800',
  Propuesta: 'bg-violet-100 text-violet-800',
  Ganado: 'bg-emerald-100 text-emerald-800',
  Perdido: 'bg-rose-100 text-rose-800',
  Descartado: 'bg-slate-200 text-slate-600',
  'Revision humana': 'bg-orange-100 text-orange-800',
};

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
        ESTADO_COLOR[estado] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {estado === 'Revision humana' ? 'Revisión humana' : estado}
    </span>
  );
}

export function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted">—</span>;
  return (
    <div className="flex items-center gap-2" title={`Score ${score}/100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${score}%` }} />
      </div>
      <span className="w-7 text-right font-semibold">{score}</span>
    </div>
  );
}

export function CorreoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-muted">—</span>;
  if (estado === 'enviado')
    return (
      <span className="text-ok" title="Correo enviado">
        ✓ enviado
      </span>
    );
  if (estado === 'fallido')
    return (
      <span className="font-medium text-bad" title="El correo no se envió">
        ⚠ no enviado
      </span>
    );
  return <span className="text-warn">pendiente</span>;
}
