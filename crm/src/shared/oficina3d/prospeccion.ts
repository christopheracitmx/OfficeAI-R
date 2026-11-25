/**
 * Primera definición 3D: la oficina de prospección de ACITMX. Se arma a partir del roster que expone
 * /api/agentes (persona, género, rol, área); la planta, las salas y la apariencia son datos.
 */
import {
  PIELES,
  defaultOficina,
  defaultSala,
  type AparienciaSala,
  type Genero,
} from './apariencia';
import {
  aparienciaAleatoria,
  aplicarPreset,
  componerPersonaje,
  rngSemilla,
  semillaDe,
} from './aleatorio';
import {
  definicionOficina,
  type DefinicionOficina,
  type PuestoDef,
  type SalaDef,
} from './definicion';

export interface AgenteRoster {
  id: string;
  persona: string;
  genero: string;
  rol: string;
  area: string;
}

/** Etiqueta del rol por género y tarea corta (para rótulos y lista accesible). */
export const ROLES: Record<string, { f: string; m: string; tarea: string; puesto: string }> = {
  Coordinador: {
    f: 'Coordinadora',
    m: 'Coordinador',
    tarea: 'Coordina la oficina',
    puesto: 'dir-1',
  },
  Cartografo: { f: 'Cartógrafa', m: 'Cartógrafo', tarea: 'Descubre empresas', puesto: 'des-1' },
  Explorador: { f: 'Exploradora', m: 'Explorador', tarea: 'Busca por nichos', puesto: 'des-2' },
  Guardian: { f: 'Guardiana', m: 'Guardián', tarea: 'Filtra y deduplica', puesto: 'inv-1' },
  Rastreador: { f: 'Rastreadora', m: 'Rastreador', tarea: 'Busca contactos', puesto: 'inv-2' },
  Analista: { f: 'Analista', m: 'Analista', tarea: 'Analiza la empresa', puesto: 'inv-3' },
  Estratega: { f: 'Estratega', m: 'Estratega', tarea: 'Elige productos', puesto: 'est-1' },
  Armador: { f: 'Armadora', m: 'Armador', tarea: 'Arma paquetes', puesto: 'est-2' },
  'QA-1': { f: 'QA-1', m: 'QA-1', tarea: 'Revisa la propuesta', puesto: 'cal-1' },
  'QA-2': { f: 'QA-2', m: 'QA-2', tarea: 'Revisión final', puesto: 'cal-2' },
  Calificador: { f: 'Calificadora', m: 'Calificador', tarea: 'Da el score', puesto: 'rep-1' },
  Redactor: { f: 'Redactora', m: 'Redactor', tarea: 'Escribe el reporte', puesto: 'rep-2' },
};

/** Orden del expediente en el flujo de prospección. */
export const FLUJO_PROSPECCION = [
  'Cartografo',
  'Explorador',
  'Guardian',
  'Rastreador',
  'Analista',
  'Estratega',
  'Armador',
  'QA-1',
  'Calificador',
  'Redactor',
  'QA-2',
  'Coordinador',
];

export const ACENTOS_AREA: Record<string, string> = {
  Dirección: '#0F3D47',
  Descubrimiento: '#2E86DE',
  Investigación: '#8E6CCF',
  Estrategia: '#E0A526',
  Calidad: '#D64545',
  Reporte: '#1F9D6B',
};

function sala(
  id: string,
  nombre: string,
  tipo: SalaDef['tipo'],
  x: number,
  z: number,
  ancho: number,
  extra: Partial<AparienciaSala> & { puerta?: number; accion?: SalaDef['accion'] },
): SalaDef {
  const norte = z === 0;
  const { puerta, accion, ...ap } = extra;
  return {
    id,
    nombre,
    tipo,
    x,
    z,
    puerta: { lado: norte ? 's' : 'n', pos: puerta ?? ancho / 2 },
    accion: accion ?? null,
    apariencia: {
      ...defaultSala(nombre, ancho, 8),
      ...ap,
      rotulo: { texto: nombre, color: ap.acento ?? '#00ADA9' },
    },
  };
}

const SALAS: SalaDef[] = [
  sala('direccion', 'Dirección', 'direccion', 0, 0, 7, {
    acento: ACENTOS_AREA['Dirección'],
    piso: 'madera',
    colorPiso: '#B98A5E',
    mobiliario: 'mini_oficina',
    utileria: ['mesa_juntas', 'pantalla_progreso', 'plantas', 'alfombra'],
  }),
  sala('descubrimiento', 'Descubrimiento', 'area', 7, 0, 7, {
    acento: ACENTOS_AREA['Descubrimiento'],
    colorPiso: '#CFDDEB',
    utileria: ['mapa', 'plantas'],
  }),
  sala('investigacion', 'Investigación', 'area', 14, 0, 9, {
    acento: ACENTOS_AREA['Investigación'],
    colorPiso: '#DCD5EA',
    utileria: ['pared_monitores', 'plantas'],
  }),
  sala('estrategia', 'Estrategia', 'area', 23, 0, 7, {
    acento: ACENTOS_AREA['Estrategia'],
    colorPiso: '#EDE2C7',
    utileria: ['mesa_maquetas', 'plantas'],
  }),
  sala('biblioteca', 'Biblioteca', 'biblioteca', 30, 0, 6, {
    acento: '#7A4B2E',
    piso: 'madera',
    colorPiso: '#A9774B',
    mobiliario: 'abierto',
    utileria: ['estantes', 'sofa', 'plantas'],
    accion: 'biblioteca',
  }),
  sala('recepcion', 'Recepción', 'recepcion', 0, 11, 7, {
    acento: '#00ADA9',
    piso: 'cuadros',
    colorPiso: '#E9E2D6',
    mobiliario: 'abierto',
    utileria: ['mostrador', 'sofa', 'plantas'],
  }),
  sala('calidad', 'Calidad', 'area', 7, 11, 7, {
    acento: ACENTOS_AREA['Calidad'],
    colorPiso: '#EDD5D5',
    utileria: ['sellos', 'plantas'],
  }),
  sala('reporte', 'Reporte', 'area', 14, 11, 8, {
    acento: ACENTOS_AREA['Reporte'],
    colorPiso: '#D3E8DD',
    utileria: ['medidor', 'impresora', 'plantas'],
  }),
  sala('aprendizaje', 'Aprendizaje', 'aprendizaje', 22, 11, 6, {
    acento: '#5B8DEF',
    piso: 'concreto',
    colorPiso: '#C9CED1',
    mobiliario: 'abierto',
    utileria: ['pizarron', 'buzon'],
    accion: 'aprendizaje',
  }),
  sala('cafeteria', 'Cafetería', 'cafeteria', 28, 11, 8, {
    acento: '#C0703B',
    piso: 'madera',
    colorPiso: '#C89B6D',
    mobiliario: 'abierto',
    utileria: ['barra_cafe', 'sofa', 'plantas'],
  }),
];

const N = (id: string, s: string, x: number): PuestoDef => ({ id, sala: s, x, z: 2.6, rot: 180 });
const S = (id: string, s: string, x: number): PuestoDef => ({ id, sala: s, x, z: 5.4, rot: 180 });
const PUESTOS: PuestoDef[] = [
  N('dir-1', 'direccion', 3.5),
  N('des-1', 'descubrimiento', 2),
  N('des-2', 'descubrimiento', 5),
  N('inv-1', 'investigacion', 1.8),
  N('inv-2', 'investigacion', 4.5),
  N('inv-3', 'investigacion', 7.2),
  N('est-1', 'estrategia', 2),
  N('est-2', 'estrategia', 5),
  S('cal-1', 'calidad', 2),
  S('cal-2', 'calidad', 5),
  S('rep-1', 'reporte', 2.3),
  S('rep-2', 'reporte', 5.7),
];

/** Toques de carácter fijos (el resto sale del aleatorio con semilla del nombre). */
const TOQUES: Record<string, Partial<ReturnType<typeof aparienciaAleatoria>>> = {
  Michael: { accesorio: 'corbata', peinado: 'corto', expresion: 'feliz' },
  Camila: { accesorio: 'lentes', peinado: 'largo' },
  Mateo: { accesorio: 'gorra' },
  Gabriela: { peinado: 'chongo' },
  Rodrigo: { accesorio: 'audifonos', peinado: 'rizado' },
  Ana: { accesorio: 'lentes', peinado: 'coleta' },
  Esteban: { peinado: 'calvo', accesorio: 'ninguno' },
  Alejandra: { peinado: 'rizado' },
  Iván: { accesorio: 'lentes' },
  Valeria: { peinado: 'largo', accesorio: 'audifonos' },
  Carla: { peinado: 'corto' },
  Hugo: { accesorio: 'ninguno', peinado: 'largo' },
};

export function definicionProspeccion(roster: AgenteRoster[]): DefinicionOficina {
  const agentes = roster
    .filter((a) => ROLES[a.id])
    .map((a, i) => {
      const r = ROLES[a.id]!;
      const genero: Genero = a.genero === 'f' ? 'f' : 'm';
      const rng = rngSemilla(semillaDe(a.persona));
      const base = aplicarPreset(
        aparienciaAleatoria(rng, genero),
        'uniforme',
        i,
        ACENTOS_AREA[a.area],
      );
      return {
        id: a.id,
        persona: a.persona,
        genero,
        rol: r[genero],
        tarea: r.tarea,
        area: a.area,
        puesto: r.puesto,
        apariencia: componerPersonaje(
          genero,
          base,
          { piel: PIELES[(i * 4) % PIELES.length] },
          TOQUES[a.persona],
        ),
      };
    });
  const ids = new Set(agentes.map((a) => a.id));
  return definicionOficina.parse({
    version: 1,
    office: {
      id: 'prospeccion',
      nombre: 'Oficina de Prospección ACITMX',
      logo: '/logo-acit.png',
      piso: 1,
      apariencia: defaultOficina('acitmx'),
    },
    planta: { ancho: 36, fondo: 19, pasilloZ: 9.5 },
    salas: SALAS,
    puestos: PUESTOS,
    agentes,
    flujo: FLUJO_PROSPECCION.filter((f) => ids.has(f)),
  });
}
