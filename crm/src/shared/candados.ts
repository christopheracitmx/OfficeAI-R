/**
 * Candados base de todo piso nuevo. Viven en CÓDIGO (no se editan desde los prompts). Tres son fijos;
 * los topes de consumo se pueden relajar solo con confirmación explícita del dueño (queda en el registro de cambios).
 */
export interface CandadoDef {
  id: string;
  titulo: string;
  texto: string;
  relajable: boolean;
}

export const CANDADOS: readonly CandadoDef[] = [
  {
    id: 'sin_contacto_externo',
    titulo: 'Sin contacto externo',
    texto: 'Los agentes jamás escriben ni responden a personas u organizaciones externas.',
    relajable: false,
  },
  {
    id: 'sin_borrado',
    titulo: 'Sin borrado',
    texto: 'Nada se borra: los datos se archivan y los archivos van a cuarentena reversible.',
    relajable: false,
  },
  {
    id: 'solo_internos',
    titulo: 'Solo destinos internos',
    texto: 'Los avisos solo llegan a destinatarios internos de la lista permitida.',
    relajable: false,
  },
  {
    id: 'topes_consumo',
    titulo: 'Topes de consumo',
    texto: 'Límites de elementos por corrida, turnos y pasos para cuidar el plan.',
    relajable: true,
  },
];

export const RELAJABLES: readonly string[] = CANDADOS.filter((c) => c.relajable).map((c) => c.id);

export interface Topes {
  max_items: number;
  max_turnos: number;
  max_lecturas: number;
  pasos_por_item: number;
  max_pasos: number;
  max_agentes: number;
}

export const TOPES_BASE: Topes = {
  max_items: 20,
  max_turnos: 12,
  max_lecturas: 10,
  pasos_por_item: 8,
  max_pasos: 8,
  max_agentes: 12,
};

export const TOPES_RELAJADOS: Topes = {
  max_items: 100,
  max_turnos: 25,
  max_lecturas: 30,
  pasos_por_item: 20,
  max_pasos: 12,
  max_agentes: 20,
};

export const topesPara = (relajados: readonly string[]): Topes =>
  relajados.includes('topes_consumo') ? TOPES_RELAJADOS : TOPES_BASE;
