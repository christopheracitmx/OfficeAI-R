/** Todo lo que no se mueve: planta, salas, mobiliario y utilería fusionados (2 draw calls) + rótulos. */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { textoLegible } from '../../../shared/oficina3d/apariencia';
import type { DefinicionOficina, SalaDef } from '../../../shared/oficina3d/definicion';
import { Kit, Marco, matBrillo, matPlastico } from './kit';
import { ESCALA, puesto, rotY } from './muebles';
import { placaBase, salas } from './salas';
import { utileria } from './utileria';

function construir(d: DefinicionOficina, detalle: boolean) {
  const k = new Kit();
  const kb = new Kit();
  placaBase(k, d, detalle);
  salas(k, d, detalle);
  const porSala = new Map(d.salas.map((s) => [s.id, s]));
  d.puestos.forEach((p, i) => {
    const s = porSala.get(p.sala)!;
    const m = new Marco().hijo([s.x + p.x, 0, s.z + p.z], rotY(p.rot), [0, 0, 0], ESCALA);
    puesto(k, kb, m, s.apariencia, i, '#2B3236');
  });
  d.salas.forEach((s) => utileria(k, kb, s, new Marco().hijo([s.x, 0, s.z])));
  return { solido: k.construir(), brillo: kb.construir() };
}

/** Rótulo de sala: textura de canvas con contraste garantizado (sin fuentes externas). */
function texturaRotulo(texto: string, fondo: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = fondo;
  g.beginPath();
  g.roundRect(4, 4, 504, 120, 28);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.stroke();
  g.fillStyle = textoLegible(fondo);
  g.font = '600 64px "Segoe UI", Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, 256, 68, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Tamaño del rótulo en píxeles de pantalla: constante con cualquier zoom. */
const ROTULO_PX = { ancho: 98, alto: 25 };

function Rotulo({ s }: { s: SalaDef }) {
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ camera }) => {
    const z = camera.zoom || 1;
    ref.current?.scale.set(ROTULO_PX.ancho / z, ROTULO_PX.alto / z, 1);
  });
  const { ancho, fondo, alturaPared, rotulo } = s.apariencia;
  const tex = useMemo(
    () => texturaRotulo(rotulo.texto, rotulo.color),
    [rotulo.texto, rotulo.color],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  const p = s.puerta;
  const x = s.x + (p.lado === 'n' || p.lado === 's' ? p.pos : p.lado === 'e' ? ancho : 0);
  const z = s.z + (p.lado === 'e' || p.lado === 'o' ? p.pos : p.lado === 's' ? fondo : 0);
  return (
    <sprite ref={ref} position={[x, alturaPared + 0.75, z]} scale={[2.2, 0.55, 1]} renderOrder={5}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/** Tótem de marca blanca: el nombre de la marca sobre el color primario, con texto de contraste garantizado. */
function texturaMarca(texto: string, fondo: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 226;
  const g = c.getContext('2d')!;
  g.fillStyle = fondo;
  g.fillRect(0, 0, 512, 226);
  g.fillStyle = textoLegible(fondo);
  g.font = '700 70px "Segoe UI", Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, 256, 113, 460);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Tótem a la entrada del pasillo: logo (de la definición o propio) o, sin logo, el nombre de la marca. */
function Logo({ d }: { d: DefinicionOficina }) {
  const { logo } = d.office;
  const { marca, colores } = d.office.apariencia;
  const tex = useMemo(() => {
    if (logo) {
      const cargador = new THREE.TextureLoader().setCrossOrigin('anonymous');
      const t = cargador.load(logo, undefined, undefined, () =>
        console.warn('No se pudo cargar el logo de la oficina; se muestra el tótem sin logo.'),
      );
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }
    return marca ? texturaMarca(marca, colores.primario) : null;
  }, [logo, marca, colores.primario]);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!tex) return null;
  const z = d.planta.pasilloZ;
  return (
    <group position={[0.35, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.85, -0.03]} castShadow material={matPlastico()}>
        <boxGeometry args={[2.3, 1.2, 0.06]} />
      </mesh>
      <mesh position={[0, 0.85, 0.005]}>
        <planeGeometry args={[2.1, 0.93]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.12, -0.03]} material={matPlastico()}>
        <boxGeometry args={[0.6, 0.24, 0.3]} />
      </mesh>
    </group>
  );
}

export function Estatico({
  d,
  detalle,
  sombras,
  onSala,
}: {
  d: DefinicionOficina;
  detalle: boolean;
  sombras: boolean;
  onSala: (s: SalaDef) => void;
}) {
  const geo = useMemo(() => construir(d, detalle), [d, detalle]);
  useEffect(
    () => () => {
      geo.solido?.dispose();
      geo.brillo?.dispose();
    },
    [geo],
  );
  return (
    <group>
      {geo.solido && (
        <mesh
          geometry={geo.solido}
          material={matPlastico()}
          castShadow={sombras}
          receiveShadow={sombras}
        />
      )}
      {geo.brillo && <mesh geometry={geo.brillo} material={matBrillo()} />}
      {d.salas.map((s) => (
        <Rotulo key={s.id} s={s} />
      ))}
      <Logo d={d} />
      {d.salas
        .filter((s) => s.accion)
        .map((s) => (
          <mesh
            key={`hit-${s.id}`}
            position={[s.x + s.apariencia.ancho / 2, 0.6, s.z + s.apariencia.fondo / 2]}
            onClick={(e) => {
              if (e.delta > 5) return;
              e.stopPropagation();
              onSala(s);
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <boxGeometry args={[s.apariencia.ancho - 0.4, 1.2, s.apariencia.fondo - 0.4]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ))}
    </group>
  );
}
