/**
 * Aleatorio por campo y por entidad (personaje, sala, oficina) y presets sembrados. Todo reproducible
 * con una semilla (`rngSemilla`). El aleatorio NUNCA toca el plano (tamaño/posición/puestos) ni el
 * nombre: solo lo visual.
 */
import {
  ACCESORIOS,
  CALIDADES,
  CALZADOS,
  COLORES_OJOS,
  COLORES_PELO,
  EXPRESIONES,
  FACHADAS,
  ILUMINACION,
  MOBILIARIO,
  PALETAS,
  PALETA_IDS,
  PEINADOS,
  PIELES,
  PISOS,
  type PaletaId,
} from './apariencia';
import {
  ACCENTOS_ACC,
  CAMISAS,
  PANTALONES,
  ZAPATOS,
  aparienciaAleatoria,
  elegir,
  type Rng,
} from './aleatorio';
import type { Campos, Entidad } from './composicion';

export const COLORES_PISO = [
  '#D7DEE0',
  '#E9E2D6',
  '#B98A5E',
  '#C89B6D',
  '#C9CED1',
  '#CFDDEB',
  '#D3E8DD',
  '#EDE2C7',
];
export const COLORES_PARED = ['#F4F8FA', '#FFFFFF', '#EDE7DB', '#DCE6EA', '#CBD5DB', '#F2E3D0'];
export const ACENTOS = [
  '#00ADA9',
  '#2E86DE',
  '#8E6CCF',
  '#E0A526',
  '#D64545',
  '#1F9D6B',
  '#C0703B',
  '#5B8DEF',
];
const redondea = (n: number, paso: number) => Math.round(n / paso) * paso;

/** Un valor aleatorio válido para un campo; undefined si el campo no se randomiza. */
export function campoAleatorio(
  entidad: Entidad,
  campo: string,
  rng: Rng,
  actual: Campos = {},
): unknown {
  if (entidad === 'personaje') {
    const mapa: Record<string, () => unknown> = {
      piel: () => elegir(rng, PIELES),
      peinado: () => elegir(rng, PEINADOS),
      pelo: () => elegir(rng, COLORES_PELO),
      ojos: () => elegir(rng, COLORES_OJOS),
      camisa: () => elegir(rng, CAMISAS),
      pantalon: () => elegir(rng, PANTALONES),
      calzado: () => elegir(rng, CALZADOS),
      colorCalzado: () => elegir(rng, ZAPATOS),
      accesorio: () => {
        const a = elegir(rng, ACCESORIOS);
        return actual['cuerpo'] === 'f' && a === 'corbata' ? 'lentes' : a;
      },
      colorAccesorio: () => elegir(rng, ACCENTOS_ACC),
      expresion: () => elegir(rng, EXPRESIONES),
      altura: () => Math.round((0.94 + rng() * 0.12) * 100) / 100,
    };
    return mapa[campo]?.();
  }
  if (entidad === 'sala') {
    const mapa: Record<string, () => unknown> = {
      piso: () => elegir(rng, PISOS),
      colorPiso: () => elegir(rng, COLORES_PISO),
      colorPared: () => elegir(rng, COLORES_PARED),
      alturaPared: () => redondea(0.4 + rng() * 0.9, 0.1),
      acento: () => elegir(rng, ACENTOS),
      mobiliario: () => elegir(rng, MOBILIARIO),
      iluminacion: () => elegir(rng, ILUMINACION),
    };
    return mapa[campo]?.();
  }
  const mapa: Record<string, () => unknown> = {
    paleta: () => elegir(rng, PALETA_IDS),
    ciclo: () => elegir(rng, ['dia', 'noche', 'auto'] as const),
    hora: () => Math.floor(rng() * 24),
    calidad: () => elegir(rng, CALIDADES),
  };
  return mapa[campo]?.();
}

const CAMPOS_ALEATORIOS: Record<Entidad, string[]> = {
  personaje: [
    'piel',
    'peinado',
    'pelo',
    'ojos',
    'camisa',
    'pantalon',
    'calzado',
    'colorCalzado',
    'accesorio',
    'colorAccesorio',
    'expresion',
    'altura',
  ],
  sala: ['piso', 'colorPiso', 'colorPared', 'alturaPared', 'acento', 'mobiliario', 'iluminacion'],
  oficina: ['paleta'],
};

/** Colores de una paleta de la oficina (campos `paleta`, `colores` y `fachada`). */
export function camposDePaleta(id: PaletaId): Campos {
  const p = PALETAS[id];
  return {
    paleta: id,
    colores: {
      primario: p.primario,
      secundario: p.secundario,
      acento: p.acento,
      fondo: p.fondo,
      piso: p.piso,
    },
    fachada: { estilo: 'vidrio', color: p.primario },
  };
}

/** Apariencia aleatoria completa de una entidad (solo lo visual; respeta cuerpo y nombre). */
export function entidadAleatoria(entidad: Entidad, rng: Rng, actual: Campos = {}): Campos {
  if (entidad === 'personaje') {
    const r: Campos = { ...aparienciaAleatoria(rng, (actual['cuerpo'] as 'f' | 'm') ?? 'f') };
    delete r['cuerpo'];
    delete r['nombre'];
    return r;
  }
  if (entidad === 'oficina') {
    const base = camposDePaleta(elegir(rng, PALETA_IDS));
    return {
      ...base,
      fachada: {
        estilo: elegir(rng, FACHADAS),
        color: (base['fachada'] as { color: string }).color,
      },
    };
  }
  const r: Campos = {};
  for (const c of CAMPOS_ALEATORIOS[entidad]) r[c] = campoAleatorio(entidad, c, rng, actual);
  const acento = r['acento'] as string;
  r['rotulo'] = {
    texto: (actual['rotulo'] as { texto?: string } | undefined)?.texto ?? 'Sala',
    color: acento,
  };
  return r;
}

export interface PresetBase {
  tipo: Entidad;
  nombre: string;
  json: Campos;
}

/** Presets sembrados (builtin): ropa de equipo, estilos de sala y paletas de oficina. */
export const PRESETS_BASE: PresetBase[] = [
  {
    tipo: 'personaje',
    nombre: 'Uniforme de marca',
    json: { camisa: '#00ADA9', pantalon: '#0F3D47', calzado: 'zapatos', colorCalzado: '#2A2A2A' },
  },
  {
    tipo: 'personaje',
    nombre: 'Casual',
    json: { camisa: '#E07A5F', pantalon: '#3D4C63', calzado: 'tenis', colorCalzado: '#F4F8FA' },
  },
  {
    tipo: 'personaje',
    nombre: 'Formal',
    json: { camisa: '#F4F8FA', pantalon: '#22313F', calzado: 'zapatos', colorCalzado: '#1E1E1E' },
  },
  {
    tipo: 'sala',
    nombre: 'Madera cálida',
    json: { piso: 'madera', colorPiso: '#B98A5E', colorPared: '#F2E3D0', iluminacion: 'calida' },
  },
  {
    tipo: 'sala',
    nombre: 'Moderna fría',
    json: { piso: 'cuadros', colorPiso: '#CFDDEB', colorPared: '#F4F8FA', iluminacion: 'fria' },
  },
  {
    tipo: 'sala',
    nombre: 'Concreto industrial',
    json: {
      piso: 'concreto',
      colorPiso: '#C9CED1',
      colorPared: '#CBD5DB',
      alturaPared: 0.9,
      iluminacion: 'neutra',
    },
  },
  ...PALETA_IDS.map((id): PresetBase => ({
    tipo: 'oficina',
    nombre: `Paleta ${PALETAS[id].nombre}`,
    json: camposDePaleta(id),
  })),
];
