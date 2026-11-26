import { closeSync, createReadStream, openSync, readSync } from 'node:fs';
import { createInterface } from 'node:readline';

/** UTF-8 si el inicio del archivo lo es; si no, latin1 (los CSV de DENUE han venido en ambas). */
export function detectarCodificacion(ruta: string): 'utf8' | 'latin1' {
  const fd = openSync(ruta, 'r');
  try {
    const buf = Buffer.alloc(262144);
    const n = readSync(fd, buf, 0, buf.length, 0);
    // Un corte en medio de un carácter multibyte no debe contar como inválido.
    const trozo = buf.subarray(0, Math.max(0, n - 4));
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(trozo);
      return 'utf8';
    } catch {
      return 'latin1';
    }
  } finally {
    closeSync(fd);
  }
}

/** Una línea CSV -> celdas (comillas dobles y separadores dentro de comillas). */
export function celdas(linea: string, sep = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (q) {
      if (c === '"' && linea[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Itera líneas completas (une las que quedaron dentro de comillas) sin cargar el archivo en memoria. */
export async function* lineas(ruta: string): AsyncGenerator<string> {
  const rl = createReadStream(ruta, { encoding: detectarCodificacion(ruta) });
  let pendiente = '';
  for await (const l of createInterface({ input: rl, crlfDelay: Infinity })) {
    const linea = pendiente ? `${pendiente}\n${l}` : l;
    if ((linea.match(/"/g) ?? []).length % 2 === 1) {
      pendiente = linea;
      continue;
    }
    pendiente = '';
    if (linea.trim()) yield linea.replace(/^﻿/, '');
  }
}

const sinAcento = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Recorre un CSV con encabezado y entrega cada fila como objeto con claves en minúsculas sin acentos. */
export async function* filasCsv(ruta: string): AsyncGenerator<Record<string, string>> {
  let enc: string[] | null = null;
  let sep = ',';
  for await (const l of lineas(ruta)) {
    if (!enc) {
      sep = (l.match(/;/g) ?? []).length > (l.match(/,/g) ?? []).length ? ';' : ',';
      enc = celdas(l, sep).map(sinAcento);
      continue;
    }
    const c = celdas(l, sep);
    const fila: Record<string, string> = {};
    enc.forEach((k, i) => {
      fila[k] = (c[i] ?? '').trim();
    });
    yield fila;
  }
}
