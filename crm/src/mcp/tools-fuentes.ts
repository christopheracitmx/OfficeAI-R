import { z } from 'zod';
import type { CrmApi } from './api';
import type { ToolDef } from './tools-crm';

/** Fuentes de descubrimiento gratuitas (por código: sin gastar tokens en buscar ni deduplicar). */
export function fuentesTools(api: CrmApi): ToolDef[] {
  return [
    {
      name: 'fuente_buscar',
      description:
        'Consulta UNA fuente gratuita (denue_local, overture_local, denue_api, osm_overpass), filtra (gobierno, fuera de piloto, no_contactar, micronegocios), quita duplicados, fusiona datos y registra en el directorio. Devuelve solo un resumen. Si responde quota_exceeded o sin_datos, pasa a otra fuente. Usa zona y giro de la corrida si no los das.',
      schema: {
        fuente: z.enum(['denue_local', 'overture_local', 'denue_api', 'osm_overpass']),
        zona: z
          .string()
          .max(80)
          .optional()
          .describe('Ej: "CDMX Norte" o "Edomex - Naucalpan de Juárez"'),
        giro: z.string().max(80).optional(),
        texto: z.string().max(80).optional().describe('Parte del nombre (opcional)'),
        max: z.number().int().min(1).max(20).default(10),
      },
      run: (a) => api.post('/fuentes/buscar', a),
    },
    {
      name: 'directorio_importar_candidatos',
      description:
        'Registra por lote (máx. 20) empresas halladas en páginas públicas, con los mismos filtros y deduplicación que las fuentes. Cada candidato exige fuente_url. No lo uses con redes sociales.',
      schema: {
        metodo: z.enum([
          'nicho_web',
          'directorio_publico',
          'parque_industrial',
          'noticia_expansion',
          'hallazgo_oportunista',
        ]),
        consulta: z.string().min(2).max(200),
        candidatos: z
          .array(
            z.object({
              nombre: z.string().min(2).max(200),
              direccion: z.string().max(400).optional(),
              telefono: z.string().max(60).optional(),
              correo: z.string().max(120).optional(),
              sitio_web: z.string().max(300).optional(),
              giro: z.string().max(80).optional(),
              fuente_url: z.string().url().max(1000),
            }),
          )
          .min(1)
          .max(20),
      },
      run: (a) => api.post('/fuentes/importar-candidatos', a),
    },
  ];
}
