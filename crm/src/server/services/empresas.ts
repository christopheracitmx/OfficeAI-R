import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import type { contactoInput, empresaInput, etapaInput, fichaInput } from '../../shared/schemas';
import { derivarZona, enZonaPiloto, norm } from './zona';

type EmpresaIn = z.infer<typeof empresaInput>;

export const GOBIERNO_RE =
  /(gobierno|ayuntamiento|municipio de|secretar[ií]a de|instituto mexicano|\bimss\b|\bissste\b|\bsat\b|dependencia|h\. ?congreso|presidencia municipal|delegaci[oó]n pol[ií]tica|alcald[ií]a de|\bcfe\b|\bpemex\b)/i;

export type ResultadoUpsert =
  | { status: 'creada' | 'existente'; id: number; duplicada_de?: number }
  | { status: 'rechazada'; motivo: 'gobierno' | 'no_contactar' | 'fuera_de_zona_piloto' };

export function dominioDe(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function zonasPiloto(db: Db): string[] {
  const r = db.prepare("SELECT valor FROM configuracion WHERE clave='zonas_piloto'").get() as
    { valor: string } | undefined;
  return r ? (JSON.parse(r.valor) as string[]) : ['CDMX', 'Estado de México'];
}

export function enNoContactar(db: Db, nombre: string, dominio: string | null): boolean {
  const filas = db.prepare('SELECT tipo, valor FROM no_contactar').all() as {
    tipo: string;
    valor: string;
  }[];
  return filas.some(
    (f) =>
      (f.tipo === 'dominio' && dominio !== null && dominio === f.valor.toLowerCase()) ||
      (f.tipo === 'nombre' && norm(nombre).includes(norm(f.valor))),
  );
}

export function upsertEmpresa(db: Db, input: EmpresaIn): ResultadoUpsert {
  const dominio = dominioDe(input.sitio_web);
  if (GOBIERNO_RE.test(input.nombre)) return { status: 'rechazada', motivo: 'gobierno' };
  if (enNoContactar(db, input.nombre, dominio))
    return { status: 'rechazada', motivo: 'no_contactar' };
  const zona = derivarZona(input.direccion);
  if (input.direccion && !enZonaPiloto(zona.estado_mx, zonasPiloto(db)))
    return { status: 'rechazada', motivo: 'fuera_de_zona_piloto' };

  const previa =
    (input.place_id
      ? (db.prepare('SELECT id FROM empresas WHERE place_id = ?').get(input.place_id) as
          { id: number } | undefined)
      : undefined) ??
    (dominio
      ? (db
          .prepare('SELECT id FROM empresas WHERE dominio = ? AND fusionada_con IS NULL')
          .get(dominio) as { id: number } | undefined)
      : undefined) ??
    (db
      .prepare('SELECT id FROM empresas WHERE lower(nombre) = lower(?) AND fusionada_con IS NULL')
      .get(input.nombre) as { id: number } | undefined);
  if (previa) return { status: 'existente', id: previa.id };

  const giro = input.giro
    ? (db
        .prepare('SELECT id FROM taxonomia_giros WHERE nombre = ? COLLATE NOCASE')
        .get(input.giro) as { id: number } | undefined)
    : undefined;
  const ahora = nowIso();
  const r = db
    .prepare(
      `INSERT INTO empresas (place_id, nombre, metodo_descubrimiento, origen_url, origen_nota, etapa,
         giro_id, direccion, municipio, codigo_postal, ciudad, estado_mx, zona, sitio_web, dominio,
         corrida_id, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, 'descubierta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.place_id ?? null,
      input.nombre,
      input.metodo_descubrimiento,
      input.origen_url ?? null,
      input.origen_nota ?? null,
      giro?.id ?? null,
      input.direccion ?? null,
      zona.municipio,
      zona.codigo_postal,
      zona.ciudad,
      zona.estado_mx,
      zona.zona,
      input.sitio_web ?? null,
      dominio,
      input.corrida_id ?? null,
      ahora,
      ahora,
    );
  return { status: 'creada', id: Number(r.lastInsertRowid) };
}

export function buscarEnDirectorio(
  db: Db,
  q: { texto?: string; dominio?: string; consulta?: string; metodo?: string },
): { empresas: unknown[]; consulta_repetida: boolean } {
  const params: unknown[] = [];
  const where: string[] = ['fusionada_con IS NULL'];
  if (q.texto) {
    where.push('(lower(nombre) LIKE ? OR dominio LIKE ?)');
    params.push(`%${q.texto.toLowerCase()}%`, `%${q.texto.toLowerCase()}%`);
  }
  if (q.dominio) {
    where.push('dominio = ?');
    params.push(q.dominio.toLowerCase());
  }
  const empresas = db
    .prepare(
      `SELECT id, nombre, etapa, zona, sitio_web, dominio, metodo_descubrimiento FROM empresas
       WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 25`,
    )
    .all(...params);
  const repetida =
    q.consulta && q.metodo
      ? !!db
          .prepare('SELECT 1 FROM busquedas_realizadas WHERE metodo = ? AND consulta = ?')
          .get(q.metodo, q.consulta)
      : false;
  return { empresas, consulta_repetida: repetida };
}

export function registrarBusqueda(
  db: Db,
  b: { metodo: string; consulta: string; resultados: number; nuevas: number; corrida_id?: number },
): void {
  db.prepare(
    `INSERT INTO busquedas_realizadas (corrida_id, metodo, consulta, resultados, nuevas_empresas)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(metodo, consulta) DO UPDATE SET resultados=excluded.resultados,
       nuevas_empresas=excluded.nuevas_empresas, creado_en=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(b.corrida_id ?? null, b.metodo, b.consulta, b.resultados, b.nuevas);
}

export function agregarContacto(
  db: Db,
  c: z.infer<typeof contactoInput>,
): { id: number; nuevo: boolean } {
  const emp = db.prepare('SELECT dominio, nombre FROM empresas WHERE id = ?').get(c.empresa_id) as
    { dominio: string | null; nombre: string } | undefined;
  if (!emp) throw new Error('Empresa no encontrada');
  if (c.tipo === 'correo') {
    const dom = c.valor.split('@')[1]?.toLowerCase();
    if (dom && enNoContactar(db, emp.nombre, dom))
      throw new Error('Dominio en lista de no contactar');
    const bloqueado = db
      .prepare("SELECT 1 FROM no_contactar WHERE tipo='correo' AND valor = ? COLLATE NOCASE")
      .get(c.valor);
    if (bloqueado) throw new Error('Correo en lista de no contactar');
  }
  const previo = db
    .prepare('SELECT id FROM contactos WHERE empresa_id=? AND tipo=? AND valor=?')
    .get(c.empresa_id, c.tipo, c.valor) as { id: number } | undefined;
  if (previo) return { id: previo.id, nuevo: false };
  const r = db
    .prepare(
      'INSERT INTO contactos (empresa_id, tipo, valor, nombre, puesto, fuente_url) VALUES (?,?,?,?,?,?)',
    )
    .run(c.empresa_id, c.tipo, c.valor, c.nombre ?? null, c.puesto ?? null, c.fuente_url);
  return { id: Number(r.lastInsertRowid), nuevo: true };
}

export function guardarFicha(db: Db, f: z.infer<typeof fichaInput>): void {
  const giro = f.giro
    ? (db.prepare('SELECT id FROM taxonomia_giros WHERE nombre = ? COLLATE NOCASE').get(f.giro) as
        { id: number } | undefined)
    : undefined;
  const dominio = dominioDe(f.sitio_web);
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `UPDATE empresas SET tamano=COALESCE(?,tamano), sucursales=COALESCE(?,sucursales),
           resumen=COALESCE(?,resumen), giro_id=COALESCE(?,giro_id), sitio_web=COALESCE(?,sitio_web),
           dominio=COALESCE(?,dominio), sitio_verificado=COALESCE(?,sitio_verificado),
           actualizado_en=? WHERE id=?`,
      )
      .run(
        f.tamano ?? null,
        f.sucursales ?? null,
        f.resumen ?? null,
        giro?.id ?? null,
        f.sitio_web ?? null,
        dominio,
        f.sitio_verificado === undefined ? null : f.sitio_verificado ? 1 : 0,
        nowIso(),
        f.empresa_id,
      );
    if (r.changes === 0) throw new Error('Empresa no encontrada');
    if (f.necesidades) {
      db.prepare('DELETE FROM necesidades WHERE empresa_id = ?').run(f.empresa_id);
      const ins = db.prepare('INSERT INTO necesidades (empresa_id, texto, tipo) VALUES (?,?,?)');
      for (const n of f.necesidades) ins.run(f.empresa_id, n.texto, n.tipo);
    }
  });
  tx();
}

export function cambiarEtapa(db: Db, e: z.infer<typeof etapaInput>): void {
  const r = db
    .prepare('UPDATE empresas SET etapa=?, descartada_motivo=?, actualizado_en=? WHERE id=?')
    .run(
      e.etapa,
      e.etapa === 'descartada' ? (e.motivo ?? 'sin_motivo') : null,
      nowIso(),
      e.empresa_id,
    );
  if (r.changes === 0) throw new Error('Empresa no encontrada');
}
