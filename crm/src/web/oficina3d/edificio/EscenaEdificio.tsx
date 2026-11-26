/**
 * Lienzo 3D del edificio (chunk diferido): fachada con N pisos apilados en corte. Solo renderiza esta
 * escena; respeta calidad Alta/Media/Baja y prefers-reduced-motion (sin pulsos continuos ni viaje de cámara).
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Calidad } from '../../../shared/oficina3d/apariencia';
import type { DefinicionOficina } from '../../../shared/oficina3d/definicion';
import { ALTO, ANCHO, FONDO, LOSA, yPiso } from './medidas';
import { PisoEdificio } from './PisoEdificio';
import type { TiendaEdificio } from './tiendaEdificio';

const AJUSTES: Record<Calidad, { dpr: [number, number]; sombra: number }> = {
  alta: { dpr: [1, 2], sombra: 2048 },
  media: { dpr: [1, 1.5], sombra: 1024 },
  baja: { dpr: [1, 1], sombra: 0 },
};
const ELEV = Math.atan(1 / Math.SQRT2);

export interface PisoDato {
  id: string;
  nombre: string;
  def: DefinicionOficina | null;
  corriendo: boolean;
  archivado?: boolean;
}

function Camara({
  pisos,
  tienda,
  quieto,
  onEntrar,
}: {
  pisos: PisoDato[];
  tienda: TiendaEdificio;
  quieto: boolean;
  onEntrar: (id: string) => void;
}) {
  const { size, invalidate } = useThree();
  const alto = yPiso(pisos.length) + 1;
  const ajuste = Math.min(
    size.width / (ANCHO + FONDO) / 1.1,
    size.height / (alto * Math.cos(ELEV) + (ANCHO + FONDO) * Math.sin(ELEV) * 0.8),
  );
  const est = useRef({ zoom: ajuste, y: alto / 2 });
  const hecho = useRef<string | null>(null);
  useEffect(() => {
    est.current = { zoom: ajuste, y: alto / 2 };
    invalidate();
  }, [ajuste, alto, invalidate]);
  useFrame((st, delta) => {
    const e = est.current;
    const ent = tienda.entrando;
    const i = ent ? pisos.findIndex((p) => p.id === ent) : -1;
    const metaZoom = i >= 0 ? ajuste * 3.6 : ajuste;
    const metaY = i >= 0 ? yPiso(i) + ALTO / 2 : alto / 2;
    const k = quieto ? 1 : 1 - Math.exp(-delta * 4);
    e.zoom += (metaZoom - e.zoom) * k;
    e.y += (metaY - e.y) * k;
    const r = 60;
    st.camera.position.set(Math.sin(Math.PI / 4) * r, e.y + 40, Math.cos(Math.PI / 4) * r);
    st.camera.lookAt(0, e.y, 0);
    if (Math.abs(st.camera.zoom - e.zoom) > 1e-3) {
      st.camera.zoom = e.zoom;
      st.camera.updateProjectionMatrix();
    }
    if (ent && i >= 0 && hecho.current !== ent && (e.zoom > ajuste * 3.2 || quieto)) {
      hecho.current = ent;
      onEntrar(ent);
    }
    if (i < 0) hecho.current = null;
    if (Math.abs(metaZoom - e.zoom) > 1e-3 || Math.abs(metaY - e.y) > 1e-3) invalidate();
  });
  return null;
}

/** Despierta el bucle solo si hay algo pulsando (corrida o actividad reciente). */
function Pulso({
  pisos,
  tienda,
  quieto,
}: {
  pisos: PisoDato[];
  tienda: TiendaEdificio;
  quieto: boolean;
}) {
  const { invalidate } = useThree();
  useEffect(() => {
    if (quieto) return;
    const id = setInterval(() => {
      if (pisos.some((p) => p.corriendo || tienda.reciente(p.id))) invalidate();
    }, 60);
    return () => clearInterval(id);
  }, [pisos, tienda, quieto, invalidate]);
  return null;
}

export default function EscenaEdificio(p: {
  pisos: PisoDato[];
  activo: string;
  calidad: Calidad;
  noche: boolean;
  quieto: boolean;
  tienda: TiendaEdificio;
  onPiso: (id: string) => void;
  onEntrar: (id: string) => void;
}) {
  const aj = AJUSTES[p.calidad];
  const fondo = p.noche ? '#0A1A22' : '#0B2F37';
  const alto = yPiso(p.pisos.length);
  return (
    <Canvas
      orthographic
      shadows={aj.sombra > 0 ? 'percentage' : false}
      dpr={aj.dpr}
      frameloop="demand"
      camera={{ position: [40, 30, 40], zoom: 20, near: 0.1, far: 400 }}
      gl={{ antialias: p.calidad !== 'baja', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
      style={{ background: fondo }}
      aria-label="Vista 3D del edificio con sus pisos"
    >
      <color attach="background" args={[fondo]} />
      <hemisphereLight args={[p.noche ? '#5B6F9A' : '#FFF4E0', '#3A3028', p.noche ? 0.6 : 1.2]} />
      <directionalLight
        position={[18, alto + 24, 22]}
        intensity={p.noche ? 0.4 : 2}
        color={p.noche ? '#9DB2FF' : '#FFE2BC'}
        castShadow={aj.sombra > 0}
        shadow-mapSize={[aj.sombra || 512, aj.sombra || 512]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={alto + 20}
        shadow-camera-bottom={-10}
        shadow-camera-far={150}
      />
      <Camara pisos={p.pisos} tienda={p.tienda} quieto={p.quieto} onEntrar={p.onEntrar} />
      <Pulso pisos={p.pisos} tienda={p.tienda} quieto={p.quieto} />
      <mesh position={[0, -0.4, 0]} receiveShadow>
        <boxGeometry args={[ANCHO + 6, 0.8, FONDO + 6]} />
        <meshStandardMaterial color="#2C3A3F" roughness={0.9} />
      </mesh>
      {p.pisos.map((d, i) => (
        <PisoEdificio
          key={d.id}
          id={d.id}
          indice={i}
          nombre={d.nombre}
          def={d.def}
          activo={d.id === p.activo}
          archivado={d.archivado ?? false}
          tienda={p.tienda}
          corriendo={d.corriendo}
          onClick={p.onPiso}
        />
      ))}
      <mesh position={[0, yPiso(p.pisos.length) + LOSA / 2, 0]} castShadow>
        <boxGeometry args={[ANCHO + 0.4, LOSA, FONDO + 0.4]} />
        <meshStandardMaterial color="#0F3D47" roughness={0.6} />
      </mesh>
      <mesh position={[3, yPiso(p.pisos.length) + 0.9, -2]} castShadow>
        <boxGeometry args={[3, 1, 2]} />
        <meshStandardMaterial color="#6C7A80" roughness={0.7} />
      </mesh>
    </Canvas>
  );
}
