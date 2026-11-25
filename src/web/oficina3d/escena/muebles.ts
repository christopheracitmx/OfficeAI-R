/**
 * Mobiliario procedural de cada puesto (escritorio, silla, monitor, teclado, lámpara, taza,
 * plantita y mamparas de cubículo). Marco local: origen en el asiento, el agente mira hacia -z.
 */
import * as THREE from 'three';
import type { AparienciaSala } from '../../../shared/oficina3d/apariencia';
import { caja, cilindro, cono, esfera, hdr, toro, type Kit, type Marco } from './kit';

export function mezclar(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}
export const aclarar = (c: string, t: number) => mezclar(c, '#FFFFFF', t);
export const oscurecer = (c: string, t: number) => mezclar(c, '#000000', t);

/** Escala de puesto y personaje frente a la cuadrícula (proporción visual de la planta). */
export const ESCALA = 1.3;
export const ALTO_MESA = 0.44;

/** Rotación de un puesto (grados, 0 = mira al norte/-z) a radianes en Y. */
export function rotY(rot: number): number {
  return (-rot * Math.PI) / 180;
}
/** Pantalla del monitor en el marco del puesto (para la malla instanciada que se enciende). */
export const PANTALLA = { pos: [0, 0.665, -0.705] as const, w: 0.44, h: 0.26 };

const GRIS = '#3A4448';
const BLANCO = '#F4F6F7';

export function escritorio(k: Kit, m: Marco, sala: AparienciaSala, mini: boolean): void {
  const ancho = mini ? 1.6 : 1.3;
  const tapa = mini ? '#7A5232' : BLANCO;
  k.add(caja(ancho, 0.045, 0.62, 0.015), tapa, [0, ALTO_MESA - 0.022, -0.55], m);
  // Costados tipo panel y cajonera
  const lado = mini ? '#5E3E25' : aclarar(sala.acento, 0.55);
  k.add(
    caja(0.04, ALTO_MESA - 0.045, 0.56, 0.01),
    lado,
    [-ancho / 2 + 0.04, (ALTO_MESA - 0.045) / 2, -0.55],
    m,
  );
  k.add(
    caja(0.3, ALTO_MESA - 0.06, 0.52, 0.015),
    lado,
    [ancho / 2 - 0.2, (ALTO_MESA - 0.06) / 2, -0.55],
    m,
  );
  k.add(caja(0.2, 0.012, 0.02, 0.004), GRIS, [ancho / 2 - 0.2, 0.3, -0.28], m);
  k.add(caja(0.2, 0.012, 0.02, 0.004), GRIS, [ancho / 2 - 0.2, 0.16, -0.28], m);
}

export function silla(k: Kit, m: Marco, color: string): void {
  k.add(caja(0.42, 0.06, 0.4, 0.025), color, [0, 0.2, 0.04], m);
  k.add(caja(0.4, 0.38, 0.06, 0.03), color, [0, 0.43, 0.25], m, [-0.12, 0, 0]);
  k.add(cilindro(0.025, 0.025, 0.16, 8), GRIS, [0, 0.1, 0.04], m);
  k.add(cilindro(0.2, 0.2, 0.03, 10), GRIS, [0, 0.025, 0.04], m);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add(esfera(0.025, 6), '#1E1E1E', [Math.cos(a) * 0.19, 0.02, 0.04 + Math.sin(a) * 0.19], m);
  }
}

export function monitor(k: Kit, m: Marco, doble = false): void {
  const xs = doble ? [-0.26, 0.26] : [0];
  for (const x of xs) {
    k.add(caja(0.18, 0.015, 0.12, 0.006), GRIS, [x, ALTO_MESA + 0.008, -0.72], m);
    k.add(caja(0.035, 0.17, 0.025, 0.008), GRIS, [x, ALTO_MESA + 0.09, -0.735], m);
    k.add(
      caja(PANTALLA.w + 0.04, PANTALLA.h + 0.04, 0.03, 0.012),
      '#1C2326',
      [x, PANTALLA.pos[1], -0.72],
      m,
    );
  }
  k.add(caja(0.36, 0.018, 0.12, 0.006), '#2B3236', [0, ALTO_MESA + 0.009, -0.42], m);
  k.add(caja(0.06, 0.016, 0.09, 0.02), '#2B3236', [0.27, ALTO_MESA + 0.008, -0.42], m);
}

export function lampara(k: Kit, kb: Kit, m: Marco, color: string): void {
  const x = -0.5;
  const z = -0.72;
  k.add(cilindro(0.07, 0.08, 0.025, 12), color, [x, ALTO_MESA + 0.012, z], m);
  k.add(cilindro(0.012, 0.012, 0.3, 6), GRIS, [x, ALTO_MESA + 0.16, z], m, [0, 0, 0.2]);
  k.add(cono(0.08, 0.1, 14), color, [x + 0.07, ALTO_MESA + 0.3, z + 0.02], m, [0, 0, -0.5]);
  kb.add(esfera(0.035, 8), hdr('#FFD9A0', 3.2), [x + 0.085, ALTO_MESA + 0.27, z + 0.02], m);
}

export function taza(
  k: Kit,
  m: Marco,
  color: string,
  pos: readonly [number, number] = [0.45, -0.4],
): void {
  k.add(cilindro(0.04, 0.035, 0.09, 12), color, [pos[0], ALTO_MESA + 0.045, pos[1]], m);
  k.add(toro(0.025, 0.008, Math.PI * 2, 10), color, [pos[0] + 0.045, ALTO_MESA + 0.05, pos[1]], m, [
    0,
    0,
    Math.PI / 2,
  ]);
  k.add(cilindro(0.033, 0.033, 0.005, 10), '#4A2C1A', [pos[0], ALTO_MESA + 0.085, pos[1]], m);
}

export function planta(
  k: Kit,
  m: Marco,
  x: number,
  z: number,
  y = 0,
  escala = 1,
  maceta = '#C0703B',
): void {
  const s = escala;
  k.add(cilindro(0.09 * s, 0.07 * s, 0.14 * s, 12), maceta, [x, y + 0.07 * s, z], m);
  k.add(cilindro(0.08 * s, 0.08 * s, 0.01, 12), '#4A3222', [x, y + 0.14 * s, z], m);
  const hojas = ['#2F8F4E', '#3FA35F', '#257A40', '#4DB36C'];
  [
    [0, 0.24, 0, 0.11],
    [0.07, 0.2, 0.03, 0.08],
    [-0.06, 0.21, -0.04, 0.085],
    [0.01, 0.31, -0.02, 0.075],
  ].forEach(([dx, dy, dz, rad], i) =>
    k.add(esfera(rad! * s, 10), hojas[i]!, [x + dx! * s, y + dy! * s, z + dz! * s], m),
  );
}

export function mamparas(k: Kit, m: Marco, acento: string): void {
  const panel = aclarar(acento, 0.7);
  const marco = aclarar(acento, 0.25);
  k.add(caja(1.6, 0.72, 0.05, 0.02), panel, [0, 0.36, -1.0], m);
  k.add(caja(1.64, 0.04, 0.07, 0.015), marco, [0, 0.74, -1.0], m);
  for (const s of [-1, 1]) {
    k.add(caja(0.05, 0.62, 0.9, 0.02), panel, [s * 0.8, 0.31, -0.57], m);
    k.add(caja(0.07, 0.04, 0.92, 0.015), marco, [s * 0.8, 0.64, -0.57], m);
  }
  // Notas adhesivas en la mampara
  ['#F7E26B', '#F2A6B3', '#9FD8F5'].forEach((c, i) =>
    k.add(caja(0.08, 0.08, 0.006, 0.002), c, [-0.55 + i * 0.11, 0.55 - (i % 2) * 0.06, -0.97], m),
  );
}

/** Puesto completo. Devuelve el marco del puesto (para la pantalla instanciada). */
export function puesto(
  k: Kit,
  kb: Kit,
  m: Marco,
  sala: AparienciaSala,
  i: number,
  colorSilla: string,
): void {
  const mini = sala.mobiliario === 'mini_oficina';
  if (sala.mobiliario === 'cubiculos') mamparas(k, m, sala.acento);
  escritorio(k, m, sala, mini);
  silla(k, m, mini ? '#3B2416' : colorSilla);
  monitor(k, m, sala.utileria.includes('pared_monitores') && i % 2 === 0);
  lampara(k, kb, m, oscurecer(sala.acento, 0.15));
  taza(k, m, ['#F4F6F7', '#E07A5F', '#F2B33D', '#5B8DEF'][i % 4]!);
  planta(k, m, 0.52, -0.74, ALTO_MESA, 0.55);
  // Papeles y folder sobre el escritorio
  k.add(caja(0.2, 0.01, 0.26, 0.002), '#FFFFFF', [-0.25, ALTO_MESA + 0.005, -0.38], m, [0, 0.2, 0]);
  k.add(
    caja(0.22, 0.02, 0.28, 0.004),
    '#F2B33D',
    [-0.25, ALTO_MESA + 0.016, -0.62],
    m,
    [0, -0.1, 0],
  );
}
