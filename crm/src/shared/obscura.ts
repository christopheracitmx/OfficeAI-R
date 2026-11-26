import { resolve } from 'node:path';

/** Ubicación por defecto de Obscura (relativa a la carpeta `crm`): `tools\obscura\obscura.exe` en la raíz del repo. */
export const OBSCURA_POR_DEFECTO = '../tools/obscura/obscura.exe';

/** Resuelve OBSCURA_BIN (vacío = valor por defecto). Una ruta relativa se interpreta desde la carpeta `crm`. */
export function rutaObscura(raiz: string, env: NodeJS.ProcessEnv): string {
  const valor = (env['OBSCURA_BIN'] ?? '').trim();
  return resolve(raiz, valor === '' ? OBSCURA_POR_DEFECTO : valor);
}
