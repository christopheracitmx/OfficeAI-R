import type { Db } from '../db';
import { nowIso } from '../db';
import { MODELO_CLAUDE, PROVEEDORES_IDS, type ProveedorId } from '../runner/proveedores';

/** Motor elegido a mano por el dueño (sin ruteo automático). Se guarda en `configuracion`. */
export interface SeleccionMotor {
  proveedor: ProveedorId;
  modelo: string;
}

const get = (db: Db, k: string): string | undefined =>
  (
    db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(k) as
      { valor: string } | undefined
  )?.valor;
const put = (db: Db, k: string, v: string): void => {
  db.prepare(
    'INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en',
  ).run(k, v, nowIso());
};

export function leerSeleccion(db: Db): SeleccionMotor {
  const p = get(db, 'motor_proveedor') as ProveedorId | undefined;
  const proveedor = p && PROVEEDORES_IDS.includes(p) ? p : 'claude';
  if (proveedor === 'claude') return { proveedor, modelo: MODELO_CLAUDE };
  return { proveedor, modelo: get(db, 'motor_modelo') ?? '' };
}

export function guardarSeleccion(db: Db, s: SeleccionMotor): void {
  put(db, 'motor_proveedor', s.proveedor);
  put(db, 'motor_modelo', s.proveedor === 'claude' ? MODELO_CLAUDE : s.modelo);
}

/** % de calidad por modelo (lo captura el dueño tras sus pruebas; Claude Sonnet es la referencia = 100). */
export function leerCalidad(db: Db): Record<string, number> {
  try {
    return JSON.parse(get(db, 'motor_calidad') ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
export function guardarCalidad(db: Db, clave: string, pct: number | null): void {
  const c = leerCalidad(db);
  if (pct === null) delete c[clave];
  else c[clave] = pct;
  put(db, 'motor_calidad', JSON.stringify(c));
}
