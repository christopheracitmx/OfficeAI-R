/**
 * Compartición estructural: al recargar la definición 3D, los subárboles que no cambiaron
 * conservan su identidad anterior. Así solo se reconstruyen las figuras y salas que de verdad
 * cambiaron (memo de React y geometrías fusionadas por color) y los cambios se ven al instante.
 */
export function compartir<T>(prev: T | null | undefined, next: T): T {
  if (prev === null || prev === undefined || Object.is(prev, next)) return next;
  if (typeof prev !== 'object' || typeof next !== 'object' || next === null) return next;
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    const r = next.map((n, i) => compartir(prev[i], n)) as unknown as T;
    const igual =
      (r as unknown[]).length === prev.length && (r as unknown[]).every((x, i) => x === prev[i]);
    return igual ? (prev as T) : r;
  }
  if (Array.isArray(prev)) return next;
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const claves = Object.keys(n);
  const r: Record<string, unknown> = {};
  for (const k of claves) r[k] = compartir(p[k], n[k]);
  const igual = claves.length === Object.keys(p).length && claves.every((k) => r[k] === p[k]);
  return (igual ? prev : r) as T;
}
