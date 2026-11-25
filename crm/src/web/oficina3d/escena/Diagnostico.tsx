/**
 * Ganchos de prueba (humo con captura real) y métricas: window.__oficina3d.
 * `muestra()` dibuja un cuadro y lee una rejilla de píxeles del canvas WebGL para comprobar que la
 * escena no está vacía (cuenta colores distintos). Solo lectura; no altera la escena.
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import type { Calidad } from '../../../shared/oficina3d/apariencia';
import type { DefinicionOficina } from '../../../shared/oficina3d/definicion';

export function Diagnostico({ d, calidad }: { d: DefinicionOficina; calidad: Calidad }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const w = window as unknown as { __oficina3d?: Record<string, unknown> };
    const muestra = (): number => {
      const { gl, scene, camera } = get();
      gl.render(scene, camera);
      const ctx = gl.getContext();
      const px = new Uint8Array(4);
      const colores = new Set<string>();
      const { width, height } = ctx.canvas;
      for (let i = 1; i < 24; i++)
        for (let j = 1; j < 16; j++) {
          ctx.readPixels(
            Math.floor((width * i) / 24),
            Math.floor((height * j) / 16),
            1,
            1,
            ctx.RGBA,
            ctx.UNSIGNED_BYTE,
            px,
          );
          colores.add(`${px[0]! >> 3},${px[1]! >> 3},${px[2]! >> 3}`);
        }
      return colores.size;
    };
    /** Posición en pantalla (px CSS, relativa al canvas) del centro de una sala: permite clics reales en las pruebas de humo. */
    const salaPantalla = (id: string): { x: number; y: number } | null => {
      const s = d.salas.find((x) => x.id === id);
      if (!s) return null;
      const { camera, gl } = get();
      const r = gl.domElement.getBoundingClientRect();
      gl.render(get().scene, camera); // refresca matrices tras un redimensionado
      const v = new Vector3(
        s.x + s.apariencia.ancho / 2,
        0.6,
        s.z + s.apariencia.fondo / 2,
      ).project(camera);
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    const id = setInterval(() => {
      const { gl } = get();
      w.__oficina3d = {
        listo: true,
        agentes: d.agentes.length,
        salas: d.salas.length,
        calidad,
        llamadas: gl.info.render.calls,
        triangulos: gl.info.render.triangles,
        geometrias: gl.info.memory.geometries,
        muestra,
        salaPantalla,
      };
    }, 500);
    return () => clearInterval(id);
  }, [d, calidad, get]);
  return null;
}
