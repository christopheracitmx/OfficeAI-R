/**
 * Lienzo 3D de la oficina (chunk diferido). Construido SOLO desde la definición validada.
 * Calidad Alta/Media/Baja; `frameloop="demand"` cuando la oficina está en pausa o con movimiento
 * reducido; luz cálida con sombras, bloom sutil en pantallas (Alta), polvo y vapor ligeros.
 */
import { Sparkles } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Calidad, Iluminacion } from '../../../shared/oficina3d/apariencia';
import type { DefinicionOficina, SalaDef } from '../../../shared/oficina3d/definicion';
import { useTienda, type Tienda } from '../tienda';
import { Camara } from './Camara';
import { Diagnostico } from './Diagnostico';
import { Estatico } from './Estatico';
import { Perimetro } from './Perimetro';
import { Personaje } from './Personaje';

const AJUSTES: Record<
  Calidad,
  { dpr: [number, number]; sombra: number; bloom: boolean; particulas: number; detalle: boolean }
> = {
  alta: { dpr: [1, 2], sombra: 2048, bloom: true, particulas: 70, detalle: true },
  media: { dpr: [1, 1.5], sombra: 1024, bloom: false, particulas: 35, detalle: true },
  baja: { dpr: [1, 1], sombra: 0, bloom: false, particulas: 0, detalle: false },
};

export interface PropsEscena {
  d: DefinicionOficina;
  t: Tienda;
  calidad: Calidad;
  noche: boolean;
  quieto: boolean;
  onSeleccion: (id: string) => void;
  onSala: (s: SalaDef) => void;
}

/** Color de la luz de cada sala según su estilo de iluminación. */
const LUZ_SALA: Record<Iluminacion, string> = {
  calida: '#FFC98A',
  neutra: '#FFFFFF',
  fria: '#BFD8FF',
};

function Luces({
  d,
  sombra,
  noche,
  luzDia,
}: {
  d: DefinicionOficina;
  sombra: number;
  noche: boolean;
  luzDia: boolean;
}) {
  // De día solo se añade luz propia a las salas con estilo distinto del cálido de fábrica.
  const luces = d.salas.filter((s) => noche || (luzDia && s.apariencia.iluminacion !== 'calida'));
  const { ancho, fondo } = d.planta;
  const cx = ancho / 2;
  const cz = fondo / 2;
  const ext = Math.max(ancho, fondo) * 0.62;
  return (
    <>
      <hemisphereLight
        args={[noche ? '#5B6F9A' : '#FFF4E0', noche ? '#1B2433' : '#6B5A48', noche ? 0.55 : 1.15]}
      />
      <ambientLight intensity={noche ? 0.12 : 0.25} color={noche ? '#7E8FC0' : '#FFFFFF'} />
      <directionalLight
        position={[cx + 14, 26, cz + 10]}
        intensity={noche ? 0.35 : 2.1}
        color={noche ? '#9DB2FF' : '#FFE2BC'}
        castShadow={sombra > 0}
        shadow-mapSize={[sombra || 512, sombra || 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-ext}
        shadow-camera-right={ext}
        shadow-camera-top={ext}
        shadow-camera-bottom={-ext}
        shadow-camera-near={1}
        shadow-camera-far={80}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>
      {luces.map((s) => (
        <pointLight
          key={s.id}
          position={[s.x + s.apariencia.ancho / 2, 2.2, s.z + s.apariencia.fondo / 2]}
          intensity={noche ? 6 : 2.2}
          distance={7}
          decay={1.6}
          color={LUZ_SALA[s.apariencia.iluminacion]}
        />
      ))}
    </>
  );
}

function Cafe({ d }: { d: DefinicionOficina }) {
  const c = d.salas.find((s) => s.apariencia.utileria.includes('barra_cafe'));
  if (!c) return null;
  const sur = c.puerta.lado === 's';
  return (
    <Sparkles
      count={14}
      scale={[0.3, 0.6, 0.3]}
      size={6}
      speed={0.5}
      opacity={0.35}
      color="#FFFFFF"
      position={[
        c.x + c.apariencia.ancho / 2 - 1.6,
        1.25,
        c.z + (sur ? 0.3 : c.apariencia.fondo - 0.3),
      ]}
    />
  );
}

export default function Escena({ d, t, calidad, noche, quieto, onSeleccion, onSala }: PropsEscena) {
  const enPausa = useTienda(t, (e) => e.enPausa);
  const aj = AJUSTES[calidad];
  const c = d.office.apariencia.colores;
  const fondo = noche ? '#0A1A22' : c.fondo;
  return (
    <Canvas
      orthographic
      shadows={aj.sombra > 0 ? 'percentage' : false}
      dpr={aj.dpr}
      frameloop={enPausa || quieto ? 'demand' : 'always'}
      camera={{ position: [60, 40, 60], zoom: 20, near: 0.1, far: 300 }}
      gl={{ antialias: calidad !== 'baja', powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = noche ? 0.95 : 1.05;
      }}
      style={{ background: fondo }}
      aria-label={`Vista 3D de ${d.office.nombre}`}
    >
      <color attach="background" args={[fondo]} />
      <Luces d={d} sombra={aj.sombra} noche={noche} luzDia={calidad !== 'baja'} />
      <Camara d={d} t={t} quieto={quieto} />
      <Estatico d={d} detalle={aj.detalle} sombras={aj.sombra > 0} onSala={onSala} />
      <Perimetro d={d} noche={noche} />
      {d.agentes.map((a) => (
        <Personaje
          key={a.id}
          a={a}
          d={d}
          t={t}
          quieto={quieto}
          sombras={aj.sombra > 0}
          onSeleccion={onSeleccion}
        />
      ))}
      {aj.particulas > 0 && !quieto && (
        <>
          <Sparkles
            count={aj.particulas}
            scale={[d.planta.ancho, 2.5, d.planta.fondo]}
            position={[d.planta.ancho / 2, 1.4, d.planta.fondo / 2]}
            size={2.2}
            speed={0.15}
            opacity={noche ? 0.25 : 0.4}
            color="#FFF1D6"
          />
          <Cafe d={d} />
        </>
      )}
      {aj.bloom && (
        <EffectComposer multisampling={4}>
          <Bloom
            mipmapBlur
            luminanceThreshold={1}
            luminanceSmoothing={0.2}
            intensity={noche ? 1.1 : 0.7}
          />
        </EffectComposer>
      )}
      <Diagnostico d={d} calidad={calidad} />
    </Canvas>
  );
}
