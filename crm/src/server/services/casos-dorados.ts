import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import type { casoInput, casoPatch, Criterio } from '../../shared/aprendizaje';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export interface CasoDorado {
  id: number;
  office_id: string;
  nombre: string;
  agente: string;
  paso: string;
  entrada: string;
  salida_esperada: string;
  criterios: Criterio[];
  activo: number;
  actualizado_en: string;
}

interface Fila extends Omit<CasoDorado, 'criterios'> {
  criterios: string;
}

const convertir = (f: Fila): CasoDorado => ({
  ...f,
  criterios: JSON.parse(f.criterios) as Criterio[],
});

export const listarCasos = (db: Db, office: string, soloActivos = false): CasoDorado[] =>
  (
    db
      .prepare(
        `SELECT * FROM casos_dorados WHERE office_id = ? ${soloActivos ? 'AND activo = 1' : ''} ORDER BY id`,
      )
      .all(office) as Fila[]
  ).map(convertir);

export function leerCaso(db: Db, id: number): CasoDorado {
  const f = db.prepare('SELECT * FROM casos_dorados WHERE id = ?').get(id) as Fila | undefined;
  if (!f) throw new KbError(404, 'Caso no encontrado');
  return convertir(f);
}

export function crearCaso(db: Db, i: z.infer<typeof casoInput>): CasoDorado {
  const ahora = nowIso();
  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO casos_dorados (office_id, nombre, agente, paso, entrada, salida_esperada, criterios, activo, creado_en, actualizado_en)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          i.office_id,
          i.nombre,
          i.agente,
          i.paso,
          i.entrada,
          i.salida_esperada,
          JSON.stringify(i.criterios),
          i.activo === false ? 0 : 1,
          ahora,
          ahora,
        ).lastInsertRowid,
    );
    registrarCambio(db, i.office_id, 'caso_dorado', String(id), 'creó un caso dorado', i.nombre);
    return leerCaso(db, id);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message))
      throw new KbError(409, 'Ya existe un caso con ese nombre');
    throw e;
  }
}

export function editarCaso(db: Db, id: number, p: z.infer<typeof casoPatch>): CasoDorado {
  const c = leerCaso(db, id);
  const n = { ...c, ...p, criterios: p.criterios ?? c.criterios };
  db.prepare(
    `UPDATE casos_dorados SET nombre=?, agente=?, paso=?, entrada=?, salida_esperada=?, criterios=?, activo=?, actualizado_en=? WHERE id=?`,
  ).run(
    n.nombre,
    n.agente,
    n.paso,
    n.entrada,
    n.salida_esperada,
    JSON.stringify(n.criterios),
    p.activo === undefined ? c.activo : p.activo ? 1 : 0,
    nowIso(),
    id,
  );
  registrarCambio(db, c.office_id, 'caso_dorado', String(id), 'editó un caso dorado', n.nombre);
  return leerCaso(db, id);
}
