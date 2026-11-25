/**
 * Traducción de los eventos reales del runner (SSE `actividad`) a lo que se ve en la oficina 3D:
 * estado/animación de cada agente, texto de su burbuja y traslados de expediente entre puestos.
 * Lógica pura (sin three ni React) para poder probarla.
 */
export const ESTADOS_AGENTE = ['inactivo', 'trabajando', 'caminando', 'alerta', 'pausa'] as const;
export type EstadoAgente = (typeof ESTADOS_AGENTE)[number];

export interface EventoOficina {
  id: number;
  agente: string;
  accion: string;
  detalle: string | null;
}

export interface Traslado {
  de: string;
  a: string;
  tipo: 'entrega' | 'devolucion';
}

export interface Interpretacion {
  agente: string;
  estado: 'trabajando' | 'alerta' | 'inactivo';
  /** Texto corto de la burbuja (sin datos sensibles si `presentacion`). */
  burbuja: string;
  traslado: Traslado | null;
}

const ACCIONES: [RegExp, string][] = [
  [/^buscó en la web/, 'Buscando en la web'],
  [/^leyó una página/, 'Leyendo una página'],
  [/^recibió una tarea/, 'Nueva tarea'],
  [/^registró empresa|^hallazgo oportunista/, 'Registró una empresa'],
  [/^ya la teníamos/, 'Empresa repetida'],
  [/^rechazó empresa/, 'Descartó una empresa'],
  [/^guardó contacto/, 'Guardó un contacto'],
  [/^guardó ficha/, 'Guardó la ficha'],
  [/^armó propuestas/, 'Armó paquetes'],
  [/^calificó/, ''],
  [/^redactó el reporte/, 'Redactó el reporte'],
  [/^guardó el prospecto/, 'Prospecto guardado'],
  [/^asignó a/, ''],
  [/^inició la corrida/, 'Inició la corrida'],
  [/^terminó su tarea/, 'Tarea terminada'],
  [/aprobó$/, 'Aprobado'],
  [/devolvió/, 'Devolución'],
  [/^omitido/, 'Paso omitido'],
];
/** Qué produjo cada agente al terminar (sin datos de la empresa: seguro también en modo presentación). */
const TERMINADO: Record<string, string> = {
  Cartografo: 'Mapa de empresas listo',
  Explorador: 'Empresas nuevas halladas',
  Guardian: 'Lote filtrado',
  Rastreador: 'Sitio y contactos listos',
  Analista: 'Ficha de la empresa lista',
  Estratega: 'Categorías propuestas',
  Armador: 'Paquetes armados',
  'QA-1': 'Revisión 1 terminada',
  Calificador: 'Score calculado',
  Redactor: 'Reporte redactado',
  'QA-2': 'Revisión final terminada',
};

/** El mensaje de trabajo es «ids — tarea[ — extra]»: la burbuja muestra solo la tarea. */
function tareaDe(detalle: string): string {
  const partes = detalle.split(' — ');
  return (partes.length > 1 ? partes[1]! : detalle).replace(/\.$/, '');
}

const ALERTA = /devolvió|^falló|registró un fallo|no pudo|cortó un bucle|error/i;
const FIN = /^corrida (terminada|detenida|pausada|error|cancelada)|^cerró/;
const ENTREGA = /^terminó su tarea|aprobó$|^guardó el prospecto/;

export function siguienteEnFlujo(flujo: readonly string[], agente: string): string | null {
  const i = flujo.indexOf(agente);
  return i >= 0 && i + 1 < flujo.length ? (flujo[i + 1] as string) : null;
}
export function anteriorEnFlujo(flujo: readonly string[], agente: string): string | null {
  const i = flujo.indexOf(agente);
  return i > 0 ? (flujo[i - 1] as string) : null;
}

function recortar(t: string, n = 46): string {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function interpretarEvento(
  e: EventoOficina,
  flujo: readonly string[],
  presentacion = false,
): Interpretacion {
  const alerta = ALERTA.test(e.accion);
  const fin = FIN.test(e.accion);
  const fija = ACCIONES.find(([re]) => re.test(e.accion));
  let burbuja = fija && fija[1] ? fija[1] : e.accion.charAt(0).toUpperCase() + e.accion.slice(1);
  const terminada = /^terminó su tarea/.test(e.accion);
  if (terminada) burbuja = TERMINADO[e.agente] ?? burbuja;
  else if (!presentacion && e.detalle)
    burbuja = `${burbuja} · ${/^recibió una tarea/.test(e.accion) ? tareaDe(e.detalle) : e.detalle}`;
  let traslado: Traslado | null = null;
  if (/devolvió$/.test(e.accion)) {
    const a = anteriorEnFlujo(flujo, e.agente);
    if (a) traslado = { de: e.agente, a, tipo: 'devolucion' };
  } else if (ENTREGA.test(e.accion)) {
    const a = siguienteEnFlujo(flujo, e.agente);
    if (a) traslado = { de: e.agente, a, tipo: 'entrega' };
  }
  if (terminada && traslado?.tipo === 'entrega') burbuja = `${burbuja} → ${traslado.a}`;
  return {
    agente: e.agente,
    estado: alerta ? 'alerta' : fin ? 'inactivo' : 'trabajando',
    burbuja: recortar(burbuja, 58),
    traslado,
  };
}

export interface RegistroAgente {
  estado: Interpretacion['estado'];
  burbuja: string;
  t: number;
}

export const ACTIVO_MS = 25000;
export const ALERTA_MS = 7000;

/** Estado visible en un instante: la actividad caduca; en pausa todos descansan. */
export function estadoVisible(
  r: RegistroAgente | undefined,
  ahora: number,
  enPausa: boolean,
  caminando = false,
): EstadoAgente {
  if (caminando) return 'caminando';
  if (enPausa) return 'pausa';
  if (!r) return 'inactivo';
  const edad = ahora - r.t;
  if (r.estado === 'alerta' && edad < ALERTA_MS) return 'alerta';
  if (r.estado !== 'inactivo' && edad < ACTIVO_MS) return 'trabajando';
  return 'inactivo';
}

/** La oficina está en pausa si no hay corrida activa ni actividad reciente. */
export function oficinaEnPausa(
  corridaActiva: boolean,
  registros: Record<string, RegistroAgente>,
  ahora: number,
): boolean {
  if (corridaActiva) return false;
  return !Object.values(registros).some((r) => ahora - r.t < ACTIVO_MS && r.estado !== 'inactivo');
}

export const ETIQUETA_ESTADO: Record<EstadoAgente, string> = {
  inactivo: 'En su lugar',
  trabajando: 'Trabajando',
  caminando: 'Entregando un expediente',
  alerta: 'Atendiendo una devolución',
  pausa: 'En pausa',
};
