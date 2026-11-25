// Dominio compartido entre servidor, MCP y web.

export const ESTADOS_PROSPECTO = [
  'Nuevo',
  'Calificado',
  'Reportado',
  'Canalizado',
  'En contacto',
  'Propuesta',
  'Ganado',
  'Perdido',
  'Descartado',
  'Revision humana',
] as const;
export type EstadoProspecto = (typeof ESTADOS_PROSPECTO)[number];

/** Estados que SOLO puede poner el dueño. La API los rechaza si vienen de un agente. */
export const ESTADOS_SOLO_DUENO: readonly EstadoProspecto[] = [
  'Canalizado',
  'En contacto',
  'Propuesta',
  'Ganado',
  'Perdido',
  'Descartado',
];

export const ETAPAS_EMPRESA = [
  'descubierta',
  'filtrada',
  'enriquecida',
  'analizada',
  'prospecto',
  'descartada',
] as const;
export type EtapaEmpresa = (typeof ETAPAS_EMPRESA)[number];

export const METODOS_DESCUBRIMIENTO = [
  'places',
  'nicho_web',
  'directorio_publico',
  'parque_industrial',
  'noticia_expansion',
  'hallazgo_oportunista',
  'referido',
  'manual',
] as const;
export type MetodoDescubrimiento = (typeof METODOS_DESCUBRIMIENTO)[number];

export const NIVELES = ['A', 'B', 'C'] as const;
export type Nivel = (typeof NIVELES)[number];

export type Actor = 'owner' | 'agent';

export const AGENTES = [
  'Cartografo',
  'Explorador',
  'Guardian',
  'Rastreador',
  'Analista',
  'Estratega',
  'Armador',
  'QA-1',
  'Calificador',
  'Redactor',
  'QA-2',
  'Coordinador',
  'Analista Semanal',
] as const;
export type Agente = (typeof AGENTES)[number];

export function nivelPorScore(score: number): Nivel {
  if (score >= 75) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

export function puedeCambiarEstado(actor: Actor, destino: EstadoProspecto): boolean {
  if (actor === 'owner') return true;
  return !ESTADOS_SOLO_DUENO.includes(destino);
}

/** Detecta menciones de precio/costo en texto de agentes (regla: los agentes no hablan de precios). */
const PRECIO_RE =
  /(\$\s?\d|\bMXN\b|\bUSD\b|\bpesos?\b|\bd[oó]lares?\b|\bprecios?\b|\bcostos?\b|\bcotiz|\bdescuentos?\b|\b\d+\s?%\s?de descuento)/i;
export function mencionaPrecio(texto: string): boolean {
  return PRECIO_RE.test(texto);
}
