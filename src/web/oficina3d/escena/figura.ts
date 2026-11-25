/**
 * Minifigura procedural a partir de `apariencia`: cada articulación (cadera, piernas, torso, brazos,
 * cabeza) es UNA geometría fusionada con color por vértice. Cada pieza está en coordenadas de su
 * pivote, así la animación solo rota/traslada grupos (transform).
 * Medidas (de pie): pivote de cadera y = 0.30, cintura 0.33, hombros 0.60, cuello 0.63. Mira a -z.
 */
import type * as THREE from 'three';
import type { AparienciaPersonaje } from '../../../shared/oficina3d/apariencia';
import { caja, cilindro, esfera, Kit, toro } from './kit';
import { oscurecer } from './muebles';

export const CADERA_Y = 0.3;
export const HOMBRO = { x: 0.155, y: 0.27 };

export interface GeoFigura {
  cadera: THREE.BufferGeometry;
  pierna: [THREE.BufferGeometry, THREE.BufferGeometry];
  torso: THREE.BufferGeometry;
  brazo: [THREE.BufferGeometry, THREE.BufferGeometry];
  cabeza: THREE.BufferGeometry;
}

const PI = Math.PI;

function pierna(a: AparienciaPersonaje): THREE.BufferGeometry {
  const k = new Kit();
  k.add(caja(0.14, 0.24, 0.16, 0.03), a.pantalon, [0, -0.12, 0]);
  const alto = a.calzado === 'botas' ? 0.09 : 0.05;
  k.add(caja(0.145, alto, 0.19, 0.02), a.colorCalzado, [0, -0.3 + alto / 2 + 0.02, -0.015]);
  if (a.calzado === 'tenis') k.add(caja(0.15, 0.015, 0.2, 0.005), '#FFFFFF', [0, -0.275, -0.015]);
  return k.construir()!;
}

function torso(a: AparienciaPersonaje): THREE.BufferGeometry {
  const k = new Kit();
  const arriba = a.cuerpo === 'f' ? 0.115 : 0.13;
  // Tronco trapezoidal: cilindro de 4 lados girado 45°, escalado a rectángulo.
  k.add(
    cilindro(arriba * 1.414, 0.165 * 1.414, 0.29, 4),
    a.camisa,
    [0, 0.145, 0],
    undefined,
    [0, PI / 4, 0],
    [1, 1, 0.55],
  );
  k.add(
    caja(0.08, 0.05, 0.01, 0.008),
    oscurecer(a.camisa, 0.25),
    [0, 0.255, -0.062],
    undefined,
    [0.35, 0, 0],
  );
  k.add(cilindro(0.045, 0.05, 0.03, 12), a.piel, [0, 0.305, 0]);
  if (a.accesorio === 'corbata') {
    k.add(
      caja(0.04, 0.03, 0.01, 0.004),
      a.colorAccesorio,
      [0, 0.255, -0.07],
      undefined,
      [0.18, 0, 0],
    );
    k.add(
      caja(0.045, 0.17, 0.01, 0.004),
      a.colorAccesorio,
      [0, 0.15, -0.078],
      undefined,
      [0.12, 0, 0],
    );
  } else {
    k.add(
      caja(0.012, 0.012, 0.006, 0.002),
      oscurecer(a.camisa, 0.3),
      [0, 0.18, -0.077],
      undefined,
      [0.12, 0, 0],
    );
    k.add(
      caja(0.012, 0.012, 0.006, 0.002),
      oscurecer(a.camisa, 0.3),
      [0, 0.11, -0.085],
      undefined,
      [0.12, 0, 0],
    );
  }
  k.add(caja(0.33, 0.05, 0.17, 0.015), a.pantalon, [0, -0.005, 0]);
  return k.construir()!;
}

function cadera(a: AparienciaPersonaje): THREE.BufferGeometry {
  const k = new Kit();
  k.add(caja(0.3, 0.05, 0.16, 0.015), a.pantalon, [0, 0.0, 0]);
  return k.construir()!;
}

function brazo(a: AparienciaPersonaje, lado: 1 | -1): THREE.BufferGeometry {
  const k = new Kit();
  k.add(caja(0.085, 0.2, 0.1, 0.035), a.camisa, [lado * 0.02, -0.09, 0], undefined, [
    0,
    0,
    lado * 0.12,
  ]);
  k.add(cilindro(0.032, 0.032, 0.04, 10), a.piel, [lado * 0.035, -0.21, -0.01]);
  k.add(toro(0.032, 0.014, PI * 1.5, 10), a.piel, [lado * 0.035, -0.25, -0.02], undefined, [
    0,
    PI / 2,
    PI / 4,
  ]);
  return k.construir()!;
}

function pelo(k: Kit, a: AparienciaPersonaje): void {
  const c = a.pelo;
  const gorro = (alto = 0.62) =>
    k.add(
      esfera(0.122, 18, PI * 2, PI / 2),
      c,
      [0, 0.165, 0.004],
      undefined,
      [0, 0, 0],
      [1, alto, 1],
    );
  switch (a.peinado) {
    case 'corto':
      gorro(0.6);
      k.add(caja(0.21, 0.08, 0.06, 0.03), c, [0, 0.16, 0.085]);
      k.add(caja(0.17, 0.03, 0.05, 0.015), c, [0.02, 0.215, -0.085], undefined, [0, 0, -0.15]);
      break;
    case 'largo':
      gorro(0.65);
      k.add(caja(0.25, 0.28, 0.07, 0.035), c, [0, 0.06, 0.085]);
      for (const s of [-1, 1]) k.add(caja(0.05, 0.22, 0.12, 0.025), c, [s * 0.11, 0.08, 0.02]);
      k.add(caja(0.2, 0.04, 0.05, 0.02), c, [-0.02, 0.215, -0.09], undefined, [0, 0, 0.2]);
      break;
    case 'rizado':
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * PI * 2;
        k.add(esfera(0.055, 10), c, [
          Math.cos(ang) * 0.1,
          0.18 + (i % 2) * 0.02,
          Math.sin(ang) * 0.1 + 0.01,
        ]);
      }
      k.add(esfera(0.09, 12), c, [0, 0.215, 0.01]);
      break;
    case 'chongo':
      gorro(0.6);
      k.add(esfera(0.065, 12), c, [0, 0.27, 0.06]);
      k.add(
        cilindro(0.04, 0.04, 0.02, 10),
        oscurecer(c, 0.3),
        [0, 0.235, 0.05],
        undefined,
        [0.5, 0, 0],
      );
      break;
    case 'coleta':
      gorro(0.62);
      k.add(cilindro(0.04, 0.025, 0.2, 10), c, [0, 0.12, 0.15], undefined, [-0.4, 0, 0]);
      k.add(esfera(0.045, 10), c, [0, 0.21, 0.12]);
      break;
    case 'calvo':
      break;
  }
}

function accesorio(k: Kit, a: AparienciaPersonaje): void {
  const c = a.colorAccesorio;
  if (a.accesorio === 'lentes') {
    for (const s of [-1, 1]) k.add(toro(0.027, 0.006, PI * 2, 14), c, [s * 0.042, 0.125, -0.108]);
    k.add(caja(0.03, 0.008, 0.008, 0.002), c, [0, 0.128, -0.11]);
  } else if (a.accesorio === 'gorra') {
    k.add(esfera(0.125, 18, PI * 2, PI / 2), c, [0, 0.175, 0], undefined, [0, 0, 0], [1, 0.62, 1]);
    k.add(caja(0.17, 0.016, 0.12, 0.008), c, [0, 0.18, -0.13], undefined, [0.12, 0, 0]);
    k.add(cilindro(0.015, 0.015, 0.01, 8), oscurecer(c, 0.3), [0, 0.255, 0]);
  } else if (a.accesorio === 'audifonos') {
    k.add(toro(0.128, 0.014, PI, 18), c, [0, 0.13, 0]);
    for (const s of [-1, 1])
      k.add(cilindro(0.04, 0.04, 0.035, 14), c, [s * 0.12, 0.11, 0], undefined, [0, 0, PI / 2]);
  }
}

function cabeza(a: AparienciaPersonaje): THREE.BufferGeometry {
  const k = new Kit();
  k.add(cilindro(0.105, 0.105, 0.17, 24), a.piel, [0, 0.115, 0]);
  k.add(cilindro(0.097, 0.105, 0.012, 24), a.piel, [0, 0.206, 0]);
  k.add(cilindro(0.058, 0.058, 0.04, 16), a.piel, [0, 0.225, 0]);
  // Cara (frente = -z)
  for (const s of [-1, 1]) {
    k.add(esfera(0.017, 10), a.ojos, [s * 0.04, 0.125, -0.098]);
    k.add(esfera(0.006, 6), '#FFFFFF', [s * 0.04 + 0.006, 0.131, -0.112]);
    k.add(
      caja(0.04, 0.009, 0.008, 0.003),
      oscurecer(a.pelo, 0.1),
      [s * 0.042, 0.158, -0.1],
      undefined,
      [0, 0, s * -0.12],
    );
    if (a.cuerpo === 'f')
      k.add(caja(0.012, 0.012, 0.006, 0.002), '#1E1712', [s * 0.062, 0.137, -0.096], undefined, [
        0,
        0,
        s * 0.6,
      ]);
    if (a.expresion === 'feliz')
      k.add(
        esfera(0.017, 8),
        '#F29A9A',
        [s * 0.065, 0.095, -0.094],
        undefined,
        [0, 0, 0],
        [1, 0.6, 0.4],
      );
  }
  const boca = a.cuerpo === 'f' ? '#B5444F' : '#3A2018';
  if (a.expresion === 'seria') k.add(caja(0.045, 0.008, 0.008, 0.003), boca, [0, 0.082, -0.104]);
  else
    k.add(
      toro(a.expresion === 'feliz' ? 0.032 : 0.026, 0.006, PI, 12),
      boca,
      [0, 0.092, -0.102],
      undefined,
      [0, 0, PI],
    );
  pelo(k, a);
  accesorio(k, a);
  return k.construir()!;
}

export function geoFigura(a: AparienciaPersonaje): GeoFigura {
  return {
    cadera: cadera(a),
    pierna: [pierna(a), pierna(a)],
    torso: torso(a),
    brazo: [brazo(a, -1), brazo(a, 1)],
    cabeza: cabeza(a),
  };
}

export function liberarFigura(g: GeoFigura): void {
  [g.cadera, ...g.pierna, g.torso, ...g.brazo, g.cabeza].forEach((x) => x.dispose());
}
