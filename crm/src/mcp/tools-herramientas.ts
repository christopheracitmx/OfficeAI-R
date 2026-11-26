import { z } from 'zod';
import type { CrmApi } from './api';
import type { ToolDef } from './tools-crm';

const qs = (o: Record<string, unknown>): string =>
  new URLSearchParams(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

/** Herramientas genéricas (colecciones y archivos). El servidor valida la oficina y el allowlist en cada llamada. */
export function herramientasGenericas(api: CrmApi): ToolDef[] {
  return [
    {
      name: 'coleccion_listar',
      description:
        'Lista las colecciones (tablas de datos) de la oficina con su esquema: campos, tipos y clave de deduplicación.',
      schema: {},
      run: () => api.get('/coleccion/listar'),
    },
    {
      name: 'coleccion_buscar',
      description:
        'Busca registros de una colección por texto (máx. 20, cortos). Úsala ANTES de agregar para no duplicar.',
      schema: {
        coleccion: z.string().min(2).max(60),
        texto: z.string().max(120).optional(),
        limite: z.number().int().min(1).max(20).optional(),
      },
      run: (a) => api.get(`/coleccion/buscar?${qs(a)}`),
    },
    {
      name: 'coleccion_upsert',
      description:
        'Crea o actualiza un registro de la colección. Valida el esquema, deduplica por la clave y EXIGE fuente_url (enlace de donde salió el dato). No borra nada.',
      schema: {
        coleccion: z.string().min(2).max(60),
        datos: z.record(z.string(), z.unknown()).describe('Objeto con los campos del esquema'),
        fuente_url: z.string().url().describe('Enlace http(s) de la fuente del dato'),
        nota: z.string().max(500).optional(),
      },
      run: (a) => api.post('/coleccion/upsert', a),
    },
    {
      name: 'archivos_listar',
      description:
        'Sin ruta: lista las carpetas autorizadas por el dueño. Con ruta (absoluta, devuelta antes): lista esa carpeta. Solo dentro de las carpetas autorizadas.',
      schema: { ruta: z.string().max(1000).optional() },
      run: (a) => api.get(`/archivos/listar?${qs(a)}`),
    },
    {
      name: 'archivos_leer',
      description:
        'Lee un archivo de TEXTO de una carpeta autorizada (tope de 64 KB; devuelve truncado:true si es más grande).',
      schema: { ruta: z.string().min(3).max(1000) },
      run: (a) => api.get(`/archivos/leer?${qs(a)}`),
    },
    {
      name: 'archivos_mover_cuarentena',
      description:
        'Mueve un archivo a la carpeta de cuarentena de su carpeta autorizada (reversible). NUNCA borra. Indica el motivo.',
      schema: { ruta: z.string().min(3).max(1000), motivo: z.string().min(3).max(300) },
      run: (a) => api.post('/archivos/mover-cuarentena', a),
    },
  ];
}
