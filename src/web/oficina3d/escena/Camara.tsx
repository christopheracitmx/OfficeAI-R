/**
 * Cámara ortográfica isométrica: paneo (arrastrar) y zoom (rueda) limitados, rotación en pasos de
 * 90° (tienda.rotacion) y transición suave al agente seleccionado. Sin controles de terceros.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { posPuesto, type DefinicionOficina } from '../../../shared/oficina3d/definicion';
import type { Tienda } from '../tienda';

const ELEV = Math.atan(1 / Math.SQRT2); // 35.26°: isométrica verdadera
const DIST = 60;
const fwd = new THREE.Vector3();
const der = new THREE.Vector3();

function zoomAjuste(d: DefinicionOficina, w: number, h: number): number {
  const ext = (d.planta.ancho + d.planta.fondo) * Math.SQRT1_2;
  return Math.min(w / (ext + 1), h / (ext * Math.sin(ELEV) + 2));
}

export function Camara({ d, t, quieto }: { d: DefinicionOficina; t: Tienda; quieto: boolean }) {
  const { camera, gl, size, invalidate } = useThree();
  const ajuste = zoomAjuste(d, size.width, size.height);
  const s = useRef({
    ox: d.planta.ancho / 2,
    oz: d.planta.fondo / 2,
    ax: d.planta.ancho / 2,
    az: d.planta.fondo / 2,
    ang: Math.PI / 4,
    zoomMeta: ajuste,
    zoom: ajuste,
  });
  const lim = useRef({ min: ajuste * 0.8, max: ajuste * 4 });
  const ajusteRef = useRef(ajuste);
  useEffect(() => {
    lim.current = { min: ajuste * 0.8, max: ajuste * 4 };
    ajusteRef.current = ajuste;
    s.current.zoomMeta = THREE.MathUtils.clamp(
      s.current.zoomMeta,
      lim.current.min,
      lim.current.max,
    );
    invalidate();
  }, [ajuste, invalidate]);

  // Seleccionar agente => centrar y acercar
  useEffect(() => {
    let previo = t.get().seleccionado;
    return t.suscribir(() => {
      const sel = t.get().seleccionado;
      if (sel === previo) return;
      previo = sel;
      const a = sel ? d.agentes.find((x) => x.id === sel) : null;
      const p = a ? posPuesto(d, a.puesto) : null;
      if (p) {
        s.current.ox = p[0];
        s.current.oz = p[1];
        s.current.zoomMeta = Math.max(s.current.zoomMeta, ajuste * 2.2);
      }
      invalidate();
    });
  }, [t, d, ajuste, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let arrastre: { x: number; y: number } | null = null;
    const abajo = (e: PointerEvent) => {
      arrastre = { x: e.clientX, y: e.clientY };
    };
    const mover = (e: PointerEvent) => {
      if (!arrastre || e.buttons === 0) return;
      const dx = e.clientX - arrastre.x;
      const dy = e.clientY - arrastre.y;
      arrastre = { x: e.clientX, y: e.clientY };
      camera.getWorldDirection(fwd).setY(0).normalize();
      der.set(-fwd.z, 0, fwd.x);
      const z = s.current.zoom;
      const c = s.current;
      const avance = dy / z / Math.sin(ELEV);
      c.ox = THREE.MathUtils.clamp(c.ox - der.x * (dx / z) + fwd.x * avance, 0, d.planta.ancho);
      c.oz = THREE.MathUtils.clamp(c.oz - der.z * (dx / z) + fwd.z * avance, 0, d.planta.fondo);
      c.ax = c.ox;
      c.az = c.oz;
      invalidate();
    };
    const arriba = () => {
      arrastre = null;
    };
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const m = s.current.zoomMeta * Math.exp(-e.deltaY * 0.0015);
      s.current.zoomMeta = THREE.MathUtils.clamp(m, lim.current.min, lim.current.max);
      invalidate();
    };
    el.addEventListener('pointerdown', abajo);
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', arriba);
    el.addEventListener('wheel', rueda, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', abajo);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', arriba);
      el.removeEventListener('wheel', rueda);
    };
  }, [gl, camera, d, invalidate]);

  useFrame((st, delta) => {
    const camera = st.camera;
    const c = s.current;
    const meta = Math.PI / 4 + t.get().rotacion * (Math.PI / 2);
    const k = quieto ? 1 : 1 - Math.exp(-delta * 6);
    c.ang += (meta - c.ang) * k;
    c.zoom += (c.zoomMeta - c.zoom) * k;
    c.ax += (c.ox - c.ax) * k;
    c.az += (c.oz - c.az) * k;
    const r = DIST * Math.cos(ELEV);
    camera.position.set(
      c.ax + Math.sin(c.ang) * r,
      DIST * Math.sin(ELEV),
      c.az + Math.cos(c.ang) * r,
    );
    camera.lookAt(c.ax, 0, c.az);
    const detalle = c.zoom > ajusteRef.current * 1.6;
    if (detalle !== t.get().detalle) t.set({ detalle });
    if (Math.abs(camera.zoom - c.zoom) > 1e-4) {
      camera.zoom = c.zoom;
      camera.updateProjectionMatrix();
    }
    const quedan =
      Math.abs(meta - c.ang) > 1e-3 ||
      Math.abs(c.zoomMeta - c.zoom) > 1e-3 ||
      Math.abs(c.ox - c.ax) + Math.abs(c.oz - c.az) > 1e-3;
    if (quedan) invalidate();
  });
  return null;
}
