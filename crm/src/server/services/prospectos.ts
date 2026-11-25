import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import { nivelPorScore } from '../../shared/domain';
import type {
  propuestasInput,
  revisionQaInput,
  reporteInput,
  scoreInput,
} from '../../shared/schemas';
import { feedbackDeQa } from './feedback';

type Propuestas = z.infer<typeof propuestasInput>;

export function prospectoDeEmpresa(db: Db, empresaId: number, corridaId?: number): number {
  const existente = db.prepare('SELECT id FROM prospectos WHERE empresa_id = ?').get(empresaId) as
    { id: number } | undefined;
  if (existente) return existente.id;
  const emp = db.prepare('SELECT id FROM empresas WHERE id = ?').get(empresaId);
  if (!emp) throw new Error('Empresa no encontrada');
  const r = db
    .prepare('INSERT INTO prospectos (empresa_id, corrida_id) VALUES (?, ?)')
    .run(empresaId, corridaId ?? null);
  return Number(r.lastInsertRowid);
}

export function guardarPropuestas(db: Db, p: Propuestas): number {
  let id = 0;
  db.transaction(() => {
    id = prospectoDeEmpresa(db, p.empresa_id, p.corrida_id);
    db.prepare('DELETE FROM propuestas_producto WHERE prospecto_id = ?').run(id);
    db.prepare('DELETE FROM paquetes WHERE prospecto_id = ?').run(id);
    const insP = db.prepare(
      'INSERT INTO propuestas_producto (prospecto_id, marca, categoria, razon, prioridad) VALUES (?,?,?,?,?)',
    );
    for (const x of p.productos) insP.run(id, x.marca, x.categoria, x.razon, x.prioridad);
    const insK = db.prepare(
      'INSERT INTO paquetes (prospecto_id, nombre, componentes, argumento, dirigido_a, orden) VALUES (?,?,?,?,?,?)',
    );
    p.paquetes.forEach((k, i) =>
      insK.run(
        id,
        k.nombre,
        JSON.stringify(k.componentes),
        k.argumento,
        k.dirigido_a ?? null,
        i + 1,
      ),
    );
    db.prepare(
      "UPDATE empresas SET etapa='analizada', actualizado_en=? WHERE id=? AND etapa!='prospecto'",
    ).run(nowIso(), p.empresa_id);
  })();
  return id;
}

export function guardarScore(db: Db, s: z.infer<typeof scoreInput>): { nivel: string } {
  const nivel = nivelPorScore(s.score);
  const r = db
    .prepare(
      `UPDATE prospectos SET score=?, nivel=?, score_desglose=?, justificacion=?,
         estado=CASE WHEN estado='Nuevo' THEN 'Calificado' ELSE estado END, actualizado_en=? WHERE id=?`,
    )
    .run(
      s.score,
      nivel,
      JSON.stringify(s.score_desglose),
      s.justificacion,
      nowIso(),
      s.prospecto_id,
    );
  if (r.changes === 0) throw new Error('Prospecto no encontrado');
  return { nivel };
}

export function guardarReporte(db: Db, r: z.infer<typeof reporteInput>): void {
  const res = db
    .prepare('UPDATE prospectos SET reporte_md=?, borrador_correo=?, actualizado_en=? WHERE id=?')
    .run(r.reporte_md, r.borrador_correo, nowIso(), r.prospecto_id);
  if (res.changes === 0) throw new Error('Prospecto no encontrado');
}

export interface ResultadoQa {
  siguiente: 'aprobado' | 'devolver' | 'revision_humana';
  devoluciones: number;
  devolver_a?: string;
}

export function registrarQa(db: Db, q: z.infer<typeof revisionQaInput>): ResultadoQa {
  const col = q.etapa === 'qa1' ? 'devoluciones_qa1' : 'devoluciones_qa2';
  let out: ResultadoQa = { siguiente: 'aprobado', devoluciones: 0 };
  db.transaction(() => {
    const existe = db.prepare('SELECT 1 FROM prospectos WHERE id = ?').get(q.prospecto_id);
    if (!existe) throw new Error('Prospecto no encontrado');
    db.prepare(
      'INSERT INTO revisiones_qa (prospecto_id, etapa, aprobado, devolver_a, motivos) VALUES (?,?,?,?,?)',
    ).run(
      q.prospecto_id,
      q.etapa,
      q.aprobado ? 1 : 0,
      q.devolver_a ?? null,
      JSON.stringify(q.motivos ?? []),
    );
    if (q.aprobado) return;
    db.prepare(`UPDATE prospectos SET ${col} = ${col} + 1, actualizado_en=? WHERE id=?`).run(
      nowIso(),
      q.prospecto_id,
    );
    const n = (
      db.prepare(`SELECT ${col} AS n FROM prospectos WHERE id = ?`).get(q.prospecto_id) as {
        n: number;
      }
    ).n;
    if (n > 2) {
      db.prepare("UPDATE prospectos SET estado='Revision humana', actualizado_en=? WHERE id=?").run(
        nowIso(),
        q.prospecto_id,
      );
      out = { siguiente: 'revision_humana', devoluciones: n };
    } else {
      out = {
        siguiente: 'devolver',
        devoluciones: n,
        ...(q.devolver_a ? { devolver_a: q.devolver_a } : {}),
      };
    }
  })();
  // P6.5: cada revisión de QA queda como retroalimentación automática (no debe romper el flujo si falla).
  try {
    feedbackDeQa(db, q.prospecto_id, q.etapa, q.aprobado, q.devolver_a, q.motivos);
  } catch (e) {
    console.error('[feedback] no se pudo registrar la revisión de QA', e);
  }
  return out;
}

function ultimaQaAprobada(db: Db, prospectoId: number, etapa: string): boolean {
  const r = db
    .prepare(
      'SELECT aprobado FROM revisiones_qa WHERE prospecto_id=? AND etapa=? ORDER BY id DESC LIMIT 1',
    )
    .get(prospectoId, etapa) as { aprobado: number } | undefined;
  return r?.aprobado === 1;
}

export type ResultadoFinalizar =
  | { ok: true; envios_creados: number; sin_destinatarios: boolean }
  | { ok: false; razones: string[] };

/** Guarda primero, avisa después: marca Reportado y deja los envíos en cola (outbox). */
export function finalizarProspecto(db: Db, prospectoId: number): ResultadoFinalizar {
  const p = db
    .prepare('SELECT id, empresa_id, score, reporte_md, estado FROM prospectos WHERE id = ?')
    .get(prospectoId) as
    | {
        id: number;
        empresa_id: number;
        score: number | null;
        reporte_md: string | null;
        estado: string;
      }
    | undefined;
  if (!p) return { ok: false, razones: ['Prospecto no encontrado'] };
  const razones: string[] = [];
  if (p.estado === 'Revision humana') razones.push('El prospecto está en revisión humana');
  if (!ultimaQaAprobada(db, prospectoId, 'qa1')) razones.push('Falta aprobación de QA-1');
  if (!ultimaQaAprobada(db, prospectoId, 'qa2')) razones.push('Falta aprobación de QA-2');
  if (p.score === null) razones.push('Falta el score');
  if (!p.reporte_md) razones.push('Falta el reporte');
  const contactos = db
    .prepare(
      "SELECT COUNT(*) AS n FROM contactos WHERE empresa_id=? AND tipo IN ('telefono','correo')",
    )
    .get(p.empresa_id) as { n: number };
  if (contactos.n === 0) razones.push('No hay teléfono ni correo de contacto con fuente');
  if (razones.length > 0) return { ok: false, razones };

  let creados = 0;
  const destinatarios = db
    .prepare('SELECT email FROM destinatarios_internos WHERE activo = 1')
    .all() as { email: string }[];
  db.transaction(() => {
    const ahora = nowIso();
    db.prepare(
      `UPDATE prospectos SET estado = CASE WHEN estado IN ('Nuevo','Calificado') THEN 'Reportado' ELSE estado END,
         reportado_en=COALESCE(reportado_en, ?), actualizado_en=? WHERE id=?`,
    ).run(ahora, ahora, prospectoId);
    db.prepare("UPDATE empresas SET etapa='prospecto', actualizado_en=? WHERE id=?").run(
      ahora,
      p.empresa_id,
    );
    const ins = db.prepare('INSERT INTO envios_email (prospecto_id, destinatario) VALUES (?, ?)');
    for (const d of destinatarios) {
      const ya = db
        .prepare('SELECT 1 FROM envios_email WHERE prospecto_id=? AND destinatario=?')
        .get(prospectoId, d.email);
      if (!ya) {
        ins.run(prospectoId, d.email);
        creados++;
      }
    }
  })();
  return { ok: true, envios_creados: creados, sin_destinatarios: destinatarios.length === 0 };
}
