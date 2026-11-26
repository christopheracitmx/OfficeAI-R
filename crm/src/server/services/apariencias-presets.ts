/** Presets de apariencia: builtin (globales) y propios por oficina; duplicar, borrar (solo propios), importar y exportar JSON. */
import { z } from 'zod';
import {
  CAMPOS_PLANO,
  ENTIDADES,
  validarCampos,
  type Campos,
  type Entidad,
} from '../../shared/oficina3d/composicion';
import type { Db } from '../db';
import { nowIso } from '../db';
import { registrarCambio } from './cambios';
import { KbError } from './kb';

export interface PresetFila {
  id: number;
  tipo: Entidad;
  nombre: string;
  json: Campos;
  builtin: boolean;
  office_id: string | null;
  creado_en: string;
}

/** Tamaño máximo (caracteres) de un preset importado. */
export const LIMITE_IMPORTAR = 20_000;
/** Campos que un preset NO puede traer: identidad y plano pertenecen a cada entidad. */
const PROHIBIDOS: Record<Entidad, ReadonlySet<string>> = {
  personaje: new Set(['nombre', 'cuerpo']),
  sala: new Set<string>(CAMPOS_PLANO),
  oficina: new Set(['planta', 'marca', 'logo', 'logoUrl']),
};

interface Cruda {
  id: number;
  tipo: Entidad;
  nombre: string;
  json: string;
  builtin: number;
  office_id: string | null;
  creado_en: string;
}
function aFila(r: Cruda): PresetFila {
  let json: Campos = {};
  try {
    json = JSON.parse(r.json) as Campos;
  } catch {
    /* preset dañado: queda vacío y no aplica nada */
  }
  return { ...r, json, builtin: r.builtin === 1 };
}

export function presetVisible(db: Db, office: string, id: number): PresetFila | null {
  const r = db
    .prepare(
      'SELECT * FROM presets_apariencia WHERE id = ? AND (office_id IS NULL OR office_id = ?)',
    )
    .get(id, office) as Cruda | undefined;
  return r ? aFila(r) : null;
}

export function listarPresets(db: Db, office: string, tipo?: Entidad): PresetFila[] {
  const rows = db
    .prepare(
      `SELECT * FROM presets_apariencia WHERE (office_id IS NULL OR office_id = ?) ${tipo ? 'AND tipo = ?' : ''}
       ORDER BY builtin DESC, id`,
    )
    .all(...(tipo ? [office, tipo] : [office])) as Cruda[];
  return rows.map(aFila);
}

function validar(tipo: Entidad, nombre: string, json: unknown): Campos {
  const n = nombre.trim();
  if (n.length < 1 || n.length > 60)
    throw new KbError(400, 'El nombre debe tener entre 1 y 60 caracteres');
  const { ok, errores } = validarCampos(tipo, json);
  if (errores.length > 0) throw new KbError(400, errores.join('; '));
  const mal = Object.keys(ok).filter((k) => PROHIBIDOS[tipo].has(k));
  if (mal.length > 0) throw new KbError(400, `Un preset no puede incluir: ${mal.join(', ')}`);
  if (Object.keys(ok).length === 0) throw new KbError(400, 'El preset está vacío');
  return ok;
}

function insertar(db: Db, office: string, tipo: Entidad, nombre: string, json: Campos): PresetFila {
  const unico = (() => {
    const n0 = nombre.trim();
    let n = n0;
    for (
      let i = 2;
      db
        .prepare(
          'SELECT 1 FROM presets_apariencia WHERE tipo = ? AND nombre = ? AND (office_id IS NULL OR office_id = ?)',
        )
        .get(tipo, n, office);
      i++
    )
      n = `${n0.slice(0, 54)} (${i})`;
    return n;
  })();
  const id = Number(
    db
      .prepare(
        'INSERT INTO presets_apariencia (tipo, nombre, json, builtin, office_id, creado_en) VALUES (?,?,?,0,?,?)',
      )
      .run(tipo, unico, JSON.stringify(json), office, nowIso()).lastInsertRowid,
  );
  registrarCambio(
    db,
    office,
    'preset_apariencia',
    String(id),
    'creó un preset',
    `${tipo}: ${unico}`,
  );
  return presetVisible(db, office, id)!;
}

export const crearPreset = (db: Db, office: string, tipo: Entidad, nombre: string, json: unknown) =>
  insertar(db, office, tipo, nombre, validar(tipo, nombre, json));

export function duplicarPreset(db: Db, office: string, id: number): PresetFila {
  const p = presetVisible(db, office, id);
  if (!p) throw new KbError(404, 'Preset inexistente');
  return insertar(db, office, p.tipo, `${p.nombre} (copia)`, p.json);
}

export function borrarPreset(db: Db, office: string, id: number): void {
  const p = presetVisible(db, office, id);
  if (!p) throw new KbError(404, 'Preset inexistente');
  if (p.builtin || p.office_id !== office)
    throw new KbError(403, 'Solo se pueden borrar tus presets propios');
  db.transaction(() => {
    db.prepare('DELETE FROM presets_apariencia WHERE id = ?').run(id);
    registrarCambio(
      db,
      office,
      'preset_apariencia',
      String(id),
      'borró un preset',
      `${p.tipo}: ${p.nombre}`,
    );
  })();
}

const sobre = z.object({
  formato: z.literal('acitmx-preset'),
  version: z.literal(1),
  tipo: z.enum(ENTIDADES),
  nombre: z.string(),
  json: z.record(z.string(), z.unknown()),
});

export function exportarPreset(db: Db, office: string, id: number) {
  const p = presetVisible(db, office, id);
  if (!p) throw new KbError(404, 'Preset inexistente');
  return { formato: 'acitmx-preset', version: 1, tipo: p.tipo, nombre: p.nombre, json: p.json };
}

/** Importa un preset exportado (texto JSON u objeto): límite de tamaño, formato y campos validados. */
export function importarPreset(db: Db, office: string, contenido: unknown): PresetFila {
  const texto = typeof contenido === 'string' ? contenido : JSON.stringify(contenido ?? null);
  if (texto.length > LIMITE_IMPORTAR)
    throw new KbError(413, `El archivo es demasiado grande (máximo ${LIMITE_IMPORTAR} caracteres)`);
  let crudo: unknown;
  try {
    crudo = typeof contenido === 'string' ? JSON.parse(contenido) : contenido;
  } catch {
    throw new KbError(400, 'El archivo no es JSON válido');
  }
  const s = sobre.safeParse(crudo);
  if (!s.success)
    throw new KbError(400, 'No es un preset de apariencia de ACITMX (formato o versión)');
  return insertar(
    db,
    office,
    s.data.tipo,
    s.data.nombre,
    validar(s.data.tipo, s.data.nombre, s.data.json),
  );
}
