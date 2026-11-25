/** Planta: placa base con «studs», piso del pasillo, pisos de sala por material y muros bajos con puerta. */
import type { DefinicionOficina, SalaDef } from '../../../shared/oficina3d/definicion';
import { caja, cilindro, Marco, type Kit } from './kit';
import { aclarar, mezclar, oscurecer } from './muebles';

const GROSOR = 0.1;
const HUECO = 1.3;

export function placaBase(k: Kit, d: DefinicionOficina, studs: boolean): void {
  const { ancho, fondo } = d.planta;
  const c = d.office.apariencia.colores;
  const margen = 2;
  const base = mezclar(c.secundario, c.fondo, 0.55);
  k.add(caja(ancho + margen * 2, 0.12, fondo + margen * 2, 0.04), base, [
    ancho / 2,
    -0.07,
    fondo / 2,
  ]);
  k.add(caja(ancho + 0.3, 0.04, fondo + 0.3, 0.01), c.piso, [ancho / 2, -0.005, fondo / 2]);
  // Franja del pasillo
  k.add(caja(ancho - 0.4, 0.006, 0.08, 0.002), aclarar(c.secundario, 0.2), [
    ancho / 2,
    0.018,
    d.planta.pasilloZ,
  ]);
  if (!studs) return;
  const stud = cilindro(0.16, 0.16, 0.06, 14);
  const claro = aclarar(base, 0.06);
  for (let x = -margen + 0.5; x < ancho + margen; x += 1)
    for (let z = -margen + 0.5; z < fondo + margen; z += 1) {
      const dentro = x > -0.2 && x < ancho + 0.2 && z > -0.2 && z < fondo + 0.2;
      if (!dentro) k.add(stud, claro, [x, 0.02, z]);
    }
}

function pisoSala(k: Kit, s: SalaDef): void {
  const { ancho, fondo, piso, colorPiso } = s.apariencia;
  const m = new Marco().hijo([s.x, 0, s.z]);
  const y = 0.02;
  if (piso === 'madera') {
    for (let i = 0; i < fondo / 0.5; i++) {
      const tono =
        i % 3 === 0
          ? oscurecer(colorPiso, 0.06)
          : i % 3 === 1
            ? colorPiso
            : aclarar(colorPiso, 0.05);
      k.add(caja(ancho - 0.02, 0.03, 0.48, 0.008), tono, [ancho / 2, y, i * 0.5 + 0.25], m);
    }
    return;
  }
  if (piso === 'cuadros') {
    for (let x = 0; x < ancho; x++)
      for (let z = 0; z < fondo; z++) {
        const tono = (x + z) % 2 ? colorPiso : oscurecer(colorPiso, 0.12);
        k.add(caja(0.98, 0.03, 0.98, 0.01), tono, [x + 0.5, y, z + 0.5], m);
      }
    return;
  }
  k.add(caja(ancho - 0.02, 0.03, fondo - 0.02, 0.01), colorPiso, [ancho / 2, y, fondo / 2], m);
  if (piso === 'concreto')
    for (let x = 2; x < ancho; x += 2)
      k.add(
        caja(0.02, 0.032, fondo - 0.1, 0.005),
        oscurecer(colorPiso, 0.12),
        [x, y, fondo / 2],
        m,
      );
}

/** Tramo de muro de a→b sobre un eje, con remate de color de acento y «studs» arriba. */
function tramo(
  k: Kit,
  eje: 'x' | 'z',
  fijo: number,
  a: number,
  b: number,
  alto: number,
  color: string,
  acento: string,
  studs: boolean,
): void {
  const largo = b - a;
  if (largo < 0.15) return;
  const centro = (a + b) / 2;
  const pos = (y: number): [number, number, number] =>
    eje === 'x' ? [centro, y, fijo] : [fijo, y, centro];
  const dims = (h: number, extra = 0): [number, number, number] =>
    eje === 'x' ? [largo, h, GROSOR + extra] : [GROSOR + extra, h, largo];
  k.add(caja(...dims(alto), 0.02), color, pos(alto / 2));
  k.add(caja(...dims(0.06, 0.03), 0.015), acento, pos(alto + 0.03));
  if (!studs) return;
  const stud = cilindro(0.035, 0.035, 0.03, 10);
  for (let t = a + 0.25; t < b - 0.1; t += 0.5)
    k.add(stud, acento, eje === 'x' ? [t, alto + 0.075, fijo] : [fijo, alto + 0.075, t]);
}

export function muros(k: Kit, s: SalaDef, studs: boolean): void {
  const { ancho, fondo, colorPared, alturaPared: h, acento } = s.apariencia;
  const g = GROSOR / 2;
  const [x0, z0, x1, z1] = [s.x + g, s.z + g, s.x + ancho - g, s.z + fondo - g];
  const lados: Record<
    SalaDef['puerta']['lado'],
    [eje: 'x' | 'z', fijo: number, a: number, b: number]
  > = {
    n: ['x', z0, x0, x1],
    s: ['x', z1, x0, x1],
    o: ['z', x0, z0, z1],
    e: ['z', x1, z0, z1],
  };
  for (const [lado, [eje, fijo, a, b]] of Object.entries(lados) as [
    SalaDef['puerta']['lado'],
    ['x' | 'z', number, number, number],
  ][]) {
    if (lado !== s.puerta.lado) {
      tramo(k, eje, fijo, a, b, h, colorPared, acento, studs);
      continue;
    }
    const p = (eje === 'x' ? s.x : s.z) + s.puerta.pos;
    tramo(k, eje, fijo, a, p - HUECO / 2, h, colorPared, acento, studs);
    tramo(k, eje, fijo, p + HUECO / 2, b, h, colorPared, acento, studs);
    // Tapete de entrada
    const tap: [number, number, number] = eje === 'x' ? [p, 0.04, fijo] : [fijo, 0.04, p];
    k.add(
      caja(eje === 'x' ? HUECO - 0.2 : 0.5, 0.01, eje === 'x' ? 0.5 : HUECO - 0.2, 0.005),
      oscurecer(acento, 0.2),
      tap,
    );
  }
}

export function salas(k: Kit, d: DefinicionOficina, studs: boolean): void {
  for (const s of d.salas) {
    pisoSala(k, s);
    muros(k, s, studs);
  }
}
