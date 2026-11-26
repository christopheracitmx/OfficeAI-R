import type { CampoDef } from '../../shared/colecciones';
import type { BorradorCompleto, BorradorParcial } from '../../shared/constructor';
import type { PaqueteOficina } from '../../shared/paquete';
import type { Db } from '../db';
import { compilarBorrador } from './constructor-compilar';
import { KbError } from './kb';

/** Plantillas base de la galería: borradores del Constructor con workflows triviales y válidos. */
interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  borrador: BorradorParcial;
}

const REG_CAMPOS: CampoDef[] = [
  { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
  { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: false },
  {
    nombre: 'estado',
    etiqueta: 'Estado',
    tipo: 'enum',
    requerido: false,
    opciones: ['nuevo', 'verificado', 'descartado'],
  },
];

const PLANTILLAS: Plantilla[] = [
  {
    id: 'vacia',
    nombre: 'Vacía',
    descripcion: 'Un solo asistente y un flujo mínimo: punto de partida para armarlo a tu manera.',
    borrador: {
      nombre: 'Piso vacío',
      objetivo: 'Realizar la tarea que el dueño indique en cada corrida.',
      entregable: 'Un resumen corto de lo hecho.',
      agentes: [
        {
          rol: 'Asistente',
          area: 'Trabajo',
          tarea: 'Hacer la tarea indicada con la Biblioteca.',
          es_qa: false,
          herramientas: ['obscura_extract', 'notificar_interno'],
          web: false,
        },
      ],
      devoluciones_max: 0,
      items_max: 3,
    },
  },
  {
    id: 'base-datos',
    nombre: 'Base de datos',
    descripcion: 'Alimenta una tabla de registros con fuente y la revisa un agente de calidad.',
    borrador: {
      nombre: 'Base de datos',
      objetivo: 'Reunir registros nuevos con su fuente y mantenerlos sin duplicados.',
      entregable: 'Registros nuevos en la colección «Registros», cada uno con su fuente.',
      entrada: 'El tema a investigar que se escribe en cada corrida.',
      salida: 'Registros en la colección «Registros».',
      almacenamiento: 'Colección «Registros» (pestaña Datos).',
      agentes: [
        {
          rol: 'Recolector',
          area: 'Captura',
          tarea: 'Buscar información pública y guardar cada registro con su fuente.',
          es_qa: false,
          herramientas: ['obscura_extract'],
          web: true,
        },
        {
          rol: 'Verificador',
          area: 'Calidad',
          tarea: 'Revisar que cada registro tenga fuente válida y no esté duplicado.',
          es_qa: true,
          herramientas: [],
          web: false,
        },
      ],
      devoluciones_max: 1,
      items_max: 5,
      colecciones: [
        {
          nombre: 'Registros',
          descripcion: 'Registros reunidos por los agentes',
          campos: [...REG_CAMPOS],
          clave: 'nombre',
        },
      ],
    },
  },
  {
    id: 'archivos-crm',
    nombre: 'Archivos / CRM',
    descripcion:
      'Revisa carpetas autorizadas, clasifica archivos y deja un inventario (nada se borra).',
    borrador: {
      nombre: 'Archivos y CRM',
      objetivo:
        'Ordenar archivos de carpetas autorizadas y llevar un inventario de lo que contienen.',
      entregable: 'Inventario en la colección «Archivos revisados» y propuestas de orden.',
      entrada: 'Carpetas autorizadas por el dueño (Configuración).',
      salida: 'Inventario de archivos y movimientos a cuarentena con motivo.',
      almacenamiento: 'Colección «Archivos revisados» y registro de cambios de archivos.',
      agentes: [
        {
          rol: 'Clasificador',
          area: 'Archivos',
          tarea: 'Listar y leer archivos autorizados, clasificarlos y registrarlos.',
          es_qa: false,
          herramientas: ['archivos_listar', 'archivos_leer', 'archivos_mover_cuarentena'],
          web: false,
        },
        {
          rol: 'Auditor',
          area: 'Calidad',
          tarea: 'Verificar que cada movimiento a cuarentena tenga motivo claro.',
          es_qa: true,
          herramientas: [],
          web: false,
        },
      ],
      devoluciones_max: 0,
      items_max: 10,
      colecciones: [
        {
          nombre: 'Archivos revisados',
          descripcion: 'Inventario de archivos revisados',
          campos: [
            { nombre: 'ruta', etiqueta: 'Ruta', tipo: 'texto', requerido: true },
            { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'texto', requerido: false },
            { nombre: 'resumen', etiqueta: 'Resumen', tipo: 'texto', requerido: false },
          ],
          clave: 'ruta',
        },
      ],
    },
  },
  {
    id: 'noticias',
    nombre: 'Noticias del sector',
    descripcion: 'Vigila fuentes públicas, resume lo relevante y lo revisa antes de guardarlo.',
    borrador: {
      nombre: 'Noticias del sector',
      objetivo: 'Vigilar noticias relevantes del sector del cliente y resumirlas con su fuente.',
      entregable: 'Noticias nuevas y relevantes en la colección «Noticias».',
      entrada: 'El tema o sector a vigilar, escrito en cada corrida.',
      salida: 'Noticias con título, enlace, fecha, resumen y relevancia.',
      almacenamiento: 'Colección «Noticias» (pestaña Datos).',
      agentes: [
        {
          rol: 'Vigía',
          area: 'Monitoreo',
          tarea: 'Buscar noticias recientes y públicas del tema.',
          es_qa: false,
          herramientas: ['obscura_extract'],
          web: true,
        },
        {
          rol: 'Redactor',
          area: 'Resumen',
          tarea: 'Resumir cada noticia en 2 frases y guardarla con su fuente.',
          es_qa: false,
          herramientas: [],
          web: false,
        },
        {
          rol: 'Editor',
          area: 'Calidad',
          tarea: 'Descartar duplicados y noticias poco relevantes.',
          es_qa: true,
          herramientas: ['notificar_interno'],
          web: false,
        },
      ],
      devoluciones_max: 1,
      items_max: 5,
      colecciones: [
        {
          nombre: 'Noticias',
          descripcion: 'Noticias relevantes con su fuente',
          campos: [
            { nombre: 'titulo', etiqueta: 'Título', tipo: 'texto', requerido: true },
            { nombre: 'enlace', etiqueta: 'Enlace', tipo: 'url', requerido: true },
            { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: false },
            { nombre: 'resumen', etiqueta: 'Resumen', tipo: 'texto', requerido: false },
            {
              nombre: 'relevancia',
              etiqueta: 'Relevancia',
              tipo: 'enum',
              requerido: false,
              opciones: ['alta', 'media', 'baja'],
            },
          ],
          clave: 'enlace',
        },
      ],
    },
  },
];

export interface FichaPlantilla {
  id: string;
  nombre: string;
  descripcion: string;
  agentes: number;
  colecciones: number;
  herramientas: string[];
}

export function listarPlantillas(db: Db): FichaPlantilla[] {
  return PLANTILLAS.map((p) => {
    const c = compilarBorrador(db, p.borrador);
    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      agentes: c.paquete?.agentes.length ?? 0,
      colecciones: c.paquete?.colecciones.length ?? 0,
      herramientas: c.paquete?.herramientas ?? [],
    };
  });
}

export function paqueteDePlantilla(db: Db, id: string): PaqueteOficina {
  const p = PLANTILLAS.find((x) => x.id === id);
  if (!p) throw new KbError(404, 'Plantilla desconocida');
  const c = compilarBorrador(db, p.borrador);
  if (!c.paquete) throw new KbError(500, `Plantilla inválida: ${c.errores.join('; ')}`);
  return c.paquete;
}

/** Borrador de una plantilla (para arrancar el Constructor desde ella). */
export function borradorDePlantilla(id: string): BorradorParcial {
  const p = PLANTILLAS.find((x) => x.id === id);
  if (!p) throw new KbError(404, 'Plantilla desconocida');
  return structuredClone(p.borrador);
}

export type { BorradorCompleto };
