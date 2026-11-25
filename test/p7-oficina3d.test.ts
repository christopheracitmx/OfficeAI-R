import { describe, expect, it } from 'vitest';
import {
  aparienciaPersonaje,
  contraste,
  defaultOficina,
  defaultPersonaje,
  PALETA_IDS,
  textoLegible,
} from '../src/shared/oficina3d/apariencia';
import {
  aparienciaAleatoria,
  aplicarPreset,
  componerPersonaje,
  equipoAleatorio,
  generosEquipo,
  rngSemilla,
} from '../src/shared/oficina3d/aleatorio';
import { definicionOficina, rutaEntre } from '../src/shared/oficina3d/definicion';
import { definicionProspeccion, type AgenteRoster } from '../src/shared/oficina3d/prospeccion';
import { estadoVisible, interpretarEvento, oficinaEnPausa } from '../src/shared/oficina3d/eventos';

const ROSTER: AgenteRoster[] = [
  ['Coordinador', 'Michael', 'm', 'Dirección'],
  ['Cartografo', 'Camila', 'f', 'Descubrimiento'],
  ['Explorador', 'Mateo', 'm', 'Descubrimiento'],
  ['Guardian', 'Gabriela', 'f', 'Investigación'],
  ['Rastreador', 'Rodrigo', 'm', 'Investigación'],
  ['Analista', 'Ana', 'f', 'Investigación'],
  ['Estratega', 'Esteban', 'm', 'Estrategia'],
  ['Armador', 'Alejandra', 'f', 'Estrategia'],
  ['QA-1', 'Iván', 'm', 'Calidad'],
  ['QA-2', 'Valeria', 'f', 'Calidad'],
  ['Calificador', 'Carla', 'f', 'Reporte'],
  ['Redactor', 'Hugo', 'm', 'Reporte'],
].map(([id, persona, genero, area]) => ({ id, persona, genero, rol: id, area }) as AgenteRoster);

describe('apariencia', () => {
  it('defaults válidos para ambos cuerpos y todas las paletas', () => {
    expect(aparienciaPersonaje.parse(defaultPersonaje('f')).peinado).toBe('largo');
    expect(aparienciaPersonaje.parse(defaultPersonaje('m')).peinado).toBe('corto');
    for (const p of PALETA_IDS) expect(defaultOficina(p).colores.primario).toMatch(/^#/);
  });
  it('rechaza colores y alturas fuera de rango', () => {
    expect(aparienciaPersonaje.safeParse({ ...defaultPersonaje('f'), piel: 'rojo' }).success).toBe(
      false,
    );
    expect(aparienciaPersonaje.safeParse({ ...defaultPersonaje('f'), altura: 1.4 }).success).toBe(
      false,
    );
  });
  it('el texto del rótulo siempre cumple contraste AA (>= 4.5) aun con colores extremos', () => {
    for (const fondo of [
      '#FFFFFF',
      '#000000',
      '#00ADA9',
      '#F2B33D',
      '#D64545',
      '#7F5AF0',
      '#FFFF00',
    ]) {
      expect(contraste(fondo, textoLegible(fondo))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('aleatorio, presets y composición', () => {
  it('es reproducible con la misma semilla', () => {
    expect(aparienciaAleatoria(rngSemilla(7), 'f')).toEqual(
      aparienciaAleatoria(rngSemilla(7), 'f'),
    );
  });
  it('paridad 50/50 exacta con n par y diferencia <= 1 con n impar', () => {
    for (let s = 0; s < 50; s++) {
      const g = generosEquipo(12, rngSemilla(s));
      expect(g.filter((x) => x === 'f')).toHaveLength(6);
      const imp = generosEquipo(7, rngSemilla(s));
      const f = imp.filter((x) => x === 'f').length;
      expect(Math.abs(f - (7 - f))).toBeLessThanOrEqual(1);
    }
    expect(equipoAleatorio(10, rngSemilla(3)).filter((a) => a.cuerpo === 'm')).toHaveLength(5);
  });
  it('los equipos aleatorios siempre validan contra el esquema', () => {
    for (const a of equipoAleatorio(40, rngSemilla(99)))
      expect(aparienciaPersonaje.safeParse(a).success).toBe(true);
  });
  it('presets cambian la ropa y respetan rasgos', () => {
    const a = aparienciaAleatoria(rngSemilla(1), 'm');
    const f = aplicarPreset(a, 'formal', 0);
    expect(f.accesorio).toBe('corbata');
    expect(f.piel).toBe(a.piel);
    expect(f.peinado).toBe(a.peinado);
    expect(aplicarPreset(a, 'uniforme', 0, '#123456').camisa).toBe('#123456');
  });
  it('componer descarta campos inválidos y conserva los válidos', () => {
    const c = componerPersonaje('f', { camisa: '#111111', altura: 3 as number }, { ojos: 'azul' });
    expect(c.camisa).toBe('#111111');
    expect(c.altura).toBe(1);
    expect(c.ojos).toBe(defaultPersonaje('f').ojos);
  });
});

describe('definición de oficina', () => {
  const d = definicionProspeccion(ROSTER);
  it('la oficina de prospección valida y tiene 12 agentes 6/6 con nombres del spec', () => {
    expect(d.agentes).toHaveLength(12);
    expect(
      d.agentes
        .filter((a) => a.genero === 'f')
        .map((a) => a.persona)
        .sort(),
    ).toEqual(['Alejandra', 'Ana', 'Camila', 'Carla', 'Gabriela', 'Valeria']);
    expect(d.agentes.find((a) => a.id === 'Guardian')?.rol).toBe('Guardiana');
    expect(new Set(d.salas.map((s) => s.tipo))).toEqual(
      new Set(['recepcion', 'area', 'direccion', 'biblioteca', 'aprendizaje', 'cafeteria']),
    );
    expect(d.salas.find((s) => s.id === 'biblioteca')?.accion).toBe('biblioteca');
  });
  it('detecta traslapes, puestos fuera de sala y puestos inexistentes', () => {
    const malo = structuredClone(d);
    malo.salas[1]!.x = 3;
    expect(definicionOficina.safeParse(malo).success).toBe(false);
    const malo2 = structuredClone(d);
    malo2.puestos[0]!.x = 50;
    expect(definicionOficina.safeParse(malo2).success).toBe(false);
    const malo3 = structuredClone(d);
    malo3.agentes[0]!.puesto = 'nada';
    expect(definicionOficina.safeParse(malo3).success).toBe(false);
  });
  it('la ruta entre áreas pasa por las puertas y el pasillo', () => {
    const r = rutaEntre(d, 'des-1', 'cal-1');
    expect(r.length).toBe(8);
    expect(r[3]![1]).toBe(d.planta.pasilloZ);
    expect(rutaEntre(d, 'des-1', 'des-2')).toHaveLength(2);
  });
  it('ignora agentes del roster sin rol conocido (otras oficinas)', () => {
    const otro = definicionProspeccion([
      ...ROSTER,
      { id: 'X', persona: 'X', genero: 'm', rol: 'X', area: 'Y' },
    ]);
    expect(otro.agentes).toHaveLength(12);
  });
});

describe('evento -> animación', () => {
  const flujo = definicionProspeccion(ROSTER).flujo;
  const ev = (agente: string, accion: string, detalle: string | null = null) => ({
    id: 1,
    agente,
    accion,
    detalle,
  });
  it('tarea y herramientas ponen al agente a trabajar con burbuja', () => {
    const i = interpretarEvento(ev('Rastreador', 'leyó una página'), flujo);
    expect(i.estado).toBe('trabajando');
    expect(i.burbuja).toBe('Leyendo una página');
    expect(i.traslado).toBeNull();
  });
  it('terminar o aprobar entrega el expediente al siguiente puesto', () => {
    expect(interpretarEvento(ev('Analista', 'terminó su tarea', 'ok'), flujo).traslado).toEqual({
      de: 'Analista',
      a: 'Estratega',
      tipo: 'entrega',
    });
    expect(interpretarEvento(ev('QA-2', 'QA2 aprobó'), flujo).traslado?.a).toBe('Coordinador');
  });
  it('una devolución de QA es alerta y regresa el expediente', () => {
    const i = interpretarEvento(ev('QA-1', 'QA1 devolvió', 'faltan contactos'), flujo);
    expect(i.estado).toBe('alerta');
    expect(i.traslado).toEqual({ de: 'QA-1', a: 'Armador', tipo: 'devolucion' });
  });
  it('las burbujas dicen qué se hizo y a quién pasa el expediente (sin «Tarea terminada»)', () => {
    const t = interpretarEvento(ev('Analista', 'terminó su tarea', 'Ficha guardada'), flujo);
    expect(t.burbuja).toBe('Ficha de la empresa lista → Estratega');
    const n = interpretarEvento(
      ev('Rastreador', 'recibió una tarea', 'empresa_id=3 — Encuentra su sitio web oficial.'),
      flujo,
    );
    expect(n.burbuja).toBe('Nueva tarea · Encuentra su sitio web oficial');
    expect(
      interpretarEvento(ev('Analista', 'terminó su tarea', 'x'), flujo, true).burbuja,
    ).not.toContain('x');
  });
  it('el modo presentación oculta el detalle (datos sensibles)', () => {
    const e = ev('Rastreador', 'guardó contacto', 'ventas@empresa.mx');
    expect(interpretarEvento(e, flujo).burbuja).toContain('ventas@');
    expect(interpretarEvento(e, flujo, true).burbuja).not.toContain('ventas@');
  });
  it('fin de corrida deja inactivo; los estados caducan y la pausa domina', () => {
    expect(interpretarEvento(ev('Coordinador', 'corrida terminada'), flujo).estado).toBe(
      'inactivo',
    );
    const r = { estado: 'alerta' as const, burbuja: '', t: 0 };
    expect(estadoVisible(r, 1000, false)).toBe('alerta');
    expect(estadoVisible(r, 10000, false)).toBe('trabajando');
    expect(estadoVisible(r, 30000, false)).toBe('inactivo');
    expect(estadoVisible(r, 1000, true)).toBe('pausa');
    expect(estadoVisible(r, 1000, true, true)).toBe('caminando');
    expect(oficinaEnPausa(false, { a: r }, 30000)).toBe(true);
    expect(oficinaEnPausa(false, { a: r }, 1000)).toBe(false);
    expect(oficinaEnPausa(true, {}, 0)).toBe(false);
  });
});
