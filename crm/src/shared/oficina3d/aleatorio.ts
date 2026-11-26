/** Aleatorio reproducible, presets y composición de apariencias (base del Personalizador). */
import {
  ACCESORIOS,
  CALZADOS,
  COLORES_OJOS,
  COLORES_PELO,
  EXPRESIONES,
  PEINADOS,
  PIELES,
  aparienciaPersonaje,
  defaultPersonaje,
  type AparienciaPersonaje,
  type Genero,
} from './apariencia';

export type Rng = () => number;

/** PRNG determinista (mulberry32): misma semilla, mismo equipo. */
export function rngSemilla(semilla: number): Rng {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla estable a partir de un texto (p. ej. id del agente). */
export function semillaDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function elegir<T>(rng: Rng, lista: readonly T[]): T {
  return lista[Math.floor(rng() * lista.length) % lista.length] as T;
}

export const CAMISAS = [
  '#00ADA9',
  '#007F7C',
  '#164E5A',
  '#F2B33D',
  '#E07A5F',
  '#5B8DEF',
  '#F4F8FA',
];
export const PANTALONES = ['#0F3D47', '#2A2A2A', '#3D4C63', '#6B5B4B', '#22313F'];
export const ZAPATOS = ['#2A2A2A', '#5A3A22', '#F4F8FA', '#0F3D47'];
export const ACCENTOS_ACC = ['#1E1E1E', '#0F3D47', '#D64545', '#F2B33D', '#00ADA9'];
const PEINADOS_F = ['largo', 'chongo', 'coleta', 'rizado', 'corto'] as const;
const PEINADOS_M = ['corto', 'rizado', 'calvo', 'corto', 'largo'] as const;

/** Apariencia aleatoria válida para un cuerpo base. */
export function aparienciaAleatoria(rng: Rng, cuerpo: Genero): AparienciaPersonaje {
  const peinado = elegir(rng, cuerpo === 'f' ? PEINADOS_F : PEINADOS_M);
  const accesorio = rng() < 0.45 ? 'ninguno' : elegir(rng, ACCESORIOS);
  return aparienciaPersonaje.parse({
    cuerpo,
    piel: elegir(rng, PIELES),
    peinado: PEINADOS.includes(peinado) ? peinado : 'corto',
    pelo: elegir(rng, COLORES_PELO),
    ojos: elegir(rng, COLORES_OJOS),
    camisa: elegir(rng, CAMISAS),
    pantalon: elegir(rng, PANTALONES),
    calzado: elegir(rng, CALZADOS),
    colorCalzado: elegir(rng, ZAPATOS),
    accesorio: cuerpo === 'f' && accesorio === 'corbata' ? 'lentes' : accesorio,
    colorAccesorio: elegir(rng, ACCENTOS_ACC),
    expresion: elegir(rng, EXPRESIONES),
    altura: Math.round((0.94 + rng() * 0.12) * 100) / 100,
  });
}

/**
 * Géneros para un equipo de n personas respetando la paridad (por defecto 50/50): con n par
 * salen exactamente n/2 de cada uno; con n impar la diferencia es 1. Orden barajado.
 */
export function generosEquipo(n: number, rng: Rng, paridad = 0.5): Genero[] {
  const mujeres = Math.round(n * paridad);
  const lista: Genero[] = Array.from({ length: n }, (_, i) => (i < mujeres ? 'f' : 'm'));
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lista[i], lista[j]] = [lista[j] as Genero, lista[i] as Genero];
  }
  return lista;
}

export function equipoAleatorio(n: number, rng: Rng, paridad = 0.5): AparienciaPersonaje[] {
  return generosEquipo(n, rng, paridad).map((g) => aparienciaAleatoria(rng, g));
}

// ---- Presets de equipo: solo cambian la ropa; respetan piel, peinado y rasgos de cada quien
export const PRESETS_EQUIPO = {
  uniforme: { nombre: 'Uniforme de marca' },
  casual: { nombre: 'Casual' },
  formal: { nombre: 'Formal' },
} as const;
export type PresetEquipo = keyof typeof PRESETS_EQUIPO;

export function aplicarPreset(
  a: AparienciaPersonaje,
  preset: PresetEquipo,
  i: number,
  acento?: string,
): AparienciaPersonaje {
  if (preset === 'uniforme')
    return {
      ...a,
      camisa: acento ?? (i % 2 ? '#007F7C' : '#00ADA9'),
      pantalon: '#0F3D47',
      calzado: 'zapatos',
      colorCalzado: '#2A2A2A',
    };
  if (preset === 'formal')
    return {
      ...a,
      camisa: '#F4F8FA',
      pantalon: '#22313F',
      calzado: 'zapatos',
      colorCalzado: '#1E1E1E',
      accesorio: a.cuerpo === 'm' ? 'corbata' : a.accesorio === 'corbata' ? 'ninguno' : a.accesorio,
      colorAccesorio: acento ?? '#0F3D47',
    };
  return {
    ...a,
    camisa: CAMISAS[(i * 3 + 1) % CAMISAS.length] as string,
    pantalon: i % 3 ? '#3D4C63' : '#6B5B4B',
    calzado: 'tenis',
    colorCalzado: '#F4F8FA',
    accesorio: a.accesorio === 'corbata' ? 'ninguno' : a.accesorio,
  };
}

/** Composición: default del cuerpo + base + cambios del usuario, validado (lo inválido se descarta). */
export function componerPersonaje(
  cuerpo: Genero,
  ...capas: (Partial<AparienciaPersonaje> | undefined)[]
): AparienciaPersonaje {
  let r = defaultPersonaje(cuerpo);
  for (const c of capas) {
    if (!c) continue;
    const prueba = aparienciaPersonaje.safeParse({ ...r, ...c, cuerpo: c.cuerpo ?? r.cuerpo });
    if (prueba.success) {
      r = prueba.data;
      continue;
    }
    // Aplica campo por campo para conservar los válidos.
    for (const [k, v] of Object.entries(c)) {
      const p = aparienciaPersonaje.safeParse({ ...r, [k]: v });
      if (p.success) r = p.data;
    }
  }
  return r;
}
