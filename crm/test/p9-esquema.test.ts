import { describe, expect, it } from 'vitest';
import {
  PALETAS,
  aparienciaOficina,
  aparienciaPersonaje,
  contraste,
  defaultOficina,
  defaultPersonaje,
  esNoche,
  textoLegible,
} from '../src/shared/oficina3d/apariencia';
import { equipoAleatorio, generosEquipo, rngSemilla } from '../src/shared/oficina3d/aleatorio';
import {
  PRESETS_BASE,
  campoAleatorio,
  entidadAleatoria,
} from '../src/shared/oficina3d/aleatorio-lugares';
import {
  ErrorComposicion,
  clave,
  componerDefinicion,
  validarCampos,
} from '../src/shared/oficina3d/composicion';
import { definicionOficina } from '../src/shared/oficina3d/definicion';
import { definicionMinima } from '../src/shared/oficina3d/minima';
import { validarPlano } from '../src/shared/oficina3d/plano';
import { definicionProspeccion } from '../src/shared/oficina3d/prospeccion';

const roster = [
  { id: 'Coordinador', persona: 'Michael', genero: 'm', rol: 'x', area: 'Dirección' },
  { id: 'Cartografo', persona: 'Camila', genero: 'f', rol: 'x', area: 'Descubrimiento' },
  { id: 'Explorador', persona: 'Mateo', genero: 'm', rol: 'x', area: 'Descubrimiento' },
];
const base = () => definicionProspeccion(roster);

describe('P9 esquema de apariencia', () => {
  it('los defaults son válidos y el esquema de oficina acepta JSON antiguo (sin campos nuevos)', () => {
    expect(aparienciaPersonaje.safeParse(defaultPersonaje('f')).success).toBe(true);
    const viejo = {
      paleta: 'acitmx',
      colores: PALETAS.acitmx,
      ciclo: 'dia',
      hora: 11,
      calidad: 'alta',
    };
    const r = aparienciaOficina.parse({ ...viejo, colores: { ...defaultOficina().colores } });
    expect(r.marca).toBe('');
    expect(r.logo).toBe('base');
    expect(r.planta).toBeNull();
    expect(r.fachada.estilo).toBe('vidrio');
  });

  it('catálogo: 9 tonos de piel, 6 peinados y 5 paletas + personalizada', () => {
    expect(PRESETS_BASE.filter((p) => p.tipo === 'oficina')).toHaveLength(5);
    expect(
      aparienciaOficina.safeParse({ ...defaultOficina(), paleta: 'personalizada' }).success,
    ).toBe(true);
    expect(aparienciaPersonaje.safeParse({ ...defaultPersonaje('m'), altura: 1.2 }).success).toBe(
      false,
    );
  });

  it('esNoche respeta ciclo, hora fija y reloj', () => {
    expect(esNoche({ ciclo: 'noche', hora: 11 }, 12)).toBe(true);
    expect(esNoche({ ciclo: 'dia', hora: 23 }, 23)).toBe(false);
    expect(esNoche({ ciclo: 'hora', hora: 22 }, 10)).toBe(true);
    expect(esNoche({ ciclo: 'auto', hora: 0 }, 10)).toBe(false);
    expect(esNoche({ ciclo: 'auto', hora: 0 }, 20)).toBe(true);
  });

  it('el texto de rótulos conserva contraste AA con colores extremos', () => {
    for (const f of ['#000000', '#FFFFFF', '#FFFF00', '#0000FF', '#7F7F7F', '#00ADA9', '#FF00FF']) {
      const t = textoLegible(f);
      expect(contraste(f, t)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('P9 aleatorio con semilla y paridad', () => {
  it('misma semilla, mismo resultado; semillas distintas, distinto', () => {
    const a = equipoAleatorio(12, rngSemilla(7));
    const b = equipoAleatorio(12, rngSemilla(7));
    const c = equipoAleatorio(12, rngSemilla(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    a.forEach((x) => expect(aparienciaPersonaje.safeParse(x).success).toBe(true));
  });

  it('paridad 50/50 exacta con n par y diferencia ≤ 1 con n impar, en 50 semillas', () => {
    for (let s = 1; s <= 50; s++) {
      const par = generosEquipo(12, rngSemilla(s));
      expect(par.filter((g) => g === 'f')).toHaveLength(6);
      const imp = generosEquipo(7, rngSemilla(s));
      expect(
        Math.abs(imp.filter((g) => g === 'f').length - imp.filter((g) => g === 'm').length),
      ).toBe(1);
    }
  });

  it('aleatorio por campo y por entidad produce campos válidos', () => {
    const rng = rngSemilla(3);
    for (const ent of ['personaje', 'sala', 'oficina'] as const) {
      const r = entidadAleatoria(ent, rng, { cuerpo: 'f', rotulo: { texto: 'X' } });
      expect(validarCampos(ent, r).errores).toEqual([]);
    }
    expect(campoAleatorio('personaje', 'nombre', rng)).toBeUndefined();
    expect(typeof campoAleatorio('personaje', 'camisa', rng)).toBe('string');
    for (const p of PRESETS_BASE) expect(validarCampos(p.tipo, p.json).errores).toEqual([]);
  });
});

describe('P9 composición (default + preset + overrides)', () => {
  it('aplica capas en orden y descarta lo inválido conservando lo válido', () => {
    const b = base();
    const { def, descartes } = componerDefinicion(b, {
      [clave('personaje', 'Cartografo')]: {
        preset: { camisa: '#112233', pantalon: '#445566' },
        overrides: { camisa: '#AABBCC', peinado: 'inexistente', altura: 1.05, nombre: 'Cami' },
      },
    });
    const a = def.agentes.find((x) => x.id === 'Cartografo')!;
    expect(a.apariencia.camisa).toBe('#AABBCC');
    expect(a.apariencia.pantalon).toBe('#445566');
    expect(a.apariencia.altura).toBe(1.05);
    expect(a.persona).toBe('Cami');
    expect(a.apariencia.peinado).toBe(
      b.agentes.find((x) => x.id === 'Cartografo')!.apariencia.peinado,
    );
    expect(descartes.some((m) => m.includes('peinado'))).toBe(true);
    // la base no se muta
    expect(b.agentes[1]!.apariencia.camisa).not.toBe('#AABBCC');
  });

  it('modo estricto lanza ante un campo inválido o desconocido', () => {
    const b = base();
    expect(() =>
      componerDefinicion(
        b,
        { [clave('sala', 'direccion')]: { overrides: { colorPiso: 'rojo' } } },
        true,
      ),
    ).toThrow(ErrorComposicion);
    expect(() =>
      componerDefinicion(b, { [clave('oficina', 'prospeccion')]: { overrides: { zzz: 1 } } }, true),
    ).toThrow(/desconocido/);
  });

  it('oficina: paleta, marca, logo y fachada se reflejan; la definición sigue siendo válida', () => {
    const { def } = componerDefinicion(base(), {
      [clave('oficina', 'prospeccion')]: {
        overrides: {
          paleta: 'oscuro',
          colores: PALETAS.oscuro,
          marca: 'Mi Marca',
          logo: 'ninguno',
          fachada: { estilo: 'ladrillo', color: '#AA5533' },
        },
      },
    });
    expect(def.office.apariencia.marca).toBe('Mi Marca');
    expect(def.office.apariencia.colores.fondo).toBe(PALETAS.oscuro.fondo);
    expect(def.office.logo).toBeNull();
    expect(definicionOficina.safeParse(def).success).toBe(true);
  });

  it('el género cambia el cuerpo base del personaje', () => {
    const { def } = componerDefinicion(base(), {
      [clave('personaje', 'Cartografo')]: { overrides: { cuerpo: 'm' } },
    });
    expect(def.agentes.find((a) => a.id === 'Cartografo')!.genero).toBe('m');
  });
});

describe('P9 plano: tamaño, puestos, traslapes y pasillos', () => {
  it('la planta de prospección y la mínima son válidas', () => {
    expect(validarPlano(base()).errores).toEqual([]);
    expect(validarPlano(definicionMinima({ id: 'otro', nombre: 'Otro' })).errores).toEqual([]);
  });

  it('redimensionar una sala válida se acepta; traslapar o bloquear el pasillo se descarta', () => {
    const b = base();
    const ok = componerDefinicion(b, {
      [clave('sala', 'direccion')]: { overrides: { ancho: 6, fondo: 7 } },
    });
    expect(ok.descartes).toEqual([]);
    expect(ok.def.salas.find((s) => s.id === 'direccion')!.apariencia.ancho).toBe(6);

    const traslape = componerDefinicion(b, {
      [clave('sala', 'direccion')]: { overrides: { ancho: 9 } },
    });
    expect(traslape.descartes.join()).toMatch(/traslapan/);
    expect(traslape.def.salas.find((s) => s.id === 'direccion')!.apariencia.ancho).toBe(7);

    const pasillo = componerDefinicion(b, {
      [clave('sala', 'direccion')]: { overrides: { fondo: 11 } },
    });
    expect(pasillo.descartes.join()).toMatch(/pasillo|traslapan/);
    expect(pasillo.def.salas.find((s) => s.id === 'direccion')!.apariencia.fondo).toBe(8);
  });

  it('mover una sala fuera de la planta se rechaza en modo estricto', () => {
    expect(() =>
      componerDefinicion(base(), { [clave('sala', 'cafeteria')]: { overrides: { x: 40 } } }, true),
    ).toThrow(/planta/);
  });

  it('puestos: cambia la cantidad y la distribución; no baja de los ocupados y respeta la capacidad', () => {
    const b = base();
    const r = componerDefinicion(b, {
      [clave('sala', 'descubrimiento')]: {
        overrides: { puestos: { cantidad: 4, distribucion: 'doble_fila' } },
      },
    });
    expect(r.descartes).toEqual([]);
    const ps = r.def.puestos.filter((p) => p.sala === 'descubrimiento');
    expect(ps).toHaveLength(4);
    expect(new Set(ps.map((p) => p.z)).size).toBe(2);
    // los puestos ocupados conservan su id
    expect(ps.map((p) => p.id)).toEqual(expect.arrayContaining(['des-1', 'des-2']));
    const poco = componerDefinicion(b, {
      [clave('sala', 'descubrimiento')]: {
        overrides: { puestos: { cantidad: 1, distribucion: 'fila' } },
      },
    });
    expect(poco.descartes.join()).toMatch(/no caben/);
    const mucho = componerDefinicion(b, {
      [clave('sala', 'descubrimiento')]: {
        overrides: { puestos: { cantidad: 12, distribucion: 'fila' } },
      },
    });
    expect(mucho.descartes.join()).toMatch(/no caben/);
  });

  it('planta: crecer se acepta; encoger por debajo de las salas se rechaza', () => {
    const b = base();
    const g = componerDefinicion(b, {
      [clave('oficina', 'prospeccion')]: { overrides: { planta: { ancho: 40, fondo: 22 } } },
    });
    expect(g.def.planta.ancho).toBe(40);
    const c = componerDefinicion(b, {
      [clave('oficina', 'prospeccion')]: { overrides: { planta: { ancho: 20, fondo: 19 } } },
    });
    expect(c.descartes.join()).toMatch(/planta/);
    expect(c.def.planta.ancho).toBe(36);
  });
});
