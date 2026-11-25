import { z, type ZodRawShape } from 'zod';
import {
  actividadInput,
  contactoInput,
  empresaInput,
  etapaInput,
  fichaInput,
  finalizarInput,
  hallazgoInput,
  propuestasInput,
  reporteInput,
  revisionQaInput,
  scoreInput,
} from '../shared/schemas';
import type { CrmApi } from './api';

export interface ToolDef {
  name: string;
  description: string;
  schema: ZodRawShape;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const qs = (o: Record<string, unknown>): string =>
  new URLSearchParams(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

export function crmTools(api: CrmApi): ToolDef[] {
  const post = (path: string) => (a: Record<string, unknown>) => api.post(path, a);
  return [
    {
      name: 'crm_corrida_actual',
      description:
        'Devuelve la corrida en curso (zona, giro, max_empresas) o null. Respeta max_empresas.',
      schema: {},
      run: () => api.get('/corrida'),
    },
    {
      name: 'crm_expediente',
      description:
        'Lee (solo lectura) el expediente completo de una empresa por empresa_id: datos, contactos con fuente, necesidades, prospecto, productos, paquetes, score, reporte y revisiones de QA. Es la forma de ver el trabajo de los agentes anteriores.',
      schema: { empresa_id: z.number().int().positive() },
      run: (a) => api.get(`/expediente/${String(a['empresa_id'])}`),
    },
    {
      name: 'crm_directorio_buscar',
      description:
        'Busca en el directorio propio ANTES de buscar en internet: por texto/dominio, y avisa si una consulta (metodo+consulta) ya se hizo.',
      schema: {
        texto: z.string().optional(),
        dominio: z.string().optional(),
        consulta: z.string().optional(),
        metodo: z.string().optional(),
      },
      run: (a) => api.get(`/directorio/buscar?${qs(a)}`),
    },
    {
      name: 'crm_registrar_busqueda',
      description:
        'Registra una búsqueda realizada (para no repetirla) con cuántas empresas dio y cuántas eran nuevas.',
      schema: {
        metodo: z.string(),
        consulta: z.string(),
        resultados: z.number().int(),
        nuevas: z.number().int(),
      },
      run: post('/busquedas'),
    },
    {
      name: 'crm_upsert_empresa',
      description:
        'Registra una empresa en el directorio (metodo_descubrimiento y origen_url/origen_nota obligatorios para trazabilidad). Rechaza gobierno, no_contactar y fuera de zona piloto; deduplica.',
      schema: empresaInput.shape,
      run: post('/empresas'),
    },
    {
      name: 'crm_registrar_hallazgo',
      description:
        'Registra rápido OTRA empresa interesante encontrada mientras investigabas otra (homónimo, proveedor, vecino, cliente). No la investigues a fondo; sigue con tu tarea.',
      schema: hallazgoInput.shape,
      run: post('/hallazgos'),
    },
    {
      name: 'crm_add_contacto',
      description:
        'Guarda un teléfono, correo o persona de contacto de NEGOCIO. fuente_url es obligatoria; sin fuente no se guarda.',
      schema: contactoInput.shape,
      run: post('/contactos'),
    },
    {
      name: 'crm_guardar_ficha',
      description:
        'Guarda tipo/tamaño/sucursales/resumen/giro y necesidades (evidencia vs inferencia). Sin precios.',
      schema: fichaInput.shape,
      run: post('/ficha'),
    },
    {
      name: 'crm_etapa_empresa',
      description:
        'Cambia la etapa de una empresa del directorio (filtrada, enriquecida, analizada, descartada con motivo).',
      schema: etapaInput.shape,
      run: post('/etapa'),
    },
    {
      name: 'crm_guardar_propuestas',
      description:
        'Guarda productos Lenovo/Aruba propuestos y 1-3 paquetes (sin precios). Crea el prospecto y devuelve prospecto_id.',
      schema: propuestasInput.shape,
      run: post('/propuestas'),
    },
    {
      name: 'crm_guardar_score',
      description:
        'Guarda el score 0-100 con desglose y justificación. El nivel A/B/C se calcula solo.',
      schema: scoreInput.shape,
      run: post('/score'),
    },
    {
      name: 'crm_guardar_reporte',
      description:
        'Guarda el reporte interno para el dueño y el borrador de correo para el vendedor (sin precios).',
      schema: reporteInput.shape,
      run: post('/reporte'),
    },
    {
      name: 'crm_qa',
      description:
        'Registra la revisión de QA (qa1 o qa2). Si rechazas indica devolver_a y motivos. A la 3ª devolución pasa a Revisión humana.',
      schema: revisionQaInput.shape,
      run: post('/qa'),
    },
    {
      name: 'crm_finalizar_prospecto',
      description:
        'SOLO tras QA-1 y QA-2 aprobados: guarda como Reportado y avisa por correo a los destinatarios internos. El servidor valida todo; no envía a nadie más.',
      schema: finalizarInput.shape,
      run: post('/finalizar'),
    },
    {
      name: 'crm_actividad',
      description:
        'Latido/estado en lenguaje humano para la pantalla "Ver oficina" (ej. "Leyendo ejemplo.mx · contacto").',
      schema: actividadInput.omit({ agente: true }).shape,
      run: (a) => api.post('/actividad', a),
    },
  ];
}
