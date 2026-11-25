import type { Workflow } from '../runner/workflow';
import { validarWorkflow } from '../runner/workflow';

/** Plantilla «vacía»: un solo agente y un workflow trivial (un paso por lote) editable como JSON en la UI avanzada. */
export function workflowVacio(id: string, nombre: string): Workflow {
  return validarWorkflow(
    {
      version: 1,
      office_id: id,
      titulo: nombre,
      coordinador: 'Asistente',
      entidad_item: 'item',
      tope_items: 'max_items',
      topes: { pasos_por_item: 2, pasos_extra: 4, max_repeticiones_paso: 2 },
      variables: {},
      mensajes: { item: 'tarea={tarea}' },
      resultados: { hecho: 'Hechos', incompleta: 'Incompletas' },
      progreso: [
        {
          id: 'pasos',
          etiqueta: 'Pasos ejecutados',
          sql: 'SELECT COUNT(*) FROM salidas_agente WHERE corrida_id=:corrida',
        },
      ],
      pasos: {
        asistente: {
          agente: 'Asistente',
          roles: ['Asistente'],
          prompts: ['asistente'],
          herramientas: ['kb_buscar', 'kb_leer', 'obscura_extract', 'notificar_interno'],
          web: false,
          max_turnos: 10,
          max_lecturas: 5,
        },
      },
      fases: [
        {
          tipo: 'lote',
          id: 'trabajo',
          paso: 'asistente',
          items: 'SELECT 1',
          solo_agrupado: false,
          mensaje: 'Realiza la tarea de la oficina: {tarea}',
        },
      ],
    },
    id,
  );
}

export const PROMPT_COMUN_VACIO = `Eres parte de una oficina de agentes de IA. Responde siempre en español, breve y concreto.
Consulta la Biblioteca de la oficina con kb_buscar antes de suponer datos y no inventes nada: cada dato lleva su fuente.
Solo usas las herramientas que se te dieron. Al terminar responde con una línea de resumen.`;

export const PROMPT_ASISTENTE_VACIO = `Rol: Asistente de la oficina.
Haz la tarea que se te pida con los datos de la Biblioteca y, si hace falta, páginas públicas (obscura_extract).
Entrega un resumen corto con lo hecho y, si procede, avisa al equipo con notificar_interno.`;
