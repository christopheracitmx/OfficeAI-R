import type { Db } from '../db';
import { nowIso } from '../db';
import { kbProductoInput, type KbProductoInput } from '../../shared/cerebro';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export interface KbProducto extends KbProductoInput {
  id: number;
  activo: number;
}

export function listarProductos(db: Db, office: string, q?: string): KbProducto[] {
  const l = q ? `%${q}%` : null;
  return db
    .prepare(
      `SELECT * FROM kb_productos WHERE office_id = @office
       AND (@l IS NULL OR marca LIKE @l OR familia LIKE @l OR descripcion LIKE @l OR casos_uso LIKE @l OR giros_ideales LIKE @l)
       ORDER BY marca, familia`,
    )
    .all({ office, l }) as KbProducto[];
}

export function guardarProducto(db: Db, i: KbProductoInput, id?: number): KbProducto {
  const t = nowIso();
  try {
    if (id) {
      const r = db
        .prepare(
          `UPDATE kb_productos SET marca=?, familia=?, descripcion=?, casos_uso=?, giros_ideales=?, argumentos_valor=?, advertencias=?, actualizado_en=? WHERE id=? AND office_id=?`,
        )
        .run(
          i.marca,
          i.familia,
          i.descripcion,
          i.casos_uso,
          i.giros_ideales,
          i.argumentos_valor,
          i.advertencias,
          t,
          id,
          i.office_id,
        );
      if (r.changes === 0) throw new KbError(404, 'Producto no encontrado');
      registrarCambio(
        db,
        i.office_id,
        'kb_producto',
        String(id),
        'editó',
        `${i.marca} ${i.familia}`,
      );
      return db.prepare('SELECT * FROM kb_productos WHERE id = ?').get(id) as KbProducto;
    }
    const r = db
      .prepare(
        `INSERT INTO kb_productos (office_id, marca, familia, descripcion, casos_uso, giros_ideales, argumentos_valor, advertencias, creado_en, actualizado_en)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(office_id, marca, familia) DO UPDATE SET descripcion=excluded.descripcion, casos_uso=excluded.casos_uso,
           giros_ideales=excluded.giros_ideales, argumentos_valor=excluded.argumentos_valor, advertencias=excluded.advertencias, activo=1, actualizado_en=excluded.actualizado_en`,
      )
      .run(
        i.office_id,
        i.marca,
        i.familia,
        i.descripcion,
        i.casos_uso,
        i.giros_ideales,
        i.argumentos_valor,
        i.advertencias,
        t,
        t,
      );
    void r;
    registrarCambio(db, i.office_id, 'kb_producto', null, 'guardó', `${i.marca} ${i.familia}`);
    return db
      .prepare('SELECT * FROM kb_productos WHERE office_id=? AND marca=? AND familia=?')
      .get(i.office_id, i.marca, i.familia) as KbProducto;
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message))
      throw new KbError(409, 'Ya existe esa marca/familia');
    throw e;
  }
}

export function activarProducto(db: Db, id: number, activo: boolean): void {
  const r = db
    .prepare('UPDATE kb_productos SET activo=?, actualizado_en=? WHERE id=?')
    .run(activo ? 1 : 0, nowIso(), id);
  if (r.changes === 0) throw new KbError(404, 'Producto no encontrado');
}

/** CSV simple con comillas dobles; separador coma o punto y coma. */
export function parsearCsv(texto: string): string[][] {
  const sep = (texto.split('\n', 1)[0] ?? '').includes(';') ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') ((campo += '"'), i++);
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) (fila.push(campo), (campo = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo);
      campo = '';
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim())) filas.push(fila);
  return filas;
}

const ENCABEZADOS: Record<string, keyof KbProductoInput> = {
  marca: 'marca',
  familia: 'familia',
  categoria: 'familia',
  categoría: 'familia',
  descripcion: 'descripcion',
  descripción: 'descripcion',
  casos_uso: 'casos_uso',
  'casos de uso': 'casos_uso',
  giros_ideales: 'giros_ideales',
  'giros ideales': 'giros_ideales',
  argumentos_valor: 'argumentos_valor',
  'argumentos de valor': 'argumentos_valor',
  advertencias: 'advertencias',
};

export interface ResultadoCsv {
  importados: number;
  errores: { fila: number; error: string }[];
}

/** Valida cada fila con el mismo esquema que la UI (rechaza precios); las válidas se importan, las demás se reportan. */
export function importarCsv(db: Db, office: string, texto: string): ResultadoCsv {
  const filas = parsearCsv(texto);
  const enc = (filas.shift() ?? []).map((h) => ENCABEZADOS[h.trim().toLowerCase()]);
  if (!enc.includes('marca') || !enc.includes('familia'))
    throw new KbError(400, 'El CSV necesita columnas marca y familia (o categoría)');
  const out: ResultadoCsv = { importados: 0, errores: [] };
  filas.forEach((f, n) => {
    const o: Record<string, string> = { office_id: office };
    enc.forEach((k, i) => {
      if (k) o[k] = (f[i] ?? '').trim();
    });
    const v = kbProductoInput.safeParse(o);
    if (!v.success) {
      out.errores.push({ fila: n + 2, error: v.error.issues.map((x) => x.message).join('; ') });
      return;
    }
    guardarProducto(db, v.data);
    out.importados++;
  });
  return out;
}
