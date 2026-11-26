import type { AgenteBorrador, BorradorCompleto } from '../../shared/constructor';

/** Prompt común del piso generado (editable después en «Prompts»; los candados siguen fijos en código). */
export function promptComun(b: BorradorCompleto): string {
  const lineas = [
    `Eres parte de la oficina «${b.nombre}», un equipo de agentes de IA. Responde siempre en español, breve y concreto.`,
    `Objetivo de la oficina: ${b.objetivo}`,
    `Lo que entrega: ${b.entregable}`,
    b.entrada && `Datos de entrada: ${b.entrada}`,
    b.salida && `Datos de salida: ${b.salida}`,
    b.almacenamiento && `Dónde se guarda el resultado: ${b.almacenamiento}`,
    'Consulta la Biblioteca de la oficina con kb_buscar antes de suponer datos y no inventes nada: cada dato lleva su fuente.',
    'Solo usas las herramientas que se te dieron. Al terminar responde con una línea de resumen.',
    ...(b.reglas.length > 0
      ? ['Reglas adicionales del dueño:', ...b.reglas.map((r) => `- ${r}`)]
      : []),
  ];
  return lineas.filter(Boolean).join('\n');
}

const NOTAS_HERRAMIENTA: Record<string, string> = {
  coleccion_buscar: 'Antes de agregar un registro busca con coleccion_buscar para no duplicar.',
  coleccion_upsert:
    'Guarda cada resultado con coleccion_upsert: respeta el esquema y SIEMPRE incluye fuente_url (de dónde salió el dato).',
  obscura_extract: 'Lee páginas públicas con obscura_extract; si falla, usa la búsqueda web.',
  archivos_listar: 'Solo trabajas dentro de las carpetas autorizadas por el dueño.',
  archivos_mover_cuarentena: 'Nunca borras: mueves a cuarentena (reversible) y dices el motivo.',
  notificar_interno: 'Avisa al dueño con notificar_interno solo cuando haya algo relevante.',
};

export function promptDeAgente(a: AgenteBorrador, b: BorradorCompleto, tools: string[]): string {
  const notas = tools.map((t) => NOTAS_HERRAMIENTA[t]).filter((x): x is string => Boolean(x));
  const colecciones =
    b.colecciones.length > 0
      ? `Colecciones de la oficina: ${b.colecciones.map((c) => `«${c.nombre}»`).join(', ')} (consulta su esquema con coleccion_listar).`
      : '';
  const qa = a.es_qa
    ? [
        'Eres el control de calidad: revisa lo producido contra el objetivo y la fuente de cada dato.',
        'Si algo no cumple, anota "REVISAR: motivo" en la nota del registro (coleccion_upsert, mismo dato y fuente) o avisa con notificar_interno. No lo corrijas tú.',
        `Máximo ${b.devoluciones_max} devolución(es): después de eso, acepta lo que quede y resume.`,
      ]
    : [];
  return [
    `Rol: ${a.rol} (área ${a.area}).`,
    `Tu tarea: ${a.tarea}`,
    ...qa,
    colecciones,
    ...notas,
    'Entrega al terminar un resumen de una línea con lo hecho.',
  ]
    .filter(Boolean)
    .join('\n');
}
