import type { Db } from '../db';
import { escalar, type Params, type Workflow } from './workflow';

export interface CorridaFila {
  id: number;
  office_id: string;
  estado: string;
  params: Params;
}

/** Corrida con sus parámetros genéricos (JSON). El motor no conoce el significado de cada parámetro. */
export function leerCorrida(db: Db, id: number): CorridaFila | undefined {
  const r = db
    .prepare('SELECT id, office_id, estado, params FROM corridas WHERE id = ?')
    .get(id) as
    { id: number; office_id: string; estado: string; params: string | null } | undefined;
  if (!r) return undefined;
  let params: Params = {};
  try {
    params = r.params ? (JSON.parse(r.params) as Params) : {};
  } catch {
    /* params mal formados: se tratan como vacíos */
  }
  return { id: r.id, office_id: r.office_id, estado: r.estado, params };
}

export interface ValorProgreso {
  id: string;
  etiqueta: string;
  valor: number;
}

/** Contadores de progreso definidos por el workflow (consultas de solo lectura). */
export function progresoDe(db: Db, wf: Workflow, c: CorridaFila): ValorProgreso[] {
  const meta = Number(c.params[wf.tope_items] ?? 0);
  return wf.progreso.map((p) => ({
    id: p.id,
    etiqueta: p.etiqueta,
    valor: Number(escalar(db, p.sql, { corrida: c.id, meta, item: null }) ?? 0),
  }));
}
