import { fijarOficinaActiva } from '../lib/oficinaActiva';
import { useOficinaActual } from '../lib/useOficinas';
import { cx } from './cx';

/** Selector de piso GLOBAL: fija la oficina activa de toda la app. Oscuro en la barra lateral, claro en «Ver oficina». */
export function SelectorPiso({
  oscuro = false,
  className,
}: {
  oscuro?: boolean;
  className?: string;
}) {
  const { id, lista } = useOficinaActual();
  return (
    <label className={cx('flex items-center gap-2 text-sm', className)}>
      <span className={oscuro ? 'text-ice/70' : undefined}>Piso</span>
      <select
        aria-label="Piso del edificio"
        value={lista.some((o) => o.id === id) ? id : ''}
        onChange={(e) => fijarOficinaActiva(e.target.value)}
        className={cx(
          'min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm',
          oscuro ? 'border-white/20 bg-deep-2 text-ice' : 'border-line bg-white',
        )}
      >
        {lista.length === 0 && <option value="">Cargando…</option>}
        {lista.map((o) => (
          <option key={o.id} value={o.id}>
            {o.piso}. {o.nombre}
            {o.corrida_activa ? ' ●' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
