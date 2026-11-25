/**
 * Esquema `apariencia` (Personalizador): TODO lo visual de la oficina 3D es un parámetro validado con
 * zod. La escena se construye solo con estos datos (procedural), así el Personalizador y el
 * Constructor editan JSON y la vista previa se actualiza al instante.
 */
import { z } from 'zod';

export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal #RRGGBB');

// ---- Catálogos (ampliables sin cambiar la escena: cada opción tiene su generador procedural)
export const PIELES = [
  '#FBE3D0',
  '#F2C9A5',
  '#E8B88F',
  '#D9A67A',
  '#C68B5E',
  '#B9805A',
  '#9A6440',
  '#7A4B2E',
  '#5C3620',
] as const;
export const PEINADOS = ['corto', 'largo', 'rizado', 'chongo', 'coleta', 'calvo'] as const;
export const COLORES_PELO = [
  '#1E1712',
  '#3B2416',
  '#6B3E22',
  '#A0652E',
  '#D9A441',
  '#8C8C8C',
  '#B23A2A',
] as const;
export const COLORES_OJOS = ['#2B1B10', '#4A2E1A', '#2F5D3A', '#2E5C8A', '#5A5A5A'] as const;
export const CALZADOS = ['tenis', 'zapatos', 'botas'] as const;
export const ACCESORIOS = ['ninguno', 'lentes', 'gorra', 'audifonos', 'corbata'] as const;
export const EXPRESIONES = ['sonrisa', 'seria', 'feliz'] as const;
export const PISOS = ['madera', 'alfombra', 'concreto', 'cuadros'] as const;
export const MOBILIARIO = ['cubiculos', 'mini_oficina', 'abierto'] as const;
export const UTILERIA = [
  'mapa',
  'pared_monitores',
  'mesa_maquetas',
  'sellos',
  'medidor',
  'impresora',
  'pantalla_progreso',
  'mesa_juntas',
  'estantes',
  'pizarron',
  'buzon',
  'barra_cafe',
  'sofa',
  'plantas',
  'mostrador',
  'alfombra',
] as const;
export const ILUMINACION = ['calida', 'neutra', 'fria'] as const;
export const CALIDADES = ['alta', 'media', 'baja'] as const;
export const CICLOS = ['dia', 'noche', 'auto'] as const;
export const GENEROS = ['f', 'm'] as const;

export type Genero = (typeof GENEROS)[number];
export type Calidad = (typeof CALIDADES)[number];

// ---- Personaje
export const aparienciaPersonaje = z.object({
  cuerpo: z.enum(GENEROS),
  piel: hex,
  peinado: z.enum(PEINADOS),
  pelo: hex,
  ojos: hex,
  camisa: hex,
  pantalon: hex,
  calzado: z.enum(CALZADOS),
  colorCalzado: hex,
  accesorio: z.enum(ACCESORIOS),
  colorAccesorio: hex,
  expresion: z.enum(EXPRESIONES),
  altura: z.number().min(0.9).max(1.1),
});
export type AparienciaPersonaje = z.infer<typeof aparienciaPersonaje>;

// ---- Sala / área
export const aparienciaSala = z.object({
  ancho: z.number().int().min(3).max(24),
  fondo: z.number().int().min(3).max(24),
  piso: z.enum(PISOS),
  colorPiso: hex,
  colorPared: hex,
  alturaPared: z.number().min(0.3).max(2.5),
  acento: hex,
  mobiliario: z.enum(MOBILIARIO),
  utileria: z.array(z.enum(UTILERIA)).max(12),
  iluminacion: z.enum(ILUMINACION),
  rotulo: z.object({ texto: z.string().min(1).max(40), color: hex }),
});
export type AparienciaSala = z.infer<typeof aparienciaSala>;

// ---- Oficina / edificio
export const PALETAS = {
  acitmx: {
    nombre: 'ACITMX Teal',
    primario: '#0F3D47',
    secundario: '#00ADA9',
    acento: '#F2B33D',
    fondo: '#0B2F37',
    piso: '#E9E2D6',
  },
  corporativo: {
    nombre: 'Corporativo azul',
    primario: '#1D3557',
    secundario: '#457B9D',
    acento: '#E63946',
    fondo: '#14213D',
    piso: '#E5E5E5',
  },
  calido: {
    nombre: 'Cálido',
    primario: '#6B3E26',
    secundario: '#E07A5F',
    acento: '#F2CC8F',
    fondo: '#3D2418',
    piso: '#F4E3C3',
  },
  oscuro: {
    nombre: 'Oscuro',
    primario: '#1B1B22',
    secundario: '#7F5AF0',
    acento: '#2CB67D',
    fondo: '#0E0E12',
    piso: '#3A3A44',
  },
  pastel: {
    nombre: 'Pastel',
    primario: '#5E6C84',
    secundario: '#A8DADC',
    acento: '#FFB5A7',
    fondo: '#3E4A61',
    piso: '#FDF6EC',
  },
} as const;
export type PaletaId = keyof typeof PALETAS;
export const PALETA_IDS = Object.keys(PALETAS) as [PaletaId, ...PaletaId[]];

export const aparienciaOficina = z.object({
  paleta: z.enum(PALETA_IDS),
  colores: z.object({
    primario: hex,
    secundario: hex,
    acento: hex,
    fondo: hex,
    piso: hex,
  }),
  ciclo: z.enum(CICLOS),
  hora: z.number().min(0).max(24),
  calidad: z.enum(CALIDADES),
});
export type AparienciaOficina = z.infer<typeof aparienciaOficina>;

// ---- Defaults
export function defaultPersonaje(cuerpo: Genero): AparienciaPersonaje {
  return {
    cuerpo,
    piel: '#E8B88F',
    peinado: cuerpo === 'f' ? 'largo' : 'corto',
    pelo: '#3B2416',
    ojos: '#2B1B10',
    camisa: '#00ADA9',
    pantalon: '#0F3D47',
    calzado: 'zapatos',
    colorCalzado: '#2A2A2A',
    accesorio: 'ninguno',
    colorAccesorio: '#1E1E1E',
    expresion: 'sonrisa',
    altura: 1,
  };
}

export function defaultSala(texto: string, ancho = 6, fondo = 5): AparienciaSala {
  return {
    ancho,
    fondo,
    piso: 'alfombra',
    colorPiso: '#D7DEE0',
    colorPared: '#F4F8FA',
    alturaPared: 0.6,
    acento: '#00ADA9',
    mobiliario: 'cubiculos',
    utileria: ['plantas'],
    iluminacion: 'calida',
    rotulo: { texto, color: '#0F3D47' },
  };
}

export function defaultOficina(paleta: PaletaId = 'acitmx'): AparienciaOficina {
  const p = PALETAS[paleta];
  const colores = {
    primario: p.primario,
    secundario: p.secundario,
    acento: p.acento,
    fondo: p.fondo,
    piso: p.piso,
  };
  return { paleta, colores, ciclo: 'dia', hora: 11, calidad: 'alta' };
}

// ---- Contraste (rótulos siempre legibles aunque el usuario elija colores extremos)
function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminancia(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/**
 * Color de texto con contraste AA (>= 4.5) sobre el fondo: prefiere el oscuro de marca o el claro;
 * si ninguno alcanza, usa negro o blanco puros (el que más contraste dé).
 */
export function textoLegible(fondo: string, oscuro = '#0F3D47', claro = '#FFFFFF'): string {
  const mejor = (a: string, b: string) => (contraste(fondo, a) >= contraste(fondo, b) ? a : b);
  const marca = mejor(oscuro, claro);
  return contraste(fondo, marca) >= 4.5 ? marca : mejor('#000000', '#FFFFFF');
}
