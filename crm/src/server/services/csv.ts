import type { Db } from '../db';
import { listarProspectos, type FiltrosProspectos } from './consultas';

type Fila = Record<string, string | number | null>;

/** Celda CSV segura: comillas dobles escapadas y sin fórmulas (=, +, -, @) que Excel ejecutaría. */
export function celdaCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNAS: [string, string][] = [
  ['id', 'ID'],
  ['empresa', 'Empresa'],
  ['estado', 'Estado'],
  ['score', 'Score'],
  ['nivel', 'Nivel'],
  ['giro', 'Giro'],
  ['zona', 'Zona'],
  ['municipio', 'Municipio'],
  ['sitio_web', 'Sitio web'],
  ['metodo_descubrimiento', 'Cómo se encontró'],
  ['correos', 'Correos'],
  ['telefonos', 'Teléfonos'],
  ['canalizado_a', 'Canalizado a'],
  ['reportado_en', 'Reportado en'],
  ['creado_en', 'Creado en'],
];

/** CSV de prospectos con los mismos filtros que la lista. UTF-8 con BOM (Excel en español). */
export function prospectosCsv(db: Db, f: FiltrosProspectos): string {
  const filas = listarProspectos(db, f) as Fila[];
  const contactos = db.prepare(
    'SELECT tipo, valor FROM contactos WHERE empresa_id = ? ORDER BY tipo, id',
  );
  const lineas = [COLUMNAS.map(([, t]) => t).join(',')];
  for (const fila of filas) {
    const cs = contactos.all(fila['empresa_id']) as { tipo: string; valor: string }[];
    const datos: Fila = {
      ...fila,
      correos: cs
        .filter((c) => c.tipo === 'correo')
        .map((c) => c.valor)
        .join(' | '),
      telefonos: cs
        .filter((c) => c.tipo === 'telefono')
        .map((c) => c.valor)
        .join(' | '),
    };
    lineas.push(COLUMNAS.map(([k]) => celdaCsv(datos[k])).join(','));
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}
