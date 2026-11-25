/** Biblioteca de habilidades base (Markdown de procedimiento; nada se ejecuta). Cortas a propósito: se inyectan en el prompt. */
export interface HabilidadBase {
  nombre: string;
  descripcion: string;
  contenido_md: string;
  agentes: string[];
}

export const HABILIDADES_BASE: HabilidadBase[] = [
  {
    nombre: 'Verificar que un sitio es el oficial',
    descripcion:
      'Evita registrar el sitio de otra empresa o un directorio como si fuera el de la empresa.',
    contenido_md: `1. El dominio coincide con el nombre comercial, o la página nombra la razón social y la zona.
2. Hay dirección o teléfono que concuerdan con los datos ya guardados.
3. Descarta directorios, redes sociales, notas de prensa y marketplaces: no son el sitio oficial.
4. Si dudas entre dos candidatos, guarda el más probable con nota de duda; no inventes.`,
    agentes: ['Rastreador', 'Explorador'],
  },
  {
    nombre: 'Registrar contactos con fuente',
    descripcion: 'Todo dato de contacto debe poder comprobarse.',
    contenido_md: `- Guarda solo correos y teléfonos de negocio vistos en la página (usa los que ya extrae obscura_extract).
- Cada contacto lleva la URL exacta donde lo viste. Sin fuente, no se guarda.
- No adivines correos por patrón ni uses datos personales de redes sociales.`,
    agentes: ['Rastreador'],
  },
  {
    nombre: 'Filtrar gobierno, duplicados y No contactar',
    descripcion: 'Criterios de descarte del Guardián.',
    contenido_md: `- Gobierno, dependencias y escuelas públicas: descarta con motivo "gobierno".
- Duplicado: mismo dominio, teléfono o razón social muy parecida: fusiona o descarta con motivo.
- Lista No contactar: la consulta del CRM es la fuente de verdad.
- Fuera de CDMX y Estado de México en el piloto: descarta con motivo "zona".
- Registra siempre el motivo en una frase corta.`,
    agentes: ['Guardian'],
  },
  {
    nombre: 'Consultar la Biblioteca con poco gasto',
    descripcion: 'Leer fragmentos, no documentos completos.',
    contenido_md: `- Usa kb_buscar con 1 a 3 palabras clave y el tipo (producto, giro, voz, reglas...).
- Lee con kb_leer solo si el fragmento no basta; el resultado indica "siguiente" para continuar.
- No repitas la misma búsqueda en el mismo paso.`,
    agentes: ['Analista', 'Estratega', 'Armador', 'Calificador', 'Redactor'],
  },
  {
    nombre: 'Escribir sin precios ni promesas',
    descripcion: 'Candado de redacción para propuestas, paquetes y reportes.',
    contenido_md: `- Nunca cifras de dinero, descuentos ni plazos de entrega.
- Productos: familia o categoría; modelos solo si estás seguro de que existen.
- Cada propuesta se liga a una necesidad concreta de la ficha de la empresa.
- Marca las inferencias como inferencias.`,
    agentes: ['Estratega', 'Armador', 'Redactor'],
  },
  {
    nombre: 'Devolver con motivos accionables',
    descripcion: 'Guía para QA-1 y QA-2.',
    contenido_md: `- Al devolver, indica el rol destino y 1 a 3 motivos concretos y verificables.
- Revisa contra el expediente, no contra tu intuición: contacto sin fuente, score incoherente, propuesta sin necesidad ligada.
- Aprueba si lo observado es correcto aunque mejorable; no devuelvas por estilo.`,
    agentes: ['QA-1', 'QA-2'],
  },
];
