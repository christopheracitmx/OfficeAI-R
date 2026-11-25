/**
 * Agente minifigura con rig por articulaciones. Animación SOLO por transform y sin setState en
 * useFrame: lee la tienda en cada cuadro. Estados: inactivo (respira), trabajando (teclea, monitor
 * encendido), caminando (lleva el folder al siguiente puesto), alerta (devolución QA), pausa.
 */
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  posPuesto,
  type AgenteDef3d,
  type DefinicionOficina,
} from '../../../shared/oficina3d/definicion';
import { estadoVisible } from '../../../shared/oficina3d/eventos';
import { puntoCaminata, useTienda, type Tienda } from '../tienda';
import { CADERA_Y, HOMBRO, geoFigura, liberarFigura } from './figura';
import { hdr, matPlastico } from './kit';
import { ESCALA, PANTALLA, rotY } from './muebles';

const SIN_PUNTERO = { pointerEvents: 'none' } as const;
const APAGADA = new THREE.Color('#0E1B20');
const AMARILLO = new THREE.Color('#F2B33D');
const ROJO = new THREE.Color('#D64545');

function Etiquetas({ a, t, quieto }: { a: AgenteDef3d; t: Tienda; quieto: boolean }) {
  const reg = useTienda(t, (e) => e.registros[a.id]);
  const sel = useTienda(t, (e) => e.seleccionado === a.id);
  const pausa = useTienda(t, (e) => e.enPausa);
  const detalle = useTienda(t, (e) => e.detalle);
  const visible = !pausa && reg && reg.estado !== 'inactivo';
  return (
    <Html position={[0, 1.4, 0]} center zIndexRange={[20, 0]} style={SIN_PUNTERO}>
      <div className="flex flex-col items-center gap-1" aria-hidden>
        {visible && (
          <div
            className={`w-max max-w-[190px] rounded-lg px-2 py-1 text-center text-[11px] leading-tight shadow-md ${
              reg.estado === 'alerta' ? 'bg-bad text-white' : 'bg-white text-deep'
            } ${quieto ? '' : 'anim-pop'}`}
          >
            {reg.burbuja}
          </div>
        )}
        {
          <div
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow ${
              sel ? 'bg-brand-strong text-white' : 'bg-deep/90 text-ice'
            }`}
          >
            {a.persona}
            {detalle || sel || pausa ? <span className="font-normal"> · {a.rol}</span> : null}
          </div>
        }
      </div>
    </Html>
  );
}

export const Personaje = memo(function Personaje({
  a,
  d,
  t,
  quieto,
  sombras,
  onSeleccion,
}: {
  a: AgenteDef3d;
  d: DefinicionOficina;
  t: Tienda;
  quieto: boolean;
  sombras: boolean;
  onSeleccion: (id: string) => void;
}) {
  const geo = useMemo(() => geoFigura(a.apariencia), [a.apariencia]);
  useEffect(() => () => liberarFigura(geo), [geo]);
  const asiento = useMemo<[number, number]>(() => posPuesto(d, a.puesto) ?? [0, 0], [d, a.puesto]);
  const rumboAsiento = rotY(d.puestos.find((p) => p.id === a.puesto)?.rot ?? 0);
  const fase = useMemo(() => (a.id.length * 1.7) % 6.28, [a.id]);
  const encendida = useMemo(() => hdr('#62E3E0', 1.9), []);
  const matPantalla = useMemo(
    () => new THREE.MeshBasicMaterial({ color: APAGADA, toneMapped: false }),
    [],
  );
  const matFolder = useMemo(
    () => new THREE.MeshStandardMaterial({ color: AMARILLO, roughness: 0.5 }),
    [],
  );
  useEffect(
    () => () => {
      matPantalla.dispose();
      matFolder.dispose();
    },
    [matPantalla, matFolder],
  );

  const raiz = useRef<THREE.Group>(null);
  const cuerpo = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const cabeza = useRef<THREE.Group>(null);
  const brazoI = useRef<THREE.Group>(null);
  const brazoD = useRef<THREE.Group>(null);
  const piernaI = useRef<THREE.Group>(null);
  const piernaD = useRef<THREE.Group>(null);
  const folder = useRef<THREE.Mesh>(null);
  const alerta = useRef<THREE.Mesh>(null);

  useFrame((st) => {
    const r = raiz.current;
    if (!r || !torso.current || !cabeza.current || !brazoI.current || !brazoD.current) return;
    if (
      !piernaI.current ||
      !piernaD.current ||
      !cuerpo.current ||
      !folder.current ||
      !alerta.current
    )
      return;
    const e = t.get();
    const tt = quieto ? 0 : st.clock.elapsedTime + fase;
    const cam = e.caminatas[a.id];
    const p = cam ? puntoCaminata(cam, performance.now()) : null;
    if (cam && !p) t.terminarCaminata(a.id);
    const estado = estadoVisible(e.registros[a.id], Date.now(), e.enPausa, !!p);
    const sentado = estado !== 'caminando';
    // Posición y rumbo
    if (p) {
      r.position.set(p.x, 0, p.z);
      r.rotation.y = p.rumbo;
    } else {
      r.position.set(asiento[0], 0, asiento[1]);
      r.rotation.y = rumboAsiento;
    }
    // Piernas: sentado = horizontales hacia el escritorio; caminando = balanceo
    const paso = Math.sin(tt * 9);
    piernaI.current.rotation.x = sentado ? Math.PI / 2 : paso * 0.55;
    piernaD.current.rotation.x = sentado ? Math.PI / 2 : -paso * 0.55;
    cuerpo.current.position.y = sentado ? 0 : Math.abs(paso) * 0.018;
    // Respiración
    const resp = Math.sin(tt * (estado === 'pausa' ? 1.1 : 2));
    torso.current.scale.y = 1 + resp * (estado === 'pausa' ? 0.02 : 0.012);
    torso.current.rotation.x = estado === 'pausa' ? -0.12 : 0;
    // Brazos
    let bi = 0;
    let bd = 0;
    if (estado === 'trabajando') {
      const tec = Math.sin(tt * 18);
      bi = 1.25 + tec * 0.07;
      bd = 1.25 - tec * 0.07;
    } else if (estado === 'caminando') {
      bi = -paso * 0.5;
      bd = p?.ida ? 0.95 : paso * 0.5;
    } else if (estado === 'alerta') {
      bi = bd = 2.7 + Math.sin(tt * 6) * 0.1;
    } else if (estado === 'pausa') {
      bi = bd = 0.55;
    } else {
      bi = bd = 0.9 + resp * 0.02;
    }
    brazoI.current.rotation.x = bi;
    brazoD.current.rotation.x = bd;
    // Cabeza
    const ch = cabeza.current;
    ch.rotation.y =
      estado === 'alerta'
        ? Math.sin(tt * 10) * 0.35
        : estado === 'trabajando'
          ? Math.sin(tt * 0.7) * 0.12
          : 0;
    ch.rotation.x =
      estado === 'pausa' ? 0.32 : estado === 'trabajando' ? 0.05 + Math.sin(tt * 3.1) * 0.03 : 0;
    // Folder (solo de ida) y signo de alerta
    folder.current.visible = estado === 'caminando' && !!p?.ida;
    if (cam) matFolder.color.copy(cam.tipo === 'devolucion' ? ROJO : AMARILLO);
    alerta.current.visible = estado === 'alerta';
    alerta.current.position.y = 1.3 + Math.abs(Math.sin(tt * 5)) * 0.08;
    // Monitor
    matPantalla.color.copy(estado === 'trabajando' || estado === 'alerta' ? encendida : APAGADA);
    if (st.frameloop !== 'always' && (p || estado === 'trabajando')) st.invalidate();
  });

  const escala = a.apariencia.altura;
  const pantallas = d.puestos.find((x) => x.id === a.puesto);
  const doble =
    pantallas &&
    d.salas.find((s) => s.id === pantallas.sala)?.apariencia.utileria.includes('pared_monitores');
  const idx = d.puestos.findIndex((x) => x.id === a.puesto);
  const xs = doble && idx % 2 === 0 ? [-0.26, 0.26] : [0];
  return (
    <>
      <group position={[asiento[0], 0, asiento[1]]} rotation={[0, rumboAsiento, 0]} scale={ESCALA}>
        {xs.map((x) => (
          <mesh
            key={x}
            position={[x, PANTALLA.pos[1], PANTALLA.pos[2] + 0.017]}
            material={matPantalla}
          >
            <planeGeometry args={[PANTALLA.w, PANTALLA.h]} />
          </mesh>
        ))}
      </group>
      <group
        ref={raiz}
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          onSeleccion(a.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <group ref={cuerpo} scale={escala * ESCALA}>
          <group position={[0, CADERA_Y, 0]}>
            <mesh
              geometry={geo.cadera}
              material={matPlastico()}
              castShadow={sombras}
              position={[0, 0.02, 0]}
            />
            <group ref={piernaI} position={[-0.075, 0, 0]}>
              <mesh geometry={geo.pierna[0]} material={matPlastico()} castShadow={sombras} />
            </group>
            <group ref={piernaD} position={[0.075, 0, 0]}>
              <mesh geometry={geo.pierna[1]} material={matPlastico()} castShadow={sombras} />
            </group>
            <group ref={torso} position={[0, 0.045, 0]}>
              <mesh geometry={geo.torso} material={matPlastico()} castShadow={sombras} />
              <group ref={brazoI} position={[-HOMBRO.x, HOMBRO.y, 0]}>
                <mesh geometry={geo.brazo[0]} material={matPlastico()} castShadow={sombras} />
              </group>
              <group ref={brazoD} position={[HOMBRO.x, HOMBRO.y, 0]}>
                <mesh geometry={geo.brazo[1]} material={matPlastico()} castShadow={sombras} />
                <mesh
                  ref={folder}
                  position={[0.03, -0.24, -0.06]}
                  material={matFolder}
                  visible={false}
                >
                  <boxGeometry args={[0.2, 0.03, 0.26]} />
                </mesh>
              </group>
              <group ref={cabeza} position={[0, 0.315, 0]}>
                <mesh geometry={geo.cabeza} material={matPlastico()} castShadow={sombras} />
              </group>
            </group>
          </group>
        </group>
        <mesh ref={alerta} position={[0, 1.0, 0]} visible={false}>
          <octahedronGeometry args={[0.08, 0]} />
          <meshBasicMaterial color={hdr('#FF4B4B', 2.5)} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.45, 0.95, 0.45]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <Etiquetas a={a} t={t} quieto={quieto} />
      </group>
    </>
  );
});
