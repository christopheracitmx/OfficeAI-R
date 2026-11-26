import type { Db } from '../db';
import { FuenteQuotaError } from './tipos';

export const mesActual = (d = new Date()): string => d.toISOString().slice(0, 7);

export function topeFuente(db: Db, fuente: string, defecto: number | null): number | null {
  const r = db
    .prepare('SELECT valor FROM configuracion WHERE clave = ?')
    .get(`fuente_tope_${fuente}`) as { valor: string } | undefined;
  if (!r) return defecto;
  const n = Number(r.valor);
  return Number.isInteger(n) && n >= 0 ? n : defecto;
}

export function usoFuente(db: Db, fuente: string, mes = mesActual()): number {
  const r = db
    .prepare('SELECT contador FROM fuentes_uso WHERE fuente_id = ? AND mes = ?')
    .get(fuente, mes) as { contador: number } | undefined;
  return r?.contador ?? 0;
}

/** Tope duro: se llama ANTES de cada solicitud externa. Sin tope (null) solo cuenta. */
export function consumirFuente(
  db: Db,
  fuente: string,
  tope: number | null,
  n = 1,
): { usado: number; tope: number | null } {
  const mes = mesActual();
  let usado = 0;
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO fuentes_uso (fuente_id, mes, contador) VALUES (?, ?, 0)').run(
      fuente,
      mes,
    );
    usado = usoFuente(db, fuente, mes);
    if (tope !== null && usado + n > tope) throw new FuenteQuotaError(fuente, usado, tope);
    db.prepare(
      'UPDATE fuentes_uso SET contador = contador + ? WHERE fuente_id = ? AND mes = ?',
    ).run(n, fuente, mes);
    usado += n;
  })();
  return { usado, tope };
}
