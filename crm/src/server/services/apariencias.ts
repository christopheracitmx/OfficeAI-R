/**
 * Personalizador: capas de apariencia versionadas (deshacer/rehacer/restaurar), definición
 * efectiva (base + preset + overrides) y acciones de equipo. Los presets viven en
 * apariencias-presets.ts. Todo por office_id; cada cambio queda en cambios_log.
 */
import {
  ErrorComposicion,
  clave,
  componerDefinicion,
  validarCampos,
  type Campos,
  type Capas,
  type Entidad,
} from '../../shared/oficina3d/composicion';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import type { Db } from '../db';
import { nowIso } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';
import { definicionDe, obtenerOficina } from './oficinas';
import { listarPresets, presetVisible } from './apariencias-presets';

export interface CapaGuardada {
  preset: number | null;
  overrides: Campos;
  version: number;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
}
export interface VersionApariencia {
  version: number;
  nota: string | null;
  creado_en: string;
  vigente: boolean;
}
export interface Fila {
  json: string;
  version: number;
  vigente: number;
  descartada: number;
  nota: string | null;
  creado_en: string;
}

export const parseCapa = (json: string): { preset: number | null; overrides: Campos } => {
  try {
    const o = JSON.parse(json) as { preset?: unknown; overrides?: unknown };
    return {
      preset: typeof o.preset === 'number' ? o.preset : null,
      overrides:
        o.overrides && typeof o.overrides === 'object' && !Array.isArray(o.overrides)
          ? (o.overrides as Campos)
          : {},
    };
  } catch {
    return { preset: null, overrides: {} };
  }
};

function filas(db: Db, office: string, entidad: Entidad, id: string): Fila[] {
  return db
    .prepare(
      `SELECT json, version, vigente, descartada, nota, creado_en FROM apariencias
       WHERE office_id = ? AND entidad = ? AND entidad_id = ? ORDER BY version`,
    )
    .all(office, entidad, id) as Fila[];
}

function resumenCapa(rows: Fila[]): CapaGuardada | null {
  const v = rows.find((r) => r.vigente === 1);
  if (!v) return null;
  const vivas = rows.filter((r) => r.descartada === 0);
  return {
    ...parseCapa(v.json),
    version: v.version,
    puedeDeshacer: vivas.some((r) => r.version < v.version),
    puedeRehacer: vivas.some((r) => r.version > v.version),
  };
}

/** Capas vigentes de toda la oficina (una consulta). */
export function capasGuardadas(db: Db, office: string): Record<string, CapaGuardada> {
  const todas = db
    .prepare(
      `SELECT entidad, entidad_id, json, version, vigente, descartada, nota, creado_en
       FROM apariencias WHERE office_id = ? ORDER BY entidad, entidad_id, version`,
    )
    .all(office) as (Fila & { entidad: Entidad; entidad_id: string })[];
  const grupos = new Map<string, Fila[]>();
  for (const r of todas) {
    const k = clave(r.entidad, r.entidad_id);
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  const salida: Record<string, CapaGuardada> = {};
  for (const [k, rows] of grupos) {
    const c = resumenCapa(rows);
    if (c) salida[k] = c;
  }
  return salida;
}

/** Capas con el preset ya resuelto (listas para `componerDefinicion`). */
export function capasResueltas(
  db: Db,
  office: string,
  guardadas = capasGuardadas(db, office),
): Capas {
  const salida: Record<string, { preset: Campos | null; overrides: Campos }> = {};
  for (const [k, c] of Object.entries(guardadas)) {
    const p = c.preset === null ? null : presetVisible(db, office, c.preset);
    salida[k] = { preset: p?.json ?? null, overrides: c.overrides };
  }
  return salida;
}

/** Definición efectiva de una oficina: la plantilla + preset + cambios del usuario (descarta lo inválido). */
export function definicionEfectiva(db: Db, office: string): DefinicionOficina | null {
  const base = definicionDe(db, office);
  if (!base) return null;
  return componerDefinicion(base, capasResueltas(db, office)).def;
}

export function estadoApariencias(db: Db, office: string) {
  const base = definicionDe(db, office);
  if (!base) throw new KbError(404, `Oficina desconocida: ${office}`);
  const capas = capasGuardadas(db, office);
  const { def, descartes } = componerDefinicion(base, capasResueltas(db, office, capas));
  return { base, efectiva: def, capas, presets: listarPresets(db, office), descartes };
}

function existeEntidad(base: DefinicionOficina, entidad: Entidad, id: string): boolean {
  if (entidad === 'oficina') return base.office.id === id;
  if (entidad === 'sala') return base.salas.some((s) => s.id === id);
  return base.agentes.some((a) => a.id === id);
}

export function oficinaOError(db: Db, office: string): DefinicionOficina {
  if (!obtenerOficina(db, office)) throw new KbError(404, `Oficina desconocida: ${office}`);
  const base = definicionDe(db, office);
  if (!base) throw new KbError(404, 'La oficina no tiene definición 3D');
  return base;
}

export function leerCapa(db: Db, office: string, entidad: Entidad, id: string) {
  const base = oficinaOError(db, office);
  if (!existeEntidad(base, entidad, id)) throw new KbError(404, `No existe ${entidad} ${id}`);
  const rows = filas(db, office, entidad, id);
  return {
    capa: resumenCapa(rows),
    versiones: rows
      .filter((r) => r.descartada === 0)
      .map((r): VersionApariencia => ({
        version: r.version,
        nota: r.nota,
        creado_en: r.creado_en,
        vigente: r.vigente === 1,
      })),
  };
}

export interface EntradaCapa {
  preset?: number | null | undefined;
  overrides: Campos;
}

/** Inserta una versión nueva (descarta lo rehacible) sin validar: úsese tras validar. */
function insertar(
  db: Db,
  office: string,
  entidad: Entidad,
  id: string,
  e: EntradaCapa,
  nota: string,
): number {
  const rows = filas(db, office, entidad, id);
  const t = nowIso();
  const json = JSON.stringify({ preset: e.preset ?? null, overrides: e.overrides });
  const ins = db.prepare(
    `INSERT INTO apariencias (office_id, entidad, entidad_id, json, version, vigente, descartada, nota, creado_en)
     VALUES (?,?,?,?,?,?,0,?,?)`,
  );
  let version = (rows.at(-1)?.version ?? 0) + 1;
  db.transaction(() => {
    if (rows.length === 0) {
      ins.run(office, entidad, id, '{"preset":null,"overrides":{}}', 1, 0, 'plantilla', t);
      version = 2;
    }
    const actual = rows.length === 0 ? 1 : (rows.find((r) => r.vigente === 1)?.version ?? 0);
    db.prepare(
      'UPDATE apariencias SET descartada = 1 WHERE office_id = ? AND entidad = ? AND entidad_id = ? AND version > ?',
    ).run(office, entidad, id, actual);
    db.prepare(
      'UPDATE apariencias SET vigente = 0 WHERE office_id = ? AND entidad = ? AND entidad_id = ? AND vigente = 1',
    ).run(office, entidad, id);
    ins.run(office, entidad, id, json, version, 1, nota, t);
    registrarCambio(db, office, 'apariencia', clave(entidad, id), nota);
  })();
  return version;
}

/** Valida (campos + plano resultante) y guarda una versión nueva de la capa. Lanza KbError 400 si algo es inválido. */
export function guardarCapa(
  db: Db,
  office: string,
  entidad: Entidad,
  id: string,
  e: EntradaCapa,
  nota = 'guardó cambios',
): number {
  const base = oficinaOError(db, office);
  if (!existeEntidad(base, entidad, id)) throw new KbError(404, `No existe ${entidad} ${id}`);
  const { ok, errores } = validarCampos(entidad, e.overrides);
  if (errores.length > 0) throw new KbError(400, errores.join('; '));
  let preset: Campos | null = null;
  if (e.preset != null) {
    const p = presetVisible(db, office, e.preset);
    if (!p || p.tipo !== entidad) throw new KbError(400, 'Preset inexistente o de otro tipo');
    preset = p.json;
  }
  try {
    const capas = {
      ...capasResueltas(db, office),
      [clave(entidad, id)]: { preset, overrides: ok },
    };
    componerDefinicion(base, capas, true);
  } catch (err) {
    if (err instanceof ErrorComposicion) throw new KbError(400, err.message);
    throw err;
  }
  return insertar(db, office, entidad, id, { preset: e.preset ?? null, overrides: ok }, nota);
}

function moverVigente(
  db: Db,
  office: string,
  entidad: Entidad,
  id: string,
  haciaAtras: boolean,
): void {
  const rows = filas(db, office, entidad, id);
  const v = rows.find((r) => r.vigente === 1);
  const vivas = rows.filter((r) => r.descartada === 0);
  const destino = haciaAtras
    ? vivas.filter((r) => r.version < (v?.version ?? 0)).at(-1)
    : vivas.find((r) => r.version > (v?.version ?? 0));
  if (!v || !destino) throw new KbError(409, haciaAtras ? 'Nada que deshacer' : 'Nada que rehacer');
  db.transaction(() => {
    const up = db.prepare(
      'UPDATE apariencias SET vigente = ? WHERE office_id = ? AND entidad = ? AND entidad_id = ? AND version = ?',
    );
    up.run(0, office, entidad, id, v.version);
    up.run(1, office, entidad, id, destino.version);
    registrarCambio(
      db,
      office,
      'apariencia',
      clave(entidad, id),
      haciaAtras ? 'deshizo un cambio' : 'rehizo un cambio',
      `v${v.version} → v${destino.version}`,
    );
  })();
}
export const deshacer = (db: Db, o: string, e: Entidad, id: string) =>
  moverVigente(db, o, e, id, true);
export const rehacer = (db: Db, o: string, e: Entidad, id: string) =>
  moverVigente(db, o, e, id, false);

/** Rollback a una versión: crea una versión nueva con ese contenido (el historial no se pierde). */
export function restaurarVersion(db: Db, office: string, e: Entidad, id: string, version: number) {
  const f = filas(db, office, e, id).find((r) => r.version === version && r.descartada === 0);
  if (!f) throw new KbError(404, `No existe la versión ${version}`);
  const c = parseCapa(f.json);
  return guardarCapa(db, office, e, id, c, `restauró la versión ${version}`);
}

export const restablecer = (db: Db, office: string, e: Entidad, id: string) =>
  guardarCapa(db, office, e, id, { preset: null, overrides: {} }, 'restableció a la plantilla');
