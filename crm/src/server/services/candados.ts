import { RELAJABLES } from '../../shared/candados';
import type { Db } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

const RELAJABLES_SET: ReadonlySet<string> = new Set(RELAJABLES);

/** Candados relajados de una oficina (por defecto ninguno: todos activos). */
export function candadosRelajados(db: Db, office: string): string[] {
  const r = db.prepare('SELECT candados_json FROM oficinas WHERE id = ?').get(office) as
    { candados_json: string | null } | undefined;
  if (!r?.candados_json) return [];
  try {
    const v = JSON.parse(r.candados_json) as { relajados?: unknown };
    return Array.isArray(v.relajados)
      ? v.relajados.filter((x): x is string => typeof x === 'string' && RELAJABLES_SET.has(x))
      : [];
  } catch {
    return [];
  }
}

/**
 * Fija los candados relajados. Relajar uno nuevo exige `confirmar` explícito y se registra;
 * volver a activarlos no pide confirmación.
 */
export function fijarCandados(
  db: Db,
  office: string,
  relajar: readonly string[],
  confirmar: boolean,
): string[] {
  const malos = relajar.filter((c) => !RELAJABLES_SET.has(c));
  if (malos.length > 0)
    throw new KbError(422, `Estos candados no se pueden relajar: ${malos.join(', ')}`);
  const previos = new Set(candadosRelajados(db, office));
  const nuevos = relajar.filter((c) => !previos.has(c));
  if (nuevos.length > 0 && !confirmar)
    throw new KbError(409, `Relajar ${nuevos.join(', ')} exige confirmación explícita del dueño`);
  const unicos = [...new Set(relajar)];
  db.prepare('UPDATE oficinas SET candados_json = ? WHERE id = ?').run(
    unicos.length > 0 ? JSON.stringify({ relajados: unicos }) : null,
    office,
  );
  if (nuevos.length > 0)
    registrarCambio(
      db,
      office,
      'candados',
      null,
      'RELAJÓ candados (confirmado por el dueño)',
      nuevos.join(', '),
    );
  const quedan = new Set(unicos);
  const reactivados = [...previos].filter((c) => !quedan.has(c));
  if (reactivados.length > 0)
    registrarCambio(db, office, 'candados', null, 'reactivó candados', reactivados.join(', '));
  return unicos;
}
