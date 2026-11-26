import type { Db } from '../db';
import { coleccionOError } from './colecciones';
import { listarRegistros, type RegistroFila } from './colecciones-registros';
import { celdaCsv } from './csv';

/** CSV de una colección (registros activos). Cada celda va protegida contra fórmulas de Excel. UTF-8 con BOM. */
export function coleccionCsv(db: Db, office: string, coleccionId: number): string {
  const c = coleccionOError(db, office, coleccionId);
  const todos: RegistroFila[] = [];
  for (let desde = 0; desde < c.registros; desde += 500)
    todos.push(...listarRegistros(db, office, coleccionId, { limite: 500, desde }).registros);
  const cab = [...c.campos.map((f) => f.etiqueta), 'Fuente', 'Nota', 'Actualizado'];
  const lineas = [cab.map(celdaCsv).join(',')];
  for (const r of todos)
    lineas.push(
      [
        ...c.campos.map((f) => {
          const v = r.datos[f.nombre];
          return celdaCsv(typeof v === 'boolean' ? (v ? 'sí' : 'no') : v);
        }),
        celdaCsv(r.fuente_url),
        celdaCsv(r.nota),
        celdaCsv(r.actualizado_en),
      ].join(','),
    );
  return `﻿${lineas.join('\r\n')}\r\n`;
}
