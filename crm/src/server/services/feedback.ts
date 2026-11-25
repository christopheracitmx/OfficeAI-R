import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import {
  AGENTE_DE_ETAPA,
  ETIQUETAS_POR_DEFECTO,
  type feedbackInput,
} from '../../shared/aprendizaje';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export interface FilaFeedback {
  id: number;
  office_id: string;
  prospecto_id: number | null;
  empresa_id: number | null;
  etapa: string;
  agente: string | null;
  valor: number;
  etiqueta: string | null;
  nota: string | null;
  origen: string;
  creado_en: string;
}

function insertar(db: Db, f: Omit<FilaFeedback, 'id' | 'creado_en'>): number {
  return Number(
    db
      .prepare(
        `INSERT INTO feedback (office_id, prospecto_id, empresa_id, etapa, agente, valor, etiqueta, nota, origen, creado_en)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        f.office_id,
        f.prospecto_id,
        f.empresa_id,
        f.etapa,
        f.agente,
        f.valor,
        f.etiqueta?.slice(0, 80) ?? null,
        f.nota?.slice(0, 500) ?? null,
        f.origen,
        nowIso(),
      ).lastInsertRowid,
  );
}

const empresaDe = (db: Db, prospectoId: number): number | null =>
  (
    db.prepare('SELECT empresa_id FROM prospectos WHERE id = ?').get(prospectoId) as
      { empresa_id: number } | undefined
  )?.empresa_id ?? null;

/** 👍/👎 manual del dueño sobre una etapa del prospecto (o «error de agente X»). */
export function registrarFeedbackManual(db: Db, i: z.infer<typeof feedbackInput>): number {
  const empresa = empresaDe(db, i.prospecto_id);
  if (empresa === null) throw new KbError(404, 'Prospecto no encontrado');
  const agente = i.agente ?? AGENTE_DE_ETAPA[i.etapa];
  if (i.agente) {
    const existe = db
      .prepare('SELECT 1 FROM agentes WHERE office_id = ? AND id = ?')
      .get(i.office_id, i.agente);
    if (!existe) throw new KbError(400, `Agente desconocido: ${i.agente}`);
  }
  return insertar(db, {
    office_id: i.office_id,
    prospecto_id: i.prospecto_id,
    empresa_id: empresa,
    etapa: i.etapa,
    agente,
    valor: i.valor,
    etiqueta: i.etiqueta ?? null,
    nota: i.nota ?? null,
    origen: 'manual',
  });
}

/** Captura automática: cada revisión de QA (aprobada o devuelta, con motivos). */
export function feedbackDeQa(
  db: Db,
  prospectoId: number,
  etapa: 'qa1' | 'qa2',
  aprobado: boolean,
  devolverA: string | null | undefined,
  motivos: string[] | undefined,
): void {
  const qa = etapa === 'qa1' ? 'QA-1' : 'QA-2';
  insertar(db, {
    office_id: 'prospeccion',
    prospecto_id: prospectoId,
    empresa_id: empresaDe(db, prospectoId),
    etapa,
    // Aprobada: acierto de quien revisa; devuelta: el error se atribuye a quien debe corregir.
    agente: aprobado ? qa : (devolverA ?? qa),
    valor: aprobado ? 1 : -1,
    etiqueta: aprobado ? 'QA aprobó' : (motivos?.[0]?.slice(0, 80) ?? 'QA devolvió'),
    nota: aprobado ? null : (motivos ?? []).join(' | ').slice(0, 500) || null,
    origen: 'qa',
  });
}

const VALOR_RESULTADO: Record<string, number> = {
  Ganado: 1,
  Propuesta: 1,
  'En contacto': 1,
  Canalizado: 0,
  Perdido: -1,
  Descartado: -1,
};

/** Captura automática: resultado que el dueño pone al prospecto (con su motivo y el score que tenía). */
export function feedbackDeResultado(
  db: Db,
  prospectoId: number,
  estado: string,
  motivo?: string,
): void {
  const valor = VALOR_RESULTADO[estado];
  if (valor === undefined) return;
  const p = db.prepare('SELECT score, nivel FROM prospectos WHERE id = ?').get(prospectoId) as
    { score: number | null; nivel: string | null } | undefined;
  const repetido = db
    .prepare(
      "SELECT 1 FROM feedback WHERE prospecto_id = ? AND origen = 'resultado' AND etiqueta = ? AND id = (SELECT MAX(id) FROM feedback WHERE prospecto_id = ? AND origen = 'resultado')",
    )
    .get(prospectoId, estado, prospectoId);
  if (repetido) return;
  const score =
    p?.score != null ? `score ${p.score}${p.nivel ? ` (${p.nivel})` : ''}` : 'sin score';
  insertar(db, {
    office_id: 'prospeccion',
    prospecto_id: prospectoId,
    empresa_id: empresaDe(db, prospectoId),
    etapa: 'resultado',
    agente: 'Calificador',
    valor,
    etiqueta: estado,
    nota: [score, motivo].filter(Boolean).join(' · '),
    origen: 'resultado',
  });
}

export interface FiltroFeedback {
  agente?: string | undefined;
  origen?: string | undefined;
  prospecto_id?: number | undefined;
  limit?: number | undefined;
}

export function listarFeedback(db: Db, office: string, f: FiltroFeedback = {}): FilaFeedback[] {
  const where = ['office_id = ?'];
  const params: unknown[] = [office];
  if (f.agente) {
    where.push('agente = ?');
    params.push(f.agente);
  }
  if (f.origen) {
    where.push('origen = ?');
    params.push(f.origen);
  }
  if (f.prospecto_id) {
    where.push('prospecto_id = ?');
    params.push(f.prospecto_id);
  }
  return db
    .prepare(`SELECT * FROM feedback WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`)
    .all(...params, Math.min(f.limit ?? 100, 500)) as FilaFeedback[];
}

export function leerEtiquetas(db: Db): string[] {
  const fila = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'feedback_etiquetas'")
    .get() as { valor: string } | undefined;
  if (!fila) return [...ETIQUETAS_POR_DEFECTO];
  try {
    const v = JSON.parse(fila.valor) as unknown;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  } catch {
    /* valor corrupto: usa las de fábrica */
  }
  return [...ETIQUETAS_POR_DEFECTO];
}

export function guardarEtiquetas(db: Db, etiquetas: string[]): string[] {
  const limpias = [...new Set(etiquetas.map((e) => e.trim()).filter((e) => e.length > 0))]
    .map((e) => e.slice(0, 80))
    .slice(0, 30);
  db.prepare(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ('feedback_etiquetas', ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`,
  ).run(JSON.stringify(limpias), nowIso());
  registrarCambio(
    db,
    'prospeccion',
    'feedback',
    'etiquetas',
    'editó las etiquetas',
    `${limpias.length} etiquetas`,
  );
  return limpias;
}
