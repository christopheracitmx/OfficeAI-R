/**
 * Paredes perimetrales con ventanas. Solo se muestran las dos del fondo (las que quedan detrás de
 * la oficina según el giro de la cámara) para no tapar la vista: corte dinámico por lado.
 * Cada lado son 2 mallas fusionadas (muro y vidrio); no proyectan sombra.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DefinicionOficina } from '../../../shared/oficina3d/definicion';
import { caja, Kit, matBrillo, matPlastico } from './kit';
import { aclarar, mezclar, oscurecer } from './muebles';

type Lado = 'n' | 's' | 'o' | 'e';
const LADOS: Lado[] = ['n', 's', 'o', 'e'];
const ALTO = 2.7;
const GRUESO = 0.26;
const SEPARACION = 3.4;

interface Muro {
  solido: THREE.BufferGeometry | null;
  vidrio: THREE.BufferGeometry | null;
}

function muro(d: DefinicionOficina, lado: Lado, noche: boolean): Muro {
  const { ancho, fondo } = d.planta;
  const c = d.office.apariencia.colores;
  const horizontal = lado === 'n' || lado === 's';
  const largo = (horizontal ? ancho : fondo) + 0.8;
  const fijo = lado === 'n' || lado === 'o' ? -0.3 : (horizontal ? fondo : ancho) + 0.3;
  const centro = (horizontal ? ancho : fondo) / 2;
  const pos = (a: number, y: number): [number, number, number] =>
    horizontal ? [a, y, fijo] : [fijo, y, a];
  const dims = (l: number, h: number, g: number): [number, number, number] =>
    horizontal ? [l, h, g] : [g, h, l];
  const k = new Kit();
  const kv = new Kit();
  const pared = mezclar(c.secundario, '#F3EEE4', 0.78);
  k.add(caja(...dims(largo, ALTO, GRUESO), 0.03), pared, pos(centro, ALTO / 2));
  k.add(
    caja(...dims(largo + 0.1, 0.12, GRUESO + 0.08), 0.02),
    c.primario,
    pos(centro, ALTO + 0.06),
  );
  k.add(caja(...dims(largo, 0.14, GRUESO + 0.05), 0.02), oscurecer(pared, 0.12), pos(centro, 0.07));
  const vidrio = noche ? '#243556' : '#BDE4F2';
  const n = Math.max(1, Math.floor((largo - 1) / SEPARACION));
  for (let i = 0; i < n; i++) {
    const a = centro - ((n - 1) * SEPARACION) / 2 + i * SEPARACION;
    k.add(caja(...dims(1.9, 1.3, GRUESO + 0.02), 0.03), aclarar(pared, 0.3), pos(a, 1.55));
    kv.add(caja(...dims(1.66, 1.06, GRUESO + 0.04), 0.01), vidrio, pos(a, 1.55));
    k.add(caja(...dims(0.07, 1.06, GRUESO + 0.05), 0.01), aclarar(pared, 0.3), pos(a, 1.55));
    k.add(caja(...dims(1.66, 0.07, GRUESO + 0.05), 0.01), aclarar(pared, 0.3), pos(a, 1.55));
    k.add(caja(...dims(2.1, 0.07, GRUESO + 0.12), 0.015), oscurecer(pared, 0.08), pos(a, 0.88));
  }
  return { solido: k.construir(), vidrio: kv.construir() };
}

export function Perimetro({ d, noche }: { d: DefinicionOficina; noche: boolean }) {
  const muros = useMemo(
    () => Object.fromEntries(LADOS.map((l) => [l, muro(d, l, noche)])) as Record<Lado, Muro>,
    [d, noche],
  );
  useEffect(
    () => () =>
      Object.values(muros).forEach((m) => {
        m.solido?.dispose();
        m.vidrio?.dispose();
      }),
    [muros],
  );
  const grupos = useRef<Partial<Record<Lado, THREE.Group | null>>>({});
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(dir);
    const visible: Record<Lado, boolean> = {
      n: dir.z < 0,
      s: dir.z > 0,
      o: dir.x < 0,
      e: dir.x > 0,
    };
    for (const l of LADOS) {
      const g = grupos.current[l];
      if (g) g.visible = visible[l];
    }
  });
  return (
    <>
      {LADOS.map((l) => (
        <group key={l} ref={(g) => void (grupos.current[l] = g)}>
          {muros[l].solido && <mesh geometry={muros[l].solido} material={matPlastico()} />}
          {muros[l].vidrio && <mesh geometry={muros[l].vidrio} material={matBrillo()} />}
        </group>
      ))}
    </>
  );
}
