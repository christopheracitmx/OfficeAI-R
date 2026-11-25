/**
 * Kit de construcción procedural: acumula piezas (geometría base + color + transformación) y las
 * fusiona en UNA geometría con color por vértice. Así toda la oficina estática son 2-3 draw calls
 * y cada articulación de un personaje es una sola malla. Geometrías base cacheadas.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map<string, THREE.BufferGeometry>();
function cacheada(clave: string, crear: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(clave);
  if (!g) {
    g = crear();
    if (g.index === null) g = indexar(g);
    cache.set(clave, g);
  }
  return g;
}
function indexar(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Caja con bordes biselados (look de plástico inyectado). */
export const caja = (w: number, h: number, d: number, radio = 0.025) => {
  const rad = Math.min(radio, w / 2, h / 2, d / 2) * 0.99;
  return cacheada(`caja|${r(w)}|${r(h)}|${r(d)}|${r(rad)}`, () =>
    rad > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, rad) : new THREE.BoxGeometry(w, h, d),
  );
};
export const cilindro = (rt: number, rb: number, h: number, seg = 16) =>
  cacheada(
    `cil|${r(rt)}|${r(rb)}|${r(h)}|${seg}`,
    () => new THREE.CylinderGeometry(rt, rb, h, seg),
  );
export const esfera = (rad: number, seg = 12, phiLen = Math.PI * 2, thetaLen = Math.PI) =>
  cacheada(
    `esf|${r(rad)}|${seg}|${r(phiLen)}|${r(thetaLen)}`,
    () =>
      new THREE.SphereGeometry(
        rad,
        seg,
        Math.max(6, Math.round(seg * 0.6)),
        0,
        phiLen,
        0,
        thetaLen,
      ),
  );
export const toro = (rad: number, tubo: number, arco = Math.PI * 2, seg = 16) =>
  cacheada(
    `toro|${r(rad)}|${r(tubo)}|${r(arco)}|${seg}`,
    () => new THREE.TorusGeometry(rad, tubo, 6, seg, arco),
  );
export const cono = (rad: number, h: number, seg = 16) =>
  cacheada(`cono|${r(rad)}|${r(h)}|${seg}`, () => new THREE.ConeGeometry(rad, h, seg, 1, true));
export const plano = (w: number, h: number) =>
  cacheada(`plano|${r(w)}|${r(h)}`, () => new THREE.PlaneGeometry(w, h));

export type Vec3 = readonly [number, number, number];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Transformación de un grupo (para colocar sub-ensambles: un escritorio en su puesto, etc.). */
export class Marco {
  constructor(public readonly m = new THREE.Matrix4()) {}
  hijo(pos: Vec3, rotY = 0, rot: Vec3 = [0, 0, 0], escala = 1): Marco {
    tmpE.set(rot[0], rot[1] + rotY, rot[2]);
    tmpQ.setFromEuler(tmpE);
    const local = new THREE.Matrix4().compose(tmpP.set(...pos), tmpQ, tmpS.setScalar(escala));
    return new Marco(this.m.clone().multiply(local));
  }
}

export class Kit {
  private piezas: THREE.BufferGeometry[] = [];

  get tamano(): number {
    return this.piezas.length;
  }

  /** Añade una pieza. `rot` en radianes (x, y, z); `esc` escala opcional. */
  add(
    g: THREE.BufferGeometry,
    color: string | THREE.Color,
    pos: Vec3,
    marco?: Marco,
    rot: Vec3 = [0, 0, 0],
    esc: Vec3 = [1, 1, 1],
  ): this {
    tmpE.set(rot[0], rot[1], rot[2]);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(...pos), tmpQ, tmpS.set(...esc));
    if (marco) tmpM.premultiply(marco.m);
    const c = g.clone();
    c.applyMatrix4(tmpM);
    if (typeof color === 'string') tmpC.set(color).convertSRGBToLinear();
    else tmpC.copy(color);
    const n = c.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.piezas.push(c);
    return this;
  }

  /** Fusiona todo en una geometría (o null si está vacío). Libera las piezas intermedias. */
  construir(): THREE.BufferGeometry | null {
    if (this.piezas.length === 0) return null;
    const g = mergeGeometries(this.piezas, false);
    this.piezas.forEach((p) => p.dispose());
    this.piezas = [];
    g?.computeBoundingSphere();
    return g;
  }
}

// ---- Materiales compartidos (un programa de shader por tipo)
let plastico: THREE.MeshStandardMaterial | null = null;
let brillo: THREE.MeshBasicMaterial | null = null;
/** Plástico tipo bloque: color por vértice, algo de brillo especular. */
export function matPlastico(): THREE.MeshStandardMaterial {
  plastico ??= new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0.02,
  });
  return plastico;
}
/** Emisivo (pantallas, focos): sin tone mapping para que el bloom lo detecte. */
export function matBrillo(): THREE.MeshBasicMaterial {
  brillo ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return brillo;
}

/** Color "encendido" (>1 en lineal) para que supere el umbral del bloom. */
export function hdr(color: string, intensidad: number): THREE.Color {
  return new THREE.Color(color).convertSRGBToLinear().multiplyScalar(intensidad);
}
