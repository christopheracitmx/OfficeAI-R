import { describe, expect, it } from 'vitest';
import { compartir } from '../src/web/oficina3d/compartir';
import { componerDefinicion, clave } from '../src/shared/oficina3d/composicion';
import { definicionProspeccion } from '../src/shared/oficina3d/prospeccion';

const roster = [
  { id: 'Coordinador', persona: 'Michael', genero: 'm', rol: 'x', area: 'Dirección' },
  { id: 'Cartografo', persona: 'Camila', genero: 'f', rol: 'x', area: 'Descubrimiento' },
];

describe('P9 escena: compartición estructural de la definición', () => {
  it('conserva la identidad de lo que no cambió y renueva solo lo modificado', () => {
    const base = definicionProspeccion(roster);
    const previa = structuredClone(base);
    const { def } = componerDefinicion(previa, {
      [clave('personaje', 'Cartografo')]: { overrides: { camisa: '#123456' } },
    });
    const nueva = structuredClone(def);
    const r = compartir(previa, nueva);
    expect(r.agentes[0]).toBe(previa.agentes[0]); // Michael no cambió
    expect(r.agentes[1]).not.toBe(previa.agentes[1]); // Camila sí
    expect(r.agentes[1]!.apariencia.camisa).toBe('#123456');
    expect(r.salas).toBe(previa.salas);
    expect(compartir(previa, structuredClone(previa))).toBe(previa);
  });
});
