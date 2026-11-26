/**
 * Catálogo único de herramientas que una oficina puede usar (lo consulta el Constructor y la UI).
 * Una integración que NO está aquí «requiere herramienta nueva» (desarrollo): ver estado `requiere_herramienta_nueva`.
 */
export type CategoriaHerramienta = 'conocimiento' | 'web' | 'datos' | 'archivos' | 'avisos' | 'crm';

export interface HerramientaCatalogo {
  nombre: string;
  descripcion: string;
  categoria: CategoriaHerramienta;
  riesgos: string[];
  /** Qué debe configurar el dueño antes de que funcione (vacío = lista para usar). */
  requiere_config: string[];
  /** Solo la oficina de prospección (crm_*) las puede usar. */
  solo_prospeccion?: boolean;
  /** No es una herramienta MCP: es la búsqueda web nativa del motor (campo `web` del paso). */
  nativa?: boolean;
}

export const CATALOGO: readonly HerramientaCatalogo[] = [
  {
    nombre: 'kb_buscar',
    descripcion: 'Busca en la Biblioteca (base de conocimiento) de la oficina.',
    categoria: 'conocimiento',
    riesgos: [],
    requiere_config: [],
  },
  {
    nombre: 'kb_leer',
    descripcion: 'Lee por tramos un documento de la Biblioteca de la oficina.',
    categoria: 'conocimiento',
    riesgos: [],
    requiere_config: [],
  },
  {
    nombre: 'obscura_extract',
    descripcion: 'Lee una página pública y devuelve texto compacto, correos y teléfonos.',
    categoria: 'web',
    riesgos: ['Consume tiempo y plan; solo páginas públicas'],
    requiere_config: [],
  },
  {
    nombre: 'web_search',
    descripcion: 'Búsqueda web nativa del motor (se activa con web: true en el paso).',
    categoria: 'web',
    riesgos: ['Consume plan; resultados no verificados'],
    requiere_config: [],
    nativa: true,
  },
  {
    nombre: 'coleccion_listar',
    descripcion: 'Lista las colecciones (tablas) de la oficina y su esquema.',
    categoria: 'datos',
    riesgos: [],
    requiere_config: [],
  },
  {
    nombre: 'coleccion_buscar',
    descripcion: 'Busca registros en una colección de la oficina.',
    categoria: 'datos',
    riesgos: [],
    requiere_config: [],
  },
  {
    nombre: 'coleccion_upsert',
    descripcion:
      'Crea o actualiza un registro (valida el esquema, deduplica por clave, exige fuente).',
    categoria: 'datos',
    riesgos: ['Escribe datos en la colección (con historial; no borra)'],
    requiere_config: ['Crear la colección en «Datos»'],
  },
  {
    nombre: 'archivos_listar',
    descripcion: 'Lista archivos dentro de las carpetas autorizadas por el dueño.',
    categoria: 'archivos',
    riesgos: ['Ve nombres de archivos de las carpetas autorizadas'],
    requiere_config: ['Activar archivos y autorizar carpetas en Configuración'],
  },
  {
    nombre: 'archivos_leer',
    descripcion: 'Lee (con tope de tamaño) un archivo de texto de una carpeta autorizada.',
    categoria: 'archivos',
    riesgos: ['Lee contenido de archivos autorizados'],
    requiere_config: ['Activar archivos y autorizar carpetas en Configuración'],
  },
  {
    nombre: 'archivos_mover_cuarentena',
    descripcion: 'Mueve un archivo a la carpeta de cuarentena (reversible; jamás borra).',
    categoria: 'archivos',
    riesgos: ['Cambia de lugar archivos (reversible desde la cuarentena)'],
    requiere_config: ['Activar archivos y autorizar carpetas en Configuración'],
  },
  {
    nombre: 'notificar_interno',
    descripcion:
      'Aviso interno en la Actividad y, si está activo, correo a destinatarios internos.',
    categoria: 'avisos',
    riesgos: ['Envía correo SOLO a destinatarios internos de la lista permitida'],
    requiere_config: ['Para correo: activar el correo de la oficina y tener destinatarios'],
  },
  ...[
    'crm_corrida_actual',
    'crm_expediente',
    'crm_directorio_buscar',
    'crm_registrar_busqueda',
    'crm_upsert_empresa',
    'crm_registrar_hallazgo',
    'crm_add_contacto',
    'crm_guardar_ficha',
    'crm_etapa_empresa',
    'crm_guardar_propuestas',
    'crm_guardar_score',
    'crm_guardar_reporte',
    'crm_qa',
    'crm_finalizar_prospecto',
    'crm_actividad',
    'places_search',
  ].map((nombre): HerramientaCatalogo => ({
    nombre,
    descripcion: 'Herramienta específica del piso de prospección ACITMX.',
    categoria: 'crm',
    riesgos: [],
    requiere_config: [],
    solo_prospeccion: true,
  })),
];

export const NOMBRES_CATALOGO: ReadonlySet<string> = new Set(CATALOGO.map((h) => h.nombre));
export const esDelCatalogo = (n: string): boolean => NOMBRES_CATALOGO.has(n);
export const esDeArchivos = (n: string): boolean => n.startsWith('archivos_');

/** Herramientas MCP que reciben por defecto las oficinas que no son de prospección. */
export const HERRAMIENTAS_BASE: readonly string[] = [
  'kb_buscar',
  'kb_leer',
  'obscura_extract',
  'notificar_interno',
  'coleccion_listar',
  'coleccion_buscar',
  'coleccion_upsert',
];

/** Herramientas que una oficina genérica puede llevar (todo el catálogo menos crm_* y las nativas). */
export const HERRAMIENTAS_GENERICAS: readonly string[] = CATALOGO.filter(
  (h) => !h.solo_prospeccion && !h.nativa,
).map((h) => h.nombre);

/** Estados de una integración pedida por el dueño respecto al catálogo. */
export type EstadoIntegracion = 'en_catalogo' | 'requiere_herramienta_nueva';
export const estadoIntegracion = (nombre: string): EstadoIntegracion =>
  esDelCatalogo(nombre) ? 'en_catalogo' : 'requiere_herramienta_nueva';
