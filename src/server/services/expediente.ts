import type { Db } from '../db';

/**
 * Expediente compacto de una empresa para los agentes de análisis, revisión y redacción.
 * Solo lectura. Es el único canal por el que un agente ve lo que hicieron los anteriores
 * (los mensajes entre agentes llevan solo ids).
 */
export function expedienteEmpresa(db: Db, empresaId: number): unknown | null {
  const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a);
  const e = db
    .prepare(
      `SELECT e.id, e.nombre, e.etapa, e.descartada_motivo, e.metodo_descubrimiento, e.origen_url,
         e.origen_nota, e.direccion, e.municipio, e.codigo_postal, e.estado_mx, e.zona, e.sitio_web,
         e.sitio_verificado, e.tamano, e.sucursales, e.resumen, g.nombre AS giro
       FROM empresas e LEFT JOIN taxonomia_giros g ON g.id = e.giro_id WHERE e.id = ?`,
    )
    .get(empresaId) as { id: number } | undefined;
  if (!e) return null;
  const p = db
    .prepare(
      `SELECT id AS prospecto_id, estado, score, nivel, score_desglose, justificacion, reporte_md,
         borrador_correo, devoluciones_qa1, devoluciones_qa2 FROM prospectos WHERE empresa_id = ?`,
    )
    .get(empresaId) as { prospecto_id: number } | undefined;
  return {
    empresa: e,
    contactos: q(
      'SELECT tipo, valor, nombre, puesto, fuente_url FROM contactos WHERE empresa_id = ? ORDER BY tipo, id',
      empresaId,
    ),
    necesidades: q('SELECT texto, tipo FROM necesidades WHERE empresa_id = ?', empresaId),
    prospecto: p ?? null,
    productos: p
      ? q(
          'SELECT marca, categoria, razon, prioridad FROM propuestas_producto WHERE prospecto_id = ?',
          p.prospecto_id,
        )
      : [],
    paquetes: p
      ? q(
          'SELECT nombre, componentes, argumento, dirigido_a FROM paquetes WHERE prospecto_id = ? ORDER BY orden',
          p.prospecto_id,
        )
      : [],
    revisiones_qa: p
      ? q(
          'SELECT etapa, aprobado, devolver_a, motivos FROM revisiones_qa WHERE prospecto_id = ? ORDER BY id',
          p.prospecto_id,
        )
      : [],
  };
}
