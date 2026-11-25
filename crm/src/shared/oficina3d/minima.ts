/**
 * Planta mínima válida para un piso sin definición 3D: recepción + 1 sala de trabajo con dos puestos
 * vacíos. Se genera con el mismo esquema zod que las demás oficinas (sin personajes).
 */
import { PALETA_IDS, defaultOficina, defaultSala, type PaletaId } from './apariencia';
import { definicionOficina, type DefinicionOficina } from './definicion';
import { semillaDe } from './aleatorio';

export interface OpcionesMinima {
  id: string;
  nombre: string;
  piso?: number;
  paleta?: PaletaId;
}

/** Paleta estable a partir del id, para que cada piso tenga su color. */
export function paletaDe(id: string): PaletaId {
  return PALETA_IDS[semillaDe(id) % PALETA_IDS.length]!;
}

export function definicionMinima(o: OpcionesMinima): DefinicionOficina {
  const ap = defaultOficina(o.paleta ?? paletaDe(o.id));
  const acento = ap.colores.secundario;
  return definicionOficina.parse({
    version: 1,
    office: { id: o.id, nombre: o.nombre, logo: null, piso: o.piso ?? 1, apariencia: ap },
    planta: { ancho: 16, fondo: 10, pasilloZ: 9 },
    salas: [
      {
        id: 'recepcion',
        nombre: 'Recepción',
        tipo: 'recepcion',
        x: 0,
        z: 0,
        puerta: { lado: 's', pos: 3.5 },
        accion: null,
        apariencia: {
          ...defaultSala('Recepción', 7, 8),
          acento,
          piso: 'cuadros',
          colorPiso: ap.colores.piso,
          mobiliario: 'abierto',
          utileria: ['mostrador', 'sofa', 'plantas'],
          rotulo: { texto: 'Recepción', color: acento },
        },
      },
      {
        id: 'trabajo',
        nombre: 'Sala de trabajo',
        tipo: 'area',
        x: 7,
        z: 0,
        puerta: { lado: 's', pos: 4 },
        accion: null,
        apariencia: {
          ...defaultSala('Sala de trabajo', 8, 8),
          acento,
          colorPiso: ap.colores.piso,
          utileria: ['plantas'],
          rotulo: { texto: 'Sala de trabajo', color: acento },
        },
      },
    ],
    puestos: [
      { id: 'trabajo-1', sala: 'trabajo', x: 2, z: 2.6, rot: 180 },
      { id: 'trabajo-2', sala: 'trabajo', x: 5.5, z: 2.6, rot: 180 },
    ],
    agentes: [],
    flujo: [],
  });
}
