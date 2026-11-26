/** Campos «visuales» de una entidad: lo que se copia, exporta y guarda como preset (sin identidad ni plano). */
import { FORMAS, type Campos, type Entidad } from '../../shared/oficina3d/composicion';

const EXCLUIDOS: Record<Entidad, ReadonlySet<string>> = {
  personaje: new Set(['nombre', 'cuerpo']),
  sala: new Set(['ancho', 'fondo', 'x', 'z', 'puestos', 'rotulo']),
  oficina: new Set(['planta', 'marca', 'logo', 'logoUrl']),
};

export function camposVisuales(entidad: Entidad, ef: Campos): Campos {
  const r: Campos = {};
  for (const k of Object.keys(FORMAS[entidad]))
    if (!EXCLUIDOS[entidad].has(k) && ef[k] !== undefined) r[k] = ef[k];
  return r;
}

/** Sobre exportable (el mismo formato que acepta «Importar»). */
export function sobreExportable(entidad: Entidad, nombre: string, ef: Campos) {
  return {
    formato: 'acitmx-preset',
    version: 1,
    tipo: entidad,
    nombre,
    json: camposVisuales(entidad, ef),
  };
}

export function descargarJson(nombreArchivo: string, datos: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/** Nombre de archivo seguro a partir de un texto. */
export const nombreArchivo = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'preset';
