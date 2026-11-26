/** Vista previa 3D en vivo: reusa la escena de «Ver oficina» con cámara giratoria y enfoque en lo elegido. */
import { Suspense, lazy, useEffect, useState } from 'react';
import { esNoche } from '../../shared/oficina3d/apariencia';
import type { Entidad } from '../../shared/oficina3d/composicion';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { Button, Skeleton } from '../components/ui';
import { Tienda } from '../oficina3d/tienda';
import { hayWebGL, movimientoReducido } from '../oficina3d/usarOficina';

const Escena = lazy(() => import('../oficina3d/escena/Escena'));

export function Preview({
  def,
  entidad,
  id,
  onElegirPersonaje,
}: {
  def: DefinicionOficina;
  entidad: Entidad;
  id: string;
  onElegirPersonaje: (id: string) => void;
}) {
  const [webgl] = useState(hayWebGL);
  const [quieto] = useState(movimientoReducido);
  const [gira, setGira] = useState(() => !movimientoReducido());
  const [tienda] = useState(() => {
    const t = new Tienda(null, movimientoReducido());
    t.set({ enPausa: false });
    return t;
  });
  useEffect(() => {
    tienda.definir(def);
  }, [tienda, def]);

  // Enfoque en el elemento elegido (personaje: selección; sala: encuadre; oficina: vista general).
  useEffect(() => {
    const n = (tienda.get().encuadre?.n ?? 0) + 1;
    if (entidad === 'personaje') tienda.set({ seleccionado: id });
    else {
      const s = entidad === 'sala' ? def.salas.find((x) => x.id === id) : undefined;
      tienda.set({
        seleccionado: null,
        encuadre: s
          ? { x: s.x + s.apariencia.ancho / 2, z: s.z + s.apariencia.fondo / 2, k: 2.1, n }
          : { x: def.planta.ancho / 2, z: def.planta.fondo / 2, k: 1, n },
      });
    }
    // Solo cuando cambia el elemento elegido, no con cada edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad, id, tienda]);

  // Cámara giratoria (la escena suaviza el ángulo; 1 = 90°).
  useEffect(() => {
    if (!gira || quieto) return;
    const t = setInterval(() => tienda.set({ rotacion: tienda.get().rotacion + 0.012 }), 50);
    return () => clearInterval(t);
  }, [gira, quieto, tienda]);

  if (!webgl)
    return (
      <div className="rounded-2xl bg-deep p-6 text-center text-ice">
        Este navegador no puede mostrar 3D (WebGL desactivado). Los cambios se guardan igual.
      </div>
    );
  const ap = def.office.apariencia;
  return (
    <div
      className="relative h-[560px] overflow-hidden rounded-2xl bg-deep shadow-md"
      data-testid="vista-previa"
    >
      <Suspense fallback={<Skeleton className="h-full rounded-2xl" />}>
        <Escena
          d={def}
          t={tienda}
          calidad={ap.calidad}
          noche={esNoche(ap)}
          quieto={quieto}
          onSeleccion={onElegirPersonaje}
          onSala={() => undefined}
        />
      </Suspense>
      <div className="absolute right-3 top-3 flex gap-2">
        <Button
          aria-pressed={gira}
          disabled={quieto}
          title={quieto ? 'Movimiento reducido activado en el sistema' : undefined}
          onClick={() => setGira((g) => !g)}
        >
          {gira ? 'Detener giro' : 'Girar solo'}
        </Button>
        <Button
          aria-label="Girar vista 90° a la izquierda"
          onClick={() => tienda.set({ rotacion: Math.round(tienda.get().rotacion) - 1 })}
        >
          ⟲
        </Button>
        <Button
          aria-label="Girar vista 90° a la derecha"
          onClick={() => tienda.set({ rotacion: Math.round(tienda.get().rotacion) + 1 })}
        >
          ⟳
        </Button>
      </div>
    </div>
  );
}
