/** Barra de controles de la vista 3D: piso (preparado), calidad, iluminación y giro de 90°. */
import { CALIDADES, type Calidad } from '../../shared/oficina3d/apariencia';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { Button } from '../components/ui';
import type { Tienda } from './tienda';
import type { usePreferencias } from './usarOficina';

const ETQ_CALIDAD: Record<Calidad, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja (bajo consumo)',
};
const sel = 'rounded-lg border border-line bg-white px-2 py-1.5 text-sm';

export function Controles({
  nombre,
  pref,
  t,
  d,
}: {
  nombre: string;
  pref: ReturnType<typeof usePreferencias>;
  t: Tienda;
  d: DefinicionOficina | null;
}) {
  /** Encuadre por área: centra la cámara en una sala y la acerca (los personajes se leen mejor). */
  const encuadrar = (id: string) => {
    if (!d) return;
    const s = d.salas.find((x) => x.id === id);
    const n = (t.get().encuadre?.n ?? 0) + 1;
    t.set({
      encuadre: s
        ? { x: s.x + s.apariencia.ancho / 2, z: s.z + s.apariencia.fondo / 2, k: 2.3, n }
        : { x: d.planta.ancho / 2, z: d.planta.fondo / 2, k: 1, n },
    });
  };
  const rotar = (d: number) => t.set({ rotacion: t.get().rotacion + d });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-sm">
        Piso
        <select aria-label="Piso" className={sel} value="1" onChange={() => undefined}>
          <option value="1">1 · {nombre}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-sm">
        Vista
        <select
          aria-label="Vista por área"
          className={sel}
          defaultValue=""
          disabled={!d}
          onChange={(e) => encuadrar(e.target.value)}
        >
          <option value="">General</option>
          {(d?.salas ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-sm">
        Calidad
        <select
          aria-label="Calidad gráfica"
          className={sel}
          value={pref.calidad}
          onChange={(e) => pref.setCalidad(e.target.value as Calidad)}
        >
          {CALIDADES.map((c) => (
            <option key={c} value={c}>
              {ETQ_CALIDAD[c]}
            </option>
          ))}
        </select>
      </label>
      <select
        aria-label="Iluminación"
        className={sel}
        value={pref.ciclo}
        onChange={(e) => pref.setCiclo(e.target.value as 'dia' | 'noche' | 'auto')}
      >
        <option value="dia">Día</option>
        <option value="noche">Noche</option>
        <option value="auto">Según la hora</option>
      </select>
      <Button onClick={() => rotar(-1)} aria-label="Girar vista a la izquierda">
        ⟲ 90°
      </Button>
      <Button onClick={() => rotar(1)} aria-label="Girar vista a la derecha">
        ⟳ 90°
      </Button>
    </div>
  );
}
