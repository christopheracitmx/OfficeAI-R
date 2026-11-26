/** Acciones de apariencia que tocan varias capas: aleatorio con semilla, acciones de equipo y copia al duplicar un piso. */
import {
  PRESETS_EQUIPO,
  aplicarPreset,
  rngSemilla,
  type PresetEquipo,
} from '../../shared/oficina3d/aleatorio';
import { entidadAleatoria } from '../../shared/oficina3d/aleatorio-lugares';
import { clave, type Campos, type Entidad } from '../../shared/oficina3d/composicion';
import { ACENTOS_AREA } from '../../shared/oficina3d/prospeccion';
import type { Db } from '../db';
import { nowIso } from '../db';
import {
  capasGuardadas,
  definicionEfectiva,
  guardarCapa,
  oficinaOError,
  parseCapa,
  type EntradaCapa,
} from './apariencias';
import { registrarCambio } from './cambios';

/** Aleatorio reproducible (semilla) de una entidad: solo lo visual; conserva nombre, cuerpo y plano. */
export function aleatorioEntidad(
  db: Db,
  office: string,
  e: Entidad,
  id: string,
  semilla: number,
): number {
  const efectiva = definicionEfectiva(db, office)!;
  const actual: Campos =
    e === 'personaje'
      ? { ...efectiva.agentes.find((a) => a.id === id)?.apariencia }
      : e === 'sala'
        ? { ...efectiva.salas.find((s) => s.id === id)?.apariencia }
        : {};
  const guardada = capasGuardadas(db, office)[clave(e, id)];
  const nuevo = entidadAleatoria(e, rngSemilla(semilla), actual);
  return guardarCapa(
    db,
    office,
    e,
    id,
    { preset: guardada?.preset ?? null, overrides: { ...guardada?.overrides, ...nuevo } },
    `aleatorio (semilla ${semilla})`,
  );
}

export type AccionEquipo = PresetEquipo | 'aleatorio' | 'restablecer';
export const ACCIONES_EQUIPO = [
  ...Object.keys(PRESETS_EQUIPO),
  'aleatorio',
  'restablecer',
] as const;
const CAMPOS_ROPA = [
  'camisa',
  'pantalon',
  'calzado',
  'colorCalzado',
  'accesorio',
  'colorAccesorio',
];

/**
 * Acción sobre todo el equipo en UNA transacción: presets de ropa (uniforme/casual/formal),
 * aleatorio con semilla (conserva la paridad 50/50: si el equipo ya es parejo cada quien conserva
 * su cuerpo; si no, se reparte el mínimo necesario) o restablecer.
 */
export function accionEquipo(
  db: Db,
  office: string,
  accion: AccionEquipo,
  semilla: number,
): { paridad: { f: number; m: number; equilibrado: boolean }; cambiados: number } {
  oficinaOError(db, office);
  const efectiva = definicionEfectiva(db, office)!;
  const guardadas = capasGuardadas(db, office);
  const rng = rngSemilla(semilla);
  const n = efectiva.agentes.length;
  const f0 = efectiva.agentes.filter((a) => a.apariencia.cuerpo === 'f').length;
  const parejo = Math.abs(f0 - (n - f0)) <= 1;
  const ajustar = new Map<string, 'f' | 'm'>();
  if (accion === 'aleatorio' && !parejo) {
    // Reparte el mínimo: cambia de cuerpo solo a quienes sobran del género mayoritario.
    let sobran = Math.floor(Math.abs(f0 - (n - f0)) / 2);
    const mayor = f0 > n - f0 ? 'f' : 'm';
    for (const a of efectiva.agentes)
      if (sobran > 0 && a.apariencia.cuerpo === mayor) {
        ajustar.set(a.id, mayor === 'f' ? 'm' : 'f');
        sobran--;
      }
  }
  const cambios: [string, EntradaCapa, string][] = [];
  efectiva.agentes.forEach((a, i) => {
    const g = guardadas[clave('personaje', a.id)];
    const previo: Campos = { ...g?.overrides };
    let overrides: Campos = previo;
    if (accion === 'restablecer') overrides = {};
    else if (accion === 'aleatorio') {
      const cuerpo = ajustar.get(a.id) ?? a.apariencia.cuerpo;
      overrides = { ...previo, ...entidadAleatoria('personaje', rng, { cuerpo }), cuerpo };
    } else {
      const ropa = aplicarPreset(a.apariencia, accion, i, ACENTOS_AREA[a.area]);
      overrides = { ...previo };
      for (const c of CAMPOS_ROPA) overrides[c] = (ropa as unknown as Campos)[c];
    }
    cambios.push([
      a.id,
      { preset: accion === 'restablecer' ? null : (g?.preset ?? null), overrides },
      accion,
    ]);
  });
  db.transaction(() => {
    for (const [id, e, nota] of cambios) {
      guardarCapa(db, office, 'personaje', id, e, `equipo: ${nota}`);
    }
  })();
  const despues = definicionEfectiva(db, office)!.agentes;
  const f = despues.filter((a) => a.apariencia.cuerpo === 'f').length;
  return {
    paridad: { f, m: despues.length - f, equilibrado: Math.abs(f - (despues.length - f)) <= 1 },
    cambiados: cambios.length,
  };
}

/** Copia las apariencias de una oficina a otra (duplicar piso): presets propios, capas vigentes y la capa de la oficina. */
export function copiarApariencias(db: Db, origen: string, destino: string): void {
  const t = nowIso();
  const mapa = new Map<number, number>();
  const propios = db
    .prepare(
      'SELECT id, tipo, nombre, json FROM presets_apariencia WHERE office_id = ? AND builtin = 0',
    )
    .all(origen) as { id: number; tipo: string; nombre: string; json: string }[];
  const insP = db.prepare(
    'INSERT INTO presets_apariencia (tipo, nombre, json, builtin, office_id, creado_en) VALUES (?,?,?,0,?,?)',
  );
  for (const p of propios)
    mapa.set(p.id, Number(insP.run(p.tipo, p.nombre, p.json, destino, t).lastInsertRowid));
  const vigentes = db
    .prepare(
      'SELECT entidad, entidad_id, json FROM apariencias WHERE office_id = ? AND vigente = 1',
    )
    .all(origen) as { entidad: Entidad; entidad_id: string; json: string }[];
  const ins = db.prepare(
    `INSERT INTO apariencias (office_id, entidad, entidad_id, json, version, vigente, descartada, nota, creado_en)
     VALUES (?,?,?,?,1,1,0,?,?)`,
  );
  for (const v of vigentes) {
    const c = parseCapa(v.json);
    const preset = c.preset !== null && mapa.has(c.preset) ? mapa.get(c.preset)! : c.preset;
    const id = v.entidad === 'oficina' && v.entidad_id === origen ? destino : v.entidad_id;
    ins.run(
      destino,
      v.entidad,
      id,
      JSON.stringify({ preset, overrides: c.overrides }),
      `copiada de ${origen}`,
      t,
    );
  }
  if (vigentes.length > 0 || mapa.size > 0)
    registrarCambio(
      db,
      destino,
      'apariencia',
      null,
      `copió apariencias de ${origen}`,
      `${vigentes.length} capas`,
    );
}
