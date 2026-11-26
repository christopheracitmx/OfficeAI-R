import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import type { Actor, EstadoProspecto } from '../../shared/domain';
import { ESTADOS_PROSPECTO, puedeCambiarEstado } from '../../shared/domain';
import type { prospectoPatch } from '../../shared/schemas';
import { feedbackDeResultado } from './feedback';

export interface FiltrosProspectos {
  estado?: string;
  nivel?: string;
  zona?: string;
  giro?: string;
  metodo?: string;
  sinVer?: boolean;
  q?: string;
  /** Oficina dueña de los prospectos (por defecto la de prospección: es la única que los produce). */
  office_id?: string;
}

export function listarProspectos(db: Db, f: FiltrosProspectos): unknown[] {
  const where: string[] = ['p.office_id = ?'];
  const params: unknown[] = [f.office_id ?? 'prospeccion'];
  if (f.estado) {
    where.push('p.estado = ?');
    params.push(f.estado);
  }
  if (f.nivel) {
    where.push('p.nivel = ?');
    params.push(f.nivel);
  }
  if (f.zona) {
    where.push('e.zona = ?');
    params.push(f.zona);
  }
  if (f.giro) {
    where.push('g.nombre = ?');
    params.push(f.giro);
  }
  if (f.metodo) {
    where.push('e.metodo_descubrimiento = ?');
    params.push(f.metodo);
  }
  if (f.sinVer) where.push('p.visto_por_dueno = 0');
  if (f.q) {
    where.push('(lower(e.nombre) LIKE ? OR e.dominio LIKE ?)');
    params.push(`%${f.q.toLowerCase()}%`, `%${f.q.toLowerCase()}%`);
  }
  return db
    .prepare(
      `SELECT p.id, p.estado, p.score, p.nivel, p.canalizado_a, p.visto_por_dueno, p.reportado_en,
         p.creado_en, e.id AS empresa_id, e.nombre AS empresa, e.municipio, e.zona, e.sitio_web,
         e.sitio_verificado, e.metodo_descubrimiento, g.nombre AS giro,
         (SELECT estado FROM envios_email x WHERE x.prospecto_id = p.id
            ORDER BY (x.estado='fallido') DESC, x.id DESC LIMIT 1) AS correo_estado
       FROM prospectos p JOIN empresas e ON e.id = p.empresa_id
       LEFT JOIN taxonomia_giros g ON g.id = e.giro_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY p.visto_por_dueno ASC, COALESCE(p.score, -1) DESC, p.id DESC LIMIT 500`,
    )
    .all(...params);
}

export function detalleProspecto(db: Db, id: number): unknown | null {
  const p = db
    .prepare(
      `SELECT p.*, e.nombre AS empresa, e.direccion, e.municipio, e.zona, e.estado_mx, e.sitio_web,
         e.sitio_verificado, e.tamano, e.sucursales, e.resumen, e.metodo_descubrimiento, e.origen_url,
         e.origen_nota, e.id AS empresa_id, g.nombre AS giro
       FROM prospectos p JOIN empresas e ON e.id = p.empresa_id
       LEFT JOIN taxonomia_giros g ON g.id = e.giro_id WHERE p.id = ?`,
    )
    .get(id) as { empresa_id: number } | undefined;
  if (!p) return null;
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a);
  return {
    ...p,
    contactos: q('SELECT * FROM contactos WHERE empresa_id = ? ORDER BY tipo, id', p.empresa_id),
    necesidades: q('SELECT texto, tipo FROM necesidades WHERE empresa_id = ?', p.empresa_id),
    productos: q(
      'SELECT marca, categoria, razon, prioridad FROM propuestas_producto WHERE prospecto_id = ?',
      id,
    ),
    paquetes: q(
      'SELECT nombre, componentes, argumento, dirigido_a, orden FROM paquetes WHERE prospecto_id = ? ORDER BY orden',
      id,
    ),
    revisiones: q(
      'SELECT etapa, aprobado, devolver_a, motivos, creado_en FROM revisiones_qa WHERE prospecto_id = ? ORDER BY id',
      id,
    ),
    envios: q(
      'SELECT id, destinatario, estado, error, intentos, actualizado_en FROM envios_email WHERE prospecto_id = ? ORDER BY id',
      id,
    ),
    actividad: q(
      "SELECT agente, accion, detalle, creado_en FROM actividad_agentes WHERE entidad='empresa' AND entidad_id = ? ORDER BY id DESC LIMIT 40",
      p.empresa_id,
    ),
  };
}

export type ResultadoPatch = { ok: true } | { ok: false; status: number; error: string };

export function patchProspecto(
  db: Db,
  id: number,
  actor: Actor,
  patch: z.infer<typeof prospectoPatch>,
): ResultadoPatch {
  const actual = db.prepare('SELECT estado, empresa_id FROM prospectos WHERE id = ?').get(id) as
    { estado: EstadoProspecto; empresa_id: number } | undefined;
  if (!actual) return { ok: false, status: 404, error: 'Prospecto no encontrado' };
  if (patch.estado && !ESTADOS_PROSPECTO.includes(patch.estado))
    return { ok: false, status: 400, error: 'Estado inválido' };
  if (patch.estado && !puedeCambiarEstado(actor, patch.estado))
    return { ok: false, status: 403, error: `Solo el dueño puede poner el estado ${patch.estado}` };
  if ((patch.estado === 'Perdido' || patch.estado === 'Descartado') && !patch.motivo)
    return { ok: false, status: 400, error: 'Indica el motivo para Perdido o Descartado' };
  const sets: string[] = ['actualizado_en = ?'];
  const params: unknown[] = [nowIso()];
  if (patch.estado) {
    sets.push('estado = ?');
    params.push(patch.estado);
  }
  if (patch.canalizado_a !== undefined) {
    sets.push('canalizado_a = ?');
    params.push(patch.canalizado_a);
  }
  if (patch.notas_dueno !== undefined) {
    sets.push('notas_dueno = ?');
    params.push(patch.notas_dueno);
  }
  if (patch.visto_por_dueno !== undefined) {
    sets.push('visto_por_dueno = ?');
    params.push(patch.visto_por_dueno ? 1 : 0);
  }
  db.transaction(() => {
    db.prepare(`UPDATE prospectos SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    if (patch.estado === 'Descartado') {
      db.prepare(
        "UPDATE empresas SET etapa='descartada', descartada_motivo=?, actualizado_en=? WHERE id=?",
      ).run(patch.motivo ?? 'sin_motivo', nowIso(), actual.empresa_id);
    }
  })();
  if (patch.estado && actor === 'owner') feedbackDeResultado(db, id, patch.estado, patch.motivo);
  return { ok: true };
}

export function listarDirectorio(
  db: Db,
  f: { etapa?: string; metodo?: string; zona?: string; q?: string; office_id?: string },
): unknown[] {
  const where: string[] = ['e.fusionada_con IS NULL', 'e.office_id = ?'];
  const params: unknown[] = [f.office_id ?? 'prospeccion'];
  if (f.etapa) {
    where.push('e.etapa = ?');
    params.push(f.etapa);
  }
  if (f.metodo) {
    where.push('e.metodo_descubrimiento = ?');
    params.push(f.metodo);
  }
  if (f.zona) {
    where.push('e.zona = ?');
    params.push(f.zona);
  }
  if (f.q) {
    where.push('lower(e.nombre) LIKE ?');
    params.push(`%${f.q.toLowerCase()}%`);
  }
  return db
    .prepare(
      `SELECT e.id, e.nombre, e.etapa, e.zona, e.municipio, e.sitio_web, e.metodo_descubrimiento,
         e.origen_url, e.origen_nota, e.descartada_motivo, e.creado_en, g.nombre AS giro,
         e.telefono, e.correo, e.scian, e.personal_est, e.tamano,
         (SELECT group_concat(DISTINCT f.atribucion) FROM empresa_fuentes f WHERE f.empresa_id = e.id) AS atribuciones
       FROM empresas e LEFT JOIN taxonomia_giros g ON g.id = e.giro_id
       WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT 1000`,
    )
    .all(...params);
}

export function dashboard(db: Db): Record<string, unknown> {
  const one = (sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as Record<string, number>;
  const all = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a);
  const mes = new Date().toISOString().slice(0, 7);
  return {
    semana: one(
      "SELECT COUNT(*) AS n FROM prospectos WHERE reportado_en >= datetime('now','-7 days')",
    ).n,
    semana_anterior: one(
      "SELECT COUNT(*) AS n FROM prospectos WHERE reportado_en >= datetime('now','-14 days') AND reportado_en < datetime('now','-7 days')",
    ).n,
    nivel_a_pendientes: one(
      "SELECT COUNT(*) AS n FROM prospectos WHERE nivel='A' AND estado IN ('Calificado','Reportado')",
    ).n,
    canalizados_mes: one(
      "SELECT COUNT(*) AS n FROM prospectos WHERE estado IN ('Canalizado','En contacto','Propuesta','Ganado','Perdido') AND actualizado_en >= date('now','start of month')",
    ).n,
    ganados_mes: one(
      "SELECT COUNT(*) AS n FROM prospectos WHERE estado='Ganado' AND actualizado_en >= date('now','start of month')",
    ).n,
    sin_ver: one(
      'SELECT COUNT(*) AS n FROM prospectos WHERE visto_por_dueno = 0 AND reportado_en IS NOT NULL',
    ).n,
    correos_fallidos: one(
      "SELECT COUNT(DISTINCT prospecto_id) AS n FROM envios_email WHERE estado='fallido'",
    ).n,
    por_semana: all(
      `SELECT strftime('%Y-%W', reportado_en) AS semana, COUNT(*) AS n FROM prospectos
       WHERE reportado_en IS NOT NULL AND reportado_en >= datetime('now','-56 days') GROUP BY semana ORDER BY semana`,
    ),
    embudo: all('SELECT estado, COUNT(*) AS n FROM prospectos GROUP BY estado'),
    por_giro: all(
      `SELECT COALESCE(g.nombre,'Sin giro') AS etiqueta, COUNT(*) AS n FROM prospectos p
       JOIN empresas e ON e.id=p.empresa_id LEFT JOIN taxonomia_giros g ON g.id=e.giro_id
       GROUP BY etiqueta ORDER BY n DESC LIMIT 5`,
    ),
    por_zona: all(
      `SELECT COALESCE(e.zona,'Sin zona') AS etiqueta, COUNT(*) AS n FROM prospectos p
       JOIN empresas e ON e.id=p.empresa_id GROUP BY etiqueta ORDER BY n DESC LIMIT 5`,
    ),
    ultimos: all(
      `SELECT p.id, e.nombre AS empresa, p.score, p.nivel, p.estado FROM prospectos p
       JOIN empresas e ON e.id=p.empresa_id ORDER BY p.id DESC LIMIT 5`,
    ),
    directorio_pendiente: one(
      "SELECT COUNT(*) AS n FROM empresas WHERE etapa IN ('descubierta','filtrada','enriquecida')",
    ).n,
    directorio_por_metodo: all(
      'SELECT metodo_descubrimiento AS metodo, COUNT(*) AS n FROM empresas GROUP BY metodo_descubrimiento ORDER BY n DESC',
    ),
    places: {
      mes,
      usado:
        (
          db.prepare("SELECT contador FROM places_uso WHERE mes=? AND sku='pro'").get(mes) as
            { contador: number } | undefined
        )?.contador ?? 0,
      tope: Number(
        (
          db.prepare("SELECT valor FROM configuracion WHERE clave='places_tope_pro'").get() as {
            valor: string;
          }
        ).valor,
      ),
    },
  };
}
