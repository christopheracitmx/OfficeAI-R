/**
 * Sandbox de archivos (puro, sin base de datos): resuelve rutas SIEMPRE dentro de las carpetas
 * autorizadas, sin traversal (`..`), sin symlinks/junctions que salgan de la raíz, sin NUL.
 * Lo usan las herramientas archivos_* y la validación de carpetas de la Configuración.
 */
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { KbError } from './kb';

export const CARPETA_CUARENTENA = '_cuarentena';
export const TOPE_LECTURA = 64 * 1024;
export const TOPE_LISTADO = 200;

const igual = (a: string, b: string): boolean =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** ¿`ruta` está dentro de `raiz` (o es la raíz)? Compara por segmentos, no por prefijo de texto. */
export function estaDentro(raiz: string, ruta: string): boolean {
  const rel = relative(raiz, ruta);
  if (rel === '') return true;
  if (isAbsolute(rel)) return false;
  if (rel === '..' || rel.startsWith(`..${sep}`)) return false;
  // En Windows `relative` puede devolver la ruta absoluta de otra unidad: ya cubierto por isAbsolute.
  return !igual(rel, ruta);
}

/** Valida una carpeta que el dueño quiere autorizar. Devuelve su ruta real (sin symlinks). Lanza KbError 400. */
export function validarCarpetaRaiz(entrada: string, prohibidas: readonly string[] = []): string {
  const e = entrada.trim();
  if (!e || e.includes('\0')) throw new KbError(400, 'Ruta no válida');
  if (!isAbsolute(e))
    throw new KbError(400, 'La ruta debe ser absoluta (por ejemplo C:\\Documentos\\Facturas)');
  if (e.startsWith('\\\\') || e.startsWith('//'))
    throw new KbError(400, 'No se admiten rutas de red (UNC); usa una carpeta local');
  if (!existsSync(e)) throw new KbError(400, 'La carpeta no existe');
  let real: string;
  try {
    real = realpathSync(e);
  } catch {
    throw new KbError(400, 'No se puede acceder a la carpeta');
  }
  if (!statSync(real).isDirectory()) throw new KbError(400, 'La ruta no es una carpeta');
  if (igual(parse(real).root, real))
    throw new KbError(
      400,
      'No se puede autorizar la raíz de una unidad; elige una carpeta concreta',
    );
  if (igual(real, homedir()))
    throw new KbError(400, 'No se puede autorizar la carpeta personal completa');
  for (const p of prohibidas)
    if (p && (estaDentro(real, p) || estaDentro(p, real)))
      throw new KbError(
        400,
        'Esa carpeta contiene (o está dentro de) los datos del CRM: elige otra',
      );
  return real;
}

/**
 * Resuelve una ruta pedida por un agente a una ruta real DENTRO de alguna raíz autorizada.
 * Rechaza NUL, rutas relativas, `..` que escapen y symlinks cuyo destino salga de la raíz.
 */
export function resolverDentro(
  raices: readonly string[],
  pedida: string,
): { raiz: string; real: string } {
  if (!pedida || pedida.includes('\0')) throw new KbError(400, 'Ruta no válida');
  if (!isAbsolute(pedida))
    throw new KbError(400, 'Usa la ruta absoluta que devolvió archivos_listar');
  const normal = resolve(pedida);
  let real: string;
  try {
    real = realpathSync(normal);
  } catch {
    throw new KbError(404, 'No existe ese archivo o carpeta');
  }
  for (const r of raices) {
    let raizReal: string;
    try {
      raizReal = realpathSync(r);
    } catch {
      continue;
    }
    // La ruta lógica Y la real deben caer en la raíz: un symlink hacia fuera queda descartado.
    if (estaDentro(raizReal, real) && (estaDentro(r, normal) || estaDentro(raizReal, normal)))
      return { raiz: raizReal, real };
  }
  throw new KbError(403, 'Fuera de las carpetas autorizadas');
}

export interface EntradaListado {
  nombre: string;
  ruta: string;
  tipo: 'archivo' | 'carpeta' | 'enlace';
  tamano: number | null;
}

export function listarDirectorio(real: string): { entradas: EntradaListado[]; truncado: boolean } {
  if (!statSync(real).isDirectory()) throw new KbError(400, 'No es una carpeta');
  const nombres = readdirSync(real).sort((a, b) => a.localeCompare(b, 'es'));
  const entradas: EntradaListado[] = [];
  for (const nombre of nombres.slice(0, TOPE_LISTADO)) {
    const ruta = join(real, nombre);
    try {
      const l = lstatSync(ruta);
      entradas.push({
        nombre,
        ruta,
        tipo: l.isSymbolicLink() ? 'enlace' : l.isDirectory() ? 'carpeta' : 'archivo',
        tamano: l.isFile() ? l.size : null,
      });
    } catch {
      /* archivo que desapareció mientras se listaba */
    }
  }
  return { entradas, truncado: nombres.length > TOPE_LISTADO };
}

/** Lee como máximo `tope` bytes de un archivo de TEXTO. Rechaza enlaces simbólicos y binarios. */
export function leerTexto(
  real: string,
  tope = TOPE_LECTURA,
): { tamano: number; truncado: boolean; contenido: string } {
  if (lstatSync(real).isSymbolicLink()) throw new KbError(403, 'No se leen enlaces simbólicos');
  const st = statSync(real);
  if (!st.isFile()) throw new KbError(400, 'No es un archivo');
  const n = Math.min(st.size, tope);
  const buf = Buffer.alloc(n);
  const fd = openSync(real, 'r');
  try {
    readSync(fd, buf, 0, n, 0);
  } finally {
    closeSync(fd);
  }
  if (buf.includes(0)) throw new KbError(415, 'El archivo no es de texto (binario)');
  return { tamano: st.size, truncado: st.size > tope, contenido: buf.toString('utf8') };
}

const sello = (d: Date): string =>
  d.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

/**
 * Mueve un ARCHIVO a la cuarentena de su raíz conservando su ruta relativa (así se puede revertir).
 * Jamás borra ni sale de la raíz. Devuelve origen y destino reales.
 */
export function moverACuarentena(
  raiz: string,
  real: string,
  ahora = new Date(),
): { origen: string; destino: string } {
  if (lstatSync(real).isSymbolicLink()) throw new KbError(403, 'No se mueven enlaces simbólicos');
  if (!statSync(real).isFile()) throw new KbError(400, 'Solo se mueven archivos (no carpetas)');
  const rel = relative(raiz, real);
  if (rel.split(sep)[0] === CARPETA_CUARENTENA)
    throw new KbError(409, 'El archivo ya está en la cuarentena');
  let destino = join(raiz, CARPETA_CUARENTENA, sello(ahora), rel);
  if (!estaDentro(raiz, destino)) throw new KbError(403, 'Destino fuera de la raíz autorizada');
  mkdirSync(dirname(destino), { recursive: true });
  for (let n = 2; existsSync(destino); n++)
    destino = join(dirname(destino), `${n}-${basename(rel)}`);
  renameSync(real, destino);
  return { origen: real, destino };
}

/** Devuelve un archivo de la cuarentena a su lugar original (si ese lugar está libre y dentro de la raíz). */
export function revertirCuarentena(raiz: string, origen: string, destino: string): void {
  if (!estaDentro(raiz, origen) || !estaDentro(raiz, destino))
    throw new KbError(403, 'Fuera de la raíz autorizada');
  if (!existsSync(destino)) throw new KbError(404, 'El archivo ya no está en la cuarentena');
  if (existsSync(origen)) throw new KbError(409, 'El lugar original ya está ocupado');
  mkdirSync(dirname(origen), { recursive: true });
  renameSync(destino, origen);
}
