import type { Db } from '../db';

/**
 * Expediente compacto de una empresa para los agentes de análisis, revisión y redacción.
 * Solo lectura. Es el único canal por el que un agente ve lo que hicieron los anteriores
 * (los mensajes entre agentes llevan solo ids).
 */
const rec = (t: unknown, n: number): unknown =>
  typeof t === 'string' && t.length > n ? `${t.slice(0, n)}… [recortado]` : t;
const recortar = <T extends Record<string, unknown>>(o: T, tope: Record<string, number>): T => {
  const c: Record<string, unknown> = { ...o };
  for (const [k, n] of Object.entries(tope)) if (k in c) c[k] = rec(c[k], n);
  return c as T;
};

/** `secciones` filtra lo que se devuelve; los textos largos se recortan (los agentes pagan por cada token que leen). */
export function expedienteEmpresa(
  db: Db,
  empresaId: number,
  secciones?: string[],
): Record<string, unknown> | null {
  const todo = expedienteCompleto(db, empresaId);
  if (!todo || !secciones || secciones.length === 0) return todo;
  const pedidas = new Set(secciones);
  return Object.fromEntries(Object.entries(todo).filter(([k]) => pedidas.has(k)));
}

function expedienteCompleto(db: Db, empresaId: number): Record<string, unknown> | null {
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
    empresa: recortar(e as Record<string, unknown>, { resumen: 700, origen_nota: 300 }),
    contactos: q(
      'SELECT tipo, valor, nombre, puesto, fuente_url FROM contactos WHERE empresa_id = ? ORDER BY tipo, id',
      empresaId,
    ),
    necesidades: (
      q('SELECT texto, tipo FROM necesidades WHERE empresa_id = ?', empresaId) as Record<
        string,
        unknown
      >[]
    ).map((n) => recortar(n, { texto: 300 })),
    prospecto: p
      ? recortar(p as Record<string, unknown>, {
          justificacion: 500,
          reporte_md: 4000,
          borrador_correo: 1800,
        })
      : null,
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
