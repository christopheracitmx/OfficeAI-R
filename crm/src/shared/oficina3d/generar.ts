/**
 * Generador de la planta 3D de un piso nuevo a partir de la lista de agentes (lo usa el Constructor
 * y las plantillas de la galería). Determinista por semilla, sin traslapes: recepción + una sala por
 * área + biblioteca, en una sola fila con pasillo debajo. Equipo con paridad 50/50 por defecto.
 */
import { semillaDe, rngSemilla, aparienciaAleatoria, generosEquipo } from './aleatorio';
import { PALETA_IDS, defaultOficina, defaultSala, type Genero, type PaletaId } from './apariencia';
import {
  definicionOficina,
  type DefinicionOficina,
  type PuestoDef,
  type SalaDef,
} from './definicion';
import { paletaDe } from './minima';
import { capacidadPuestos, distribuirPuestos, type Distribucion } from './plano';

export const NOMBRES_F = [
  'Camila',
  'Valeria',
  'Sofía',
  'Mariana',
  'Daniela',
  'Renata',
  'Paula',
  'Lucía',
  'Fernanda',
  'Regina',
  'Ximena',
  'Natalia',
];
export const NOMBRES_M = [
  'Mateo',
  'Diego',
  'Santiago',
  'Emilio',
  'Rodrigo',
  'Andrés',
  'Julián',
  'Tomás',
  'Sebastián',
  'Leonardo',
  'Gael',
  'Iván',
];

export interface AgenteGen {
  id: string;
  persona?: string | undefined;
  genero?: Genero | undefined;
  rol: string;
  area: string;
  tarea: string;
}

export interface AgenteResuelto {
  id: string;
  persona: string;
  genero: Genero;
  rol: string;
  area: string;
  tarea: string;
}

/** Asigna género (paridad 50/50 entre los que no lo traen) y nombre propio sin repetir. */
export function resolverEquipo(agentes: readonly AgenteGen[], semilla: string): AgenteResuelto[] {
  const rng = rngSemilla(semillaDe(semilla));
  const libres = agentes.filter((a) => !a.genero).length;
  const f0 = agentes.filter((a) => a.genero === 'f').length;
  // Los que no traen género equilibran el total: se completa primero el lado con menos gente.
  const objetivoF = Math.round(agentes.length / 2);
  const nuevasF = Math.max(0, Math.min(libres, objetivoF - f0));
  const sorteo = generosEquipo(libres, rng, libres === 0 ? 0.5 : nuevasF / libres);
  const usados = new Set(agentes.map((a) => a.persona).filter((x): x is string => Boolean(x)));
  const pool = (g: Genero) => (g === 'f' ? NOMBRES_F : NOMBRES_M);
  let i = 0;
  return agentes.map((a) => {
    const genero: Genero = a.genero ?? sorteo[i++] ?? 'f';
    let persona = a.persona?.trim();
    if (!persona) {
      const disponibles = pool(genero).filter((n) => !usados.has(n));
      persona =
        disponibles[Math.floor(rng() * disponibles.length)] ??
        `${pool(genero)[0]!} ${usados.size + 1}`;
    }
    usados.add(persona);
    return { id: a.id, persona, genero, rol: a.rol, area: a.area, tarea: a.tarea };
  });
}

const slug = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'area';

const FONDO_SALA = 8;
const ANCHO_MAX_PLANTA = 80;

function anchoPara(n: number, dist: Distribucion): number {
  for (let a = 8; a <= 24; a += 1) if (capacidadPuestos(a, FONDO_SALA, dist) >= n) return a;
  return 24;
}

export interface OpcionesGen {
  id: string;
  nombre: string;
  piso?: number;
  paleta?: PaletaId;
}

/** Planta válida para el equipo dado. Lanza Error si no cabe (demasiadas áreas o puestos). */
export function generarDefinicion(
  o: OpcionesGen,
  equipo: readonly AgenteResuelto[],
): DefinicionOficina {
  const ap = defaultOficina(o.paleta ?? paletaDe(o.id));
  const acentos = [ap.colores.primario, ap.colores.secundario, ap.colores.acento];
  const rng = rngSemilla(semillaDe(`${o.id}-apariencias`));
  const areas = [...new Set(equipo.map((a) => a.area || 'Trabajo'))];
  const salas: SalaDef[] = [];
  const puestos: PuestoDef[] = [];
  const asignado = new Map<string, string>();
  let x = 0;

  const agregar = (s: SalaDef): void => {
    salas.push(s);
    x += s.apariencia.ancho;
  };
  const base = (texto: string, ancho: number, acento: string) => ({
    ...defaultSala(texto, ancho, FONDO_SALA),
    acento,
    colorPiso: ap.colores.piso,
    rotulo: { texto: texto.slice(0, 40), color: acento },
  });

  agregar({
    id: 'recepcion',
    nombre: 'Recepción',
    tipo: 'recepcion',
    x,
    z: 0,
    puerta: { lado: 's', pos: 3.5 },
    accion: null,
    apariencia: {
      ...base('Recepción', 7, ap.colores.secundario),
      piso: 'cuadros',
      mobiliario: 'abierto',
      utileria: ['mostrador', 'sofa', 'plantas'],
    },
  });

  areas.forEach((area, k) => {
    const gente = equipo.filter((a) => (a.area || 'Trabajo') === area);
    const dist: Distribucion = gente.length <= 4 ? 'fila' : 'doble_fila';
    const ancho = anchoPara(gente.length, dist);
    const id = `area-${slug(area)}-${k + 1}`;
    const sala: SalaDef = {
      id,
      nombre: area,
      tipo: 'area',
      x,
      z: 0,
      puerta: { lado: 's', pos: Math.round((ancho / 2) * 2) / 2 },
      accion: null,
      apariencia: {
        ...base(area, ancho, acentos[k % acentos.length]!),
        utileria: ['plantas', k % 2 === 0 ? 'pizarron' : 'estantes'],
      },
    };
    const nuevos = distribuirPuestos(sala, [], new Set(), {
      cantidad: gente.length,
      distribucion: dist,
    });
    if (!nuevos) throw new Error(`No caben ${gente.length} puestos en el área «${area}»`);
    nuevos.forEach((p, idx) => asignado.set(gente[idx]!.id, p.id));
    puestos.push(...nuevos);
    agregar(sala);
  });

  agregar({
    id: 'biblioteca',
    nombre: 'Biblioteca',
    tipo: 'biblioteca',
    x,
    z: 0,
    puerta: { lado: 's', pos: 3 },
    accion: 'biblioteca',
    apariencia: {
      ...base('Biblioteca', 6, '#7A4B2E'),
      piso: 'madera',
      colorPiso: '#A9774B',
      mobiliario: 'abierto',
      utileria: ['estantes', 'sofa', 'plantas'],
    },
  });

  if (x > ANCHO_MAX_PLANTA)
    throw new Error('La planta no cabe: demasiadas áreas o agentes; reduce las áreas del equipo');

  return definicionOficina.parse({
    version: 1,
    office: {
      id: o.id,
      nombre: o.nombre,
      logo: null,
      piso: o.piso ?? 1,
      apariencia: ap,
    },
    planta: { ancho: Math.max(16, x), fondo: 10, pasilloZ: 9 },
    salas,
    puestos,
    agentes: equipo.map((a) => ({
      id: a.id,
      persona: a.persona,
      genero: a.genero,
      rol: a.rol.slice(0, 40),
      tarea: a.tarea.slice(0, 80),
      area: (a.area || 'Trabajo').slice(0, 40),
      puesto: asignado.get(a.id)!,
      apariencia: { ...aparienciaAleatoria(rng, a.genero), nombre: a.persona },
    })),
    flujo: equipo.map((a) => a.id),
  });
}

export { PALETA_IDS };
