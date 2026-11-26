/** Medidas del edificio 3D (en unidades de la escena). */
export const ANCHO = 16;
export const FONDO = 10;
export const ALTO = 4.6;
export const LOSA = 0.3;
export const yPiso = (i: number): number => i * (ALTO + LOSA);
