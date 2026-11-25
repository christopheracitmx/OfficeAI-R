/** Utilería procedural por área (lo que hace reconocible cada sala). Coordenadas locales de la sala. */
import type { SalaDef } from '../../../shared/oficina3d/definicion';
import { caja, cilindro, esfera, hdr, toro, type Kit, type Marco } from './kit';
import { aclarar } from './muebles';
import { pizarron, utileriaComun, zonas } from './utileria-comun';

export function utileria(k: Kit, kb: Kit, s: SalaDef, base: Marco): void {
  const { ancho, acento, utileria: lista } = s.apariencia;
  const z = zonas(s);
  const giro = Math.PI / 2; // tableros miran al este (hacia la cámara inicial)
  for (const u of lista) {
    switch (u) {
      case 'mapa': {
        const m = base.hijo([0.7, 0, z.libre], giro);
        pizarron(k, m, '#EAF2F0', 2.2, 1.2);
        // Mapa estilizado CDMX/Edomex: manchas verdes, red de calles y pines
        [
          [-0.5, 0.95, 0.5, 0.35],
          [0.2, 1.1, 0.7, 0.4],
          [0.55, 0.75, 0.4, 0.3],
          [-0.2, 0.7, 0.45, 0.25],
        ].forEach(([x, y, w, h], i) =>
          k.add(caja(w!, h!, 0.01, 0.05), i % 2 ? '#B9DDB0' : '#9ED0C9', [x!, y!, 0.05], m),
        );
        k.add(caja(1.8, 0.015, 0.012, 0.002), '#E0A526', [0, 1.0, 0.058], m, [0, 0, 0.25]);
        k.add(caja(1.6, 0.015, 0.012, 0.002), '#E0A526', [0, 0.9, 0.058], m, [0, 0, -0.4]);
        [
          [-0.45, 1.05],
          [0.15, 1.2],
          [0.5, 0.8],
          [-0.1, 0.72],
          [0.3, 1.0],
        ].forEach(([x, y], i) => {
          k.add(esfera(0.03, 8), i % 2 ? '#D64545' : '#2E86DE', [x!, y!, 0.08], m);
          k.add(cilindro(0.006, 0.006, 0.05, 4), '#555555', [x!, y! - 0.03, 0.07], m, [0.6, 0, 0]);
        });
        break;
      }
      case 'pared_monitores': {
        const m = base.hijo([0.7, 0, z.libre], giro);
        k.add(caja(2.4, 0.06, 0.4, 0.02), '#2B3236', [0, 0.4, -0.1], m);
        k.add(caja(0.12, 0.4, 0.12, 0.02), '#2B3236', [0, 0.2, -0.1], m);
        for (let f = 0; f < 2; f++)
          for (let c = 0; c < 3; c++) {
            const x = (c - 1) * 0.74;
            const y = 0.82 + f * 0.46;
            k.add(caja(0.72, 0.44, 0.04, 0.012), '#1C2326', [x, y, 0], m);
            kb.add(
              caja(0.66, 0.38, 0.005, 0.002),
              hdr(['#3FD2CF', '#7FB2FF', '#9EE6A8'][(f + c) % 3]!, 1.6),
              [x, y, 0.023],
              m,
            );
          }
        k.add(caja(0.08, 0.9, 0.08, 0.02), '#2B3236', [0, 0.85, -0.06], m);
        break;
      }
      case 'mesa_maquetas': {
        const m = base.hijo([ancho / 2, 0, z.libre], 0);
        k.add(caja(2.0, 0.06, 1.0, 0.03), '#E9E2D6', [0, 0.44, 0], m);
        for (const [x, zz] of [
          [-0.9, -0.4],
          [0.9, -0.4],
          [-0.9, 0.4],
          [0.9, 0.4],
        ])
          k.add(caja(0.06, 0.42, 0.06, 0.015), '#3A4448', [x!, 0.21, zz!], m);
        // Laptops abiertas, switches con LEDs y access points
        [
          [-0.6, -0.15],
          [-0.25, 0.2],
        ].forEach(([x, zz]) => {
          k.add(caja(0.26, 0.015, 0.18, 0.004), '#3A4448', [x!, 0.48, zz!], m);
          k.add(caja(0.26, 0.17, 0.012, 0.004), '#3A4448', [x!, 0.56, zz! - 0.09], m, [-0.2, 0, 0]);
          kb.add(
            caja(0.23, 0.14, 0.003, 0.001),
            hdr('#5FD4FF', 1.4),
            [x!, 0.56, zz! - 0.082],
            m,
            [-0.2, 0, 0],
          );
        });
        [0.15, 0.35].forEach((zz, i) => {
          k.add(caja(0.5, 0.05, 0.16, 0.008), '#2B3236', [0.45, 0.495, zz - 0.25], m);
          for (let l = 0; l < 6; l++)
            kb.add(
              caja(0.025, 0.01, 0.005, 0.001),
              hdr(l % 3 ? '#4CFF7A' : '#FFC14C', 2),
              [0.27 + l * 0.07, 0.505, zz - 0.168],
              m,
            );
          k.add(cilindro(0.09, 0.1, 0.03, 18), '#F4F6F7', [0.2 + i * 0.4, 0.485, 0.3], m);
          kb.add(
            cilindro(0.015, 0.015, 0.005, 8),
            hdr('#4CC9FF', 2.2),
            [0.2 + i * 0.4, 0.502, 0.3],
            m,
          );
        });
        break;
      }
      case 'sellos': {
        const m = base.hijo([ancho / 2, 0, z.libre], 0);
        k.add(caja(1.8, 0.06, 0.8, 0.03), aclarar(acento, 0.6), [0, 0.44, 0], m);
        for (const x of [-0.8, 0.8])
          k.add(caja(0.06, 0.42, 0.7, 0.015), '#3A4448', [x, 0.21, 0], m);
        [
          ['#1F9D6B', -0.35],
          ['#D64545', 0.35],
        ].forEach(([c, x]) => {
          k.add(caja(0.42, 0.06, 0.32, 0.015), c as string, [x as number, 0.5, 0.1], m);
          for (let h = 0; h < 4; h++)
            k.add(
              caja(0.34, 0.015, 0.26, 0.004),
              h % 2 ? '#F2B33D' : '#FFFFFF',
              [x as number, 0.54 + h * 0.016, 0.1],
              m,
            );
          k.add(cilindro(0.05, 0.06, 0.05, 12), c as string, [(x as number) * 0.4, 0.5, -0.2], m);
          k.add(cilindro(0.02, 0.02, 0.1, 8), '#3A2416', [(x as number) * 0.4, 0.57, -0.2], m);
          k.add(esfera(0.035, 8), '#3A2416', [(x as number) * 0.4, 0.63, -0.2], m);
        });
        break;
      }
      case 'medidor': {
        const m = base.hijo([0.7, 0, z.libre], giro);
        k.add(caja(0.08, 0.7, 0.08, 0.02), '#3A4448', [0, 0.35, -0.05], m);
        k.add(cilindro(0.3, 0.3, 0.03, 10), '#3A4448', [0, 0.015, -0.05], m);
        ['#D64545', '#E0A526', '#1F9D6B'].forEach((c, i) =>
          k.add(toro(0.42, 0.07, Math.PI / 3, 12), c, [0, 0.95, 0], m, [
            0,
            0,
            (2 - i) * (Math.PI / 3),
          ]),
        );
        k.add(caja(0.9, 0.5, 0.03, 0.02), '#F4F6F7', [0, 1.05, -0.04], m);
        k.add(caja(0.035, 0.38, 0.02, 0.008), '#0F3D47', [0.12, 1.1, 0.03], m, [0, 0, -0.55]);
        k.add(cilindro(0.05, 0.05, 0.04, 12), '#0F3D47', [0, 0.95, 0.03], m, [Math.PI / 2, 0, 0]);
        break;
      }
      case 'impresora': {
        const m = base.hijo([ancho - 1.0, 0, z.libre], -Math.PI / 2);
        k.add(caja(0.7, 0.42, 0.5, 0.03), '#E4E8EA', [0, 0.21, 0], m);
        k.add(caja(0.66, 0.24, 0.46, 0.04), '#D2D8DB', [0, 0.54, 0], m);
        k.add(caja(0.5, 0.02, 0.3, 0.005), '#FFFFFF', [0, 0.69, 0.22], m, [0.25, 0, 0]);
        k.add(caja(0.48, 0.01, 0.25, 0.002), '#FFFFFF', [0, 0.44, 0.33], m);
        kb.add(caja(0.12, 0.05, 0.005, 0.002), hdr('#6CF0C2', 1.8), [0.2, 0.6, 0.232], m);
        break;
      }
      case 'pantalla_progreso': {
        const m = base.hijo([0.6, 0, z.libre], giro);
        k.add(caja(0.1, 0.9, 0.1, 0.02), '#2B3236', [0, 0.45, -0.05], m);
        k.add(caja(0.6, 0.04, 0.4, 0.02), '#2B3236', [0, 0.02, -0.05], m);
        k.add(caja(1.7, 1.0, 0.06, 0.02), '#1C2326', [0, 1.2, 0], m);
        kb.add(caja(1.6, 0.9, 0.005, 0.002), hdr('#0F3D47', 1.2), [0, 1.2, 0.034], m);
        [0.75, 0.5, 0.9, 0.35].forEach((p, i) =>
          kb.add(
            caja(1.3 * p, 0.09, 0.006, 0.002),
            hdr(i % 2 ? '#00ADA9' : '#F2B33D', 2.2),
            [-0.65 + (1.3 * p) / 2, 1.5 - i * 0.18, 0.04],
            m,
          ),
        );
        break;
      }
      default:
        utileriaComun(k, kb, { ...s, apariencia: { ...s.apariencia, utileria: [u] } }, base);
    }
  }
}
