/** Un piso del edificio en corte: losa, paredes del fondo, interior en miniatura (desde la definición) y rótulo. */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DefinicionOficina } from '../../../shared/oficina3d/definicion';
import { ALTO, ANCHO, FONDO, LOSA, yPiso } from './medidas';
import type { TiendaEdificio } from './tiendaEdificio';

function rotulo(texto: string, num: number, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#FFFFFF';
  g.font = 'bold 44px sans-serif';
  g.textBaseline = 'middle';
  g.fillText(`${num}`, 22, 50);
  g.font = 'bold 38px sans-serif';
  g.fillText(texto.length > 24 ? `${texto.slice(0, 23)}…` : texto, 86, 50, 410);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface PropsPiso {
  id: string;
  indice: number;
  nombre: string;
  def: DefinicionOficina | null;
  activo: boolean;
  archivado?: boolean;
  tienda: TiendaEdificio;
  corriendo: boolean;
  onClick: (id: string) => void;
}

/** Ventanas de la fachada por estilo (posiciones x, ancho, alto, color). */
const VENTANAS = {
  vidrio: { xs: [-5, 0, 5], w: 3, h: 0.9, color: '#BFE8EE' },
  ladrillo: { xs: [-6, -3, 0, 3, 6], w: 1.4, h: 0.9, color: '#F6E7C8' },
  moderno: { xs: [0], w: 12.5, h: 0.8, color: '#8FD3E0' },
} as const;

export function PisoEdificio(p: PropsPiso) {
  const c = p.def?.office.apariencia.colores;
  const color = c?.secundario ?? '#00ADA9';
  const piso = c?.piso ?? '#E9E2D6';
  const fachada = p.def?.office.apariencia.fachada;
  const muro = fachada?.color ?? c?.primario ?? '#0F3D47';
  const vent = VENTANAS[fachada?.estilo ?? 'vidrio'];
  const lampara = useRef<THREE.MeshStandardMaterial>(null);
  const brillo = useRef<THREE.MeshBasicMaterial>(null);
  const tex = useMemo(() => rotulo(p.nombre, p.indice + 1, muro), [p.nombre, p.indice, muro]);
  const interior = useMemo(() => {
    if (!p.def) return null;
    const s = Math.min((ANCHO - 1.4) / p.def.planta.ancho, (FONDO - 1.4) / p.def.planta.fondo);
    return { s, d: p.def };
  }, [p.def]);

  useFrame(({ clock }) => {
    const vivo = p.corriendo || p.tienda.reciente(p.id);
    const pulso = vivo ? 0.6 + 0.4 * Math.sin(clock.elapsedTime * 4) : 0;
    if (lampara.current) lampara.current.emissiveIntensity = vivo ? 1 + pulso * 2 : 0.05;
    if (brillo.current)
      brillo.current.opacity = p.activo ? 0.3 + 0.12 * Math.sin(clock.elapsedTime * 2) : 0;
  });

  return (
    <group position={[0, yPiso(p.indice), 0]}>
      <mesh
        position={[0, LOSA / 2, 0]}
        receiveShadow
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          p.onClick(p.id);
        }}
        onPointerOver={() => {
          p.tienda.sobre(p.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          p.tienda.sobre(null);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[ANCHO, LOSA, FONDO]} />
        <meshStandardMaterial color={p.archivado ? '#9AA3A6' : piso} roughness={0.7} />
      </mesh>
      <mesh position={[0, LOSA + ALTO / 2, -FONDO / 2 + 0.1]} castShadow>
        <boxGeometry args={[ANCHO, ALTO, 0.2]} />
        <meshStandardMaterial color={muro} roughness={0.6} />
      </mesh>
      <mesh position={[-ANCHO / 2 + 0.1, LOSA + ALTO / 2, 0]} castShadow>
        <boxGeometry args={[0.2, ALTO, FONDO]} />
        <meshStandardMaterial color={muro} roughness={0.6} />
      </mesh>
      {vent.xs.map((x) => (
        <mesh key={x} position={[x, LOSA + ALTO * 0.6, -FONDO / 2 + 0.22]}>
          <boxGeometry args={[vent.w, vent.h, 0.04]} />
          <meshStandardMaterial color={vent.color} emissive={vent.color} emissiveIntensity={0.35} />
        </mesh>
      ))}
      {interior && (
        <group
          position={[
            (-interior.d.planta.ancho * interior.s) / 2,
            LOSA,
            (-interior.d.planta.fondo * interior.s) / 2,
          ]}
        >
          {interior.d.salas.map((s) => (
            <mesh
              key={s.id}
              position={[
                (s.x + s.apariencia.ancho / 2) * interior.s,
                0.07,
                (s.z + s.apariencia.fondo / 2) * interior.s,
              ]}
            >
              <boxGeometry
                args={[
                  s.apariencia.ancho * interior.s - 0.12,
                  0.14,
                  s.apariencia.fondo * interior.s - 0.12,
                ]}
              />
              <meshStandardMaterial color={s.apariencia.acento} roughness={0.5} />
            </mesh>
          ))}
          {interior.d.agentes.map((a) => {
            const pu = interior.d.puestos.find((x) => x.id === a.puesto);
            const sa = pu && interior.d.salas.find((x) => x.id === pu.sala);
            if (!pu || !sa) return null;
            return (
              <mesh
                key={a.id}
                position={[(sa.x + pu.x) * interior.s, 0.5, (sa.z + pu.z) * interior.s]}
                castShadow
              >
                <boxGeometry args={[0.28, 0.7, 0.28]} />
                <meshStandardMaterial color={a.apariencia.camisa} roughness={0.4} />
              </mesh>
            );
          })}
        </group>
      )}
      <mesh position={[0, LOSA + 0.45, FONDO / 2 + 0.06]}>
        <planeGeometry args={[6, 1.125]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[ANCHO / 2 - 0.5, LOSA + ALTO - 0.3, FONDO / 2 - 0.4]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial
          ref={lampara}
          color={color}
          emissive={color}
          emissiveIntensity={0.05}
        />
      </mesh>
      <mesh position={[0, LOSA + ALTO / 2, 0]} renderOrder={2}>
        <boxGeometry args={[ANCHO + 0.3, ALTO + LOSA, FONDO + 0.3]} />
        <meshBasicMaterial
          ref={brillo}
          color="#F2B33D"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
