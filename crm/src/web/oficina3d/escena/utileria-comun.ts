/** Utilería procedural de salas comunes (juntas, biblioteca, cafetería, recepción, aprendizaje). */
import type { SalaDef } from '../../../shared/oficina3d/definicion';
import { caja, cilindro, hdr, type Kit, type Marco } from './kit';
import { aclarar, oscurecer, planta, silla, taza } from './muebles';

const LIBROS = [
  '#B23A2A',
  '#2E86DE',
  '#1F9D6B',
  '#E0A526',
  '#8E6CCF',
  '#0F3D47',
  '#E07A5F',
  '#F4F6F7',
];

/** z del centro de la zona libre (lado de la puerta) y si la sala abre al sur. */
export function zonas(s: SalaDef) {
  const f = s.apariencia.fondo;
  const sur = s.puerta.lado === 's';
  return { sur, libre: sur ? f - 2.4 : 2.4, fondo: sur ? 0.6 : f - 0.6 };
}

export function pizarron(k: Kit, m: Marco, color: string, w = 2, h = 1.1): void {
  k.add(caja(w + 0.1, h + 0.1, 0.06, 0.02), '#9AA6AB', [0, 0.45 + h / 2, 0], m);
  k.add(caja(w, h, 0.02, 0.005), color, [0, 0.45 + h / 2, 0.035], m);
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
    k.add(caja(0.05, 0.5, 0.05, 0.01), '#7D898E', [x, 0.25, 0], m);
    k.add(caja(0.08, 0.03, 0.5, 0.01), '#7D898E', [x, 0.015, 0], m);
  }
}

function sofa(k: Kit, m: Marco, color: string, ancho = 1.5): void {
  k.add(caja(ancho, 0.2, 0.62, 0.06), color, [0, 0.16, 0], m);
  k.add(caja(ancho, 0.36, 0.16, 0.06), oscurecer(color, 0.1), [0, 0.3, 0.26], m);
  for (const s of [-1, 1])
    k.add(caja(0.16, 0.3, 0.62, 0.06), oscurecer(color, 0.1), [s * (ancho / 2 - 0.02), 0.22, 0], m);
  for (let i = 0; i < 2; i++)
    k.add(
      caja(ancho / 2 - 0.1, 0.08, 0.5, 0.04),
      aclarar(color, 0.15),
      [(i - 0.5) * (ancho / 2 - 0.08), 0.29, -0.02],
      m,
    );
}

function mesaRedonda(k: Kit, m: Marco, rad: number, color: string, h = 0.44): void {
  k.add(cilindro(rad, rad, 0.05, 28), color, [0, h, 0], m);
  k.add(cilindro(0.05, 0.05, h, 10), '#3A4448', [0, h / 2, 0], m);
  k.add(cilindro(0.25, 0.28, 0.03, 16), '#3A4448', [0, 0.015, 0], m);
}

export function utileriaComun(k: Kit, kb: Kit, s: SalaDef, base: Marco): void {
  const { ancho, fondo, acento, utileria: lista } = s.apariencia;
  const z = zonas(s);
  const giro = Math.PI / 2; // tableros miran al este (hacia la cámara inicial)
  for (const u of lista) {
    switch (u) {
      case 'mesa_juntas': {
        const m = base.hijo([ancho / 2 + 0.4, 0, z.libre], 0);
        k.add(
          cilindro(0.75, 0.75, 0.05, 32),
          '#7A5232',
          [0, 0.44, 0],
          m,
          [0, 0, 0],
          [1.6, 1, 0.75],
        );
        for (const x of [-0.6, 0.6])
          k.add(cilindro(0.06, 0.08, 0.42, 10), '#3A2416', [x, 0.21, 0], m);
        [
          [-0.7, -0.85, 0],
          [0.7, -0.85, 0],
          [-0.7, 0.85, Math.PI],
          [0.7, 0.85, Math.PI],
          [-1.5, 0, -Math.PI / 2],
        ].forEach(([x, zz, r]) => silla(k, m.hijo([x!, 0, zz!], r!), '#3B2416'));
        taza(k, m, '#FFFFFF', [0.2, 0.15]);
        k.add(caja(0.28, 0.01, 0.2, 0.002), '#FFFFFF', [-0.4, 0.47, -0.1], m, [0, 0.4, 0]);
        break;
      }
      case 'alfombra': {
        k.add(caja(3.6, 0.012, 2.6, 0.006), '#8C2F39', [ancho / 2 + 0.4, 0.03, z.libre], base);
        k.add(caja(3.3, 0.014, 2.3, 0.006), '#C9A66B', [ancho / 2 + 0.4, 0.031, z.libre], base);
        break;
      }
      case 'estantes': {
        for (let e = 0; e < 3; e++) {
          const m = base.hijo(
            [1.0 + e * 1.6, 0, z.fondo + (z.sur ? 0.2 : -0.2)],
            z.sur ? 0 : Math.PI,
          );
          k.add(caja(1.4, 1.5, 0.36, 0.02), '#6B4423', [0, 0.75, 0], m);
          for (let n = 0; n < 4; n++) {
            const y = 0.12 + n * 0.36;
            k.add(caja(1.3, 0.03, 0.32, 0.005), '#8A5A33', [0, y, 0.02], m);
            let x = -0.6;
            let b = (e * 7 + n * 3) % LIBROS.length;
            while (x < 0.58) {
              const w = 0.05 + ((b * 13) % 4) * 0.012;
              const h = 0.22 + ((b * 7) % 3) * 0.03;
              k.add(
                caja(w, h, 0.24, 0.006),
                LIBROS[b % LIBROS.length]!,
                [x + w / 2, y + 0.015 + h / 2, 0.04],
                m,
              );
              x += w + 0.008;
              b++;
            }
          }
        }
        break;
      }
      case 'pizarron': {
        const m = base.hijo([0.7, 0, z.libre + 0.4], giro);
        pizarron(k, m, '#FFFFFF', 2.2, 1.1);
        ['#F7E26B', '#F2A6B3', '#9FD8F5', '#B8F2A0', '#F7E26B', '#9FD8F5'].forEach((c, i) =>
          k.add(
            caja(0.22, 0.2, 0.01, 0.004),
            c,
            [-0.75 + (i % 3) * 0.75, 0.75 + Math.floor(i / 3) * 0.4, 0.05],
            m,
          ),
        );
        break;
      }
      case 'buzon': {
        const m = base.hijo([ancho - 1.0, 0, z.libre], -Math.PI / 2);
        k.add(caja(0.08, 0.6, 0.08, 0.02), '#3A4448', [0, 0.3, 0], m);
        k.add(caja(0.42, 0.36, 0.34, 0.06), '#5B8DEF', [0, 0.78, 0], m);
        k.add(caja(0.24, 0.025, 0.02, 0.005), '#1C2326', [0, 0.86, 0.17], m);
        k.add(caja(0.18, 0.1, 0.01, 0.003), '#FFFFFF', [0, 0.7, 0.172], m);
        break;
      }
      case 'barra_cafe': {
        const m = base.hijo([ancho / 2, 0, z.fondo + (z.sur ? 0.3 : -0.3)], z.sur ? 0 : Math.PI);
        k.add(caja(ancho - 1.4, 0.48, 0.55, 0.03), '#7A4B2E', [0, 0.24, 0], m);
        k.add(caja(ancho - 1.3, 0.05, 0.62, 0.02), '#E9E2D6', [0, 0.5, 0], m);
        k.add(caja(0.42, 0.5, 0.36, 0.04), '#2B3236', [-1.6, 0.78, -0.04], m);
        kb.add(caja(0.12, 0.06, 0.005, 0.002), hdr('#FF9A3C', 2.4), [-1.6, 0.9, 0.142], m);
        k.add(cilindro(0.09, 0.09, 0.22, 14), '#C0C6C9', [-0.9, 0.64, -0.05], m);
        for (let t = 0; t < 4; t++)
          taza(k, m, ['#FFFFFF', '#E07A5F', '#F2B33D', '#5B8DEF'][t]!, [-0.2 + t * 0.18, 0.08]);
        k.add(caja(0.5, 0.12, 0.3, 0.03), '#C68B5E', [1.2, 0.58, -0.05], m);
        break;
      }
      case 'mostrador': {
        const m = base.hijo([ancho / 2, 0, 3.4], Math.PI);
        k.add(caja(2.6, 0.6, 0.5, 0.05), '#F4F6F7', [0, 0.3, 0], m);
        k.add(caja(2.7, 0.05, 0.6, 0.02), '#0F3D47', [0, 0.62, 0], m);
        k.add(caja(2.62, 0.08, 0.02, 0.01), acento, [0, 0.45, 0.255], m);
        silla(k, m.hijo([0.5, 0, -0.6], Math.PI), '#0F3D47');
        planta(k, m, -1.1, -0.05, 0.645, 0.7);
        break;
      }
      case 'sofa': {
        const pos: [number, number] =
          s.tipo === 'recepcion' ? [ancho - 1.2, z.libre + 3] : [ancho - 1.3, z.libre];
        sofa(
          k,
          base.hijo([pos[0], 0, pos[1]], -Math.PI / 2),
          s.tipo === 'biblioteca' ? '#8C2F39' : '#2E6E80',
        );
        if (s.tipo === 'cafeteria') {
          mesaRedonda(k, base.hijo([ancho / 2 - 1, 0, z.libre], 0), 0.45, '#E9E2D6');
          mesaRedonda(k, base.hijo([ancho / 2 + 1, 0, z.libre + 0.3], 0), 0.45, '#E9E2D6');
        }
        break;
      }
      case 'plantas': {
        planta(k, base, 0.45, z.sur ? fondo - 0.45 : 0.45, 0, 2.2, oscurecer(acento, 0.1));
        planta(k, base, ancho - 0.45, z.sur ? fondo - 0.45 : 0.45, 0, 1.8, '#E9E2D6');
        break;
      }
    }
  }
}
