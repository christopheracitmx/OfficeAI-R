// Casos dorados de fábrica de la oficina de prospección: expedientes de ejemplo (ficticios) y criterios verificables por código.
import type { Criterio } from '../../shared/aprendizaje';

export interface CasoSemilla {
  nombre: string;
  agente: string;
  paso: string;
  entrada: string;
  salida_esperada: string;
  criterios: Criterio[];
}

const EXP_MANUFACTURA = `Empresa: Manufacturas Ejemplo SA (ficticia). Giro: Manufactura. Cuautitlán Izcalli, Edomex. Tamaño: mediana, 2 sucursales.
Sitio verificado: https://manufacturas-ejemplo.mx
Contactos: correo contacto@manufacturas-ejemplo.mx (fuente https://manufacturas-ejemplo.mx/contacto); teléfono 55 5555 0101 (fuente https://manufacturas-ejemplo.mx/contacto).
Necesidades: estaciones de trabajo para ingeniería (inferencia); red inalámbrica en planta (evidencia: vacante de TI menciona Wi-Fi).
Productos propuestos: Lenovo ThinkStation; Aruba Wi-Fi.
Score: 82 (nivel A).`;

const EXP_LOGISTICA = `Empresa: Transportes Ejemplo del Valle SA (ficticia). Giro: Logística y transporte. Tlalnepantla, Edomex. Tamaño: grande, 5 sucursales.
Sitio verificado: https://transportes-ejemplo.mx
Contactos: correo ti@transportes-ejemplo.mx (fuente https://transportes-ejemplo.mx/contacto).
Necesidades: laptops para operadores de patio (inferencia); conectividad en bodegas (evidencia: nota de expansión de bodega en Tultitlán).
Productos propuestos: Lenovo ThinkPad; Aruba Switch.
Score: 74 (nivel B).`;

const EXP_ESCUELA = `Empresa: Colegio Ejemplo Anáhuac AC (ficticia). Giro: Educación privada. Benito Juárez, CDMX. Tamaño: mediana, 1 campus.
Sitio verificado: https://colegio-ejemplo.edu.mx
Contactos: correo administracion@colegio-ejemplo.edu.mx (fuente https://colegio-ejemplo.edu.mx/contacto).
Necesidades: aulas con equipo de cómputo (inferencia); Wi-Fi de alta densidad en campus (inferencia).
Productos propuestos: Lenovo ThinkCentre; Aruba Wi-Fi.
Score: 61 (nivel B).`;

const NO_PRECIOS: Criterio = { tipo: 'sin_precios' };
const SIN_CONTACTO: Criterio = { tipo: 'sin_contacto_externo' };

export const CASOS_DORADOS_PROSPECCION: CasoSemilla[] = [
  {
    nombre: 'Reporte de manufactura sin precios y con fuente',
    agente: 'Redactor',
    paso: 'redactor',
    entrada: EXP_MANUFACTURA,
    salida_esperada:
      'Reporte «Oye jefe...» con resumen, razones, paquete, contacto con su fuente y un borrador de correo para el vendedor, sin precios.',
    criterios: [
      NO_PRECIOS,
      SIN_CONTACTO,
      { tipo: 'contiene', valor: 'Oye jefe' },
      { tipo: 'contiene', valor: 'https://manufacturas-ejemplo.mx/contacto' },
    ],
  },
  {
    nombre: 'Reporte de logística: tono interno y sin promesas',
    agente: 'Redactor',
    paso: 'redactor',
    entrada: EXP_LOGISTICA,
    salida_esperada: 'Reporte interno para el dueño, sin precios ni promesas de disponibilidad.',
    criterios: [
      NO_PRECIOS,
      SIN_CONTACTO,
      { tipo: 'contiene', valor: 'Transportes Ejemplo' },
      { tipo: 'no_contiene', valor: 'garantizamos' },
    ],
  },
  {
    nombre: 'Borrador de correo del colegio: breve y sin precios',
    agente: 'Redactor',
    paso: 'redactor',
    entrada: EXP_ESCUELA,
    salida_esperada:
      'Borrador breve de primer contacto para el vendedor, con una pregunta abierta.',
    criterios: [NO_PRECIOS, SIN_CONTACTO, { tipo: 'largo_max', valor: '2500' }],
  },
  {
    nombre: 'Paquete de manufactura coherente con los productos',
    agente: 'Armador',
    paso: 'armador',
    entrada: `${EXP_MANUFACTURA}\nResponde en JSON: {"productos":[{"marca","categoria","razon","prioridad"}],"paquetes":[{"nombre","componentes":[],"argumento"}]}`,
    salida_esperada:
      'JSON con productos Lenovo/Aruba y un paquete que combina ThinkStation y Wi-Fi Aruba.',
    criterios: [{ tipo: 'json_valido' }, { tipo: 'paquete_coherente' }, NO_PRECIOS],
  },
  {
    nombre: 'Paquete de colegio coherente',
    agente: 'Armador',
    paso: 'armador',
    entrada: `${EXP_ESCUELA}\nResponde en JSON: {"productos":[{"marca","categoria","razon","prioridad"}],"paquetes":[{"nombre","componentes":[],"argumento"}]}`,
    salida_esperada: 'JSON con productos y un paquete aulas+Wi-Fi coherente.',
    criterios: [{ tipo: 'json_valido' }, { tipo: 'paquete_coherente' }, NO_PRECIOS],
  },
  {
    nombre: 'Score de logística con justificación y contactos citados',
    agente: 'Calificador',
    paso: 'calificador',
    entrada: `${EXP_LOGISTICA}\nResponde en JSON: {"score":0-100,"score_desglose":{"ajuste","necesidad","contacto","cercania","capacidad"},"justificacion":"...","contactos":[{"valor","fuente_url"}]}`,
    salida_esperada:
      'JSON con score entre 60 y 85, desglose y justificación sin precios; cada contacto con fuente_url.',
    criterios: [
      { tipo: 'json_valido' },
      { tipo: 'contacto_con_fuente' },
      NO_PRECIOS,
      { tipo: 'contiene', valor: 'justificacion' },
    ],
  },
];
