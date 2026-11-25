import type { z } from 'zod';
import type { Db } from '../db';
import { nowIso } from '../db';
import type {
  configPatch,
  corridaInput,
  destinatarioInput,
  noContactarInput,
} from '../../shared/schemas';

export class QuotaExceededError extends Error {
  constructor(
    public readonly usado: number,
    public readonly tope: number,
  ) {
    super(`Cuota de Places agotada: ${usado} de ${tope} este mes`);
  }
}

const mesActual = (): string => new Date().toISOString().slice(0, 7);

export function getConfig(db: Db): {
  max_empresas_por_corrida: number;
  zonas_piloto: string[];
  places_tope_pro: number;
  motor_ia: string;
} {
  const rows = db.prepare('SELECT clave, valor FROM configuracion').all() as {
    clave: string;
    valor: string;
  }[];
  const m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  return {
    max_empresas_por_corrida: Number(m['max_empresas_por_corrida'] ?? 10),
    zonas_piloto: JSON.parse(m['zonas_piloto'] ?? '["CDMX","Estado de México"]') as string[],
    places_tope_pro: Number(m['places_tope_pro'] ?? 4900),
    motor_ia: m['motor_ia'] ?? 'claude-code',
  };
}

export function patchConfig(db: Db, p: z.infer<typeof configPatch>): void {
  const up = db.prepare(
    'INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?,?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, actualizado_en=excluded.actualizado_en',
  );
  db.transaction(() => {
    if (p.max_empresas_por_corrida !== undefined)
      up.run('max_empresas_por_corrida', String(p.max_empresas_por_corrida), nowIso());
    if (p.zonas_piloto) up.run('zonas_piloto', JSON.stringify(p.zonas_piloto), nowIso());
  })();
}

/** Tope duro de Places. Se llama ANTES de cada solicitud; lanza si se agotó. */
export function consumirPlaces(db: Db, n = 1): { usado: number; tope: number } {
  const tope = getConfig(db).places_tope_pro;
  const mes = mesActual();
  let usado = 0;
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO places_uso (mes, sku, contador) VALUES (?, 'pro', 0)").run(
      mes,
    );
    usado = (
      db.prepare("SELECT contador FROM places_uso WHERE mes=? AND sku='pro'").get(mes) as {
        contador: number;
      }
    ).contador;
    if (usado + n > tope) throw new QuotaExceededError(usado, tope);
    db.prepare("UPDATE places_uso SET contador = contador + ? WHERE mes=? AND sku='pro'").run(
      n,
      mes,
    );
    usado += n;
  })();
  return { usado, tope };
}

// ---- Destinatarios internos (allowlist editable desde Configuración)
export const listarDestinatarios = (db: Db): unknown[] =>
  db
    .prepare('SELECT id, email, nombre, activo, creado_en FROM destinatarios_internos ORDER BY id')
    .all();

export function crearDestinatario(db: Db, d: z.infer<typeof destinatarioInput>): number {
  const r = db
    .prepare('INSERT INTO destinatarios_internos (email, nombre, activo) VALUES (?,?,?)')
    .run(d.email, d.nombre ?? null, d.activo === false ? 0 : 1);
  return Number(r.lastInsertRowid);
}

export function editarDestinatario(
  db: Db,
  id: number,
  d: Partial<z.infer<typeof destinatarioInput>>,
): boolean {
  const r = db
    .prepare(
      'UPDATE destinatarios_internos SET email=COALESCE(?,email), nombre=COALESCE(?,nombre), activo=COALESCE(?,activo) WHERE id=?',
    )
    .run(d.email ?? null, d.nombre ?? null, d.activo === undefined ? null : d.activo ? 1 : 0, id);
  return r.changes > 0;
}

export const eliminarDestinatario = (db: Db, id: number): boolean =>
  db.prepare('DELETE FROM destinatarios_internos WHERE id = ?').run(id).changes > 0;

export const activosDestinatarios = (db: Db): number =>
  (
    db.prepare('SELECT COUNT(*) AS n FROM destinatarios_internos WHERE activo=1').get() as {
      n: number;
    }
  ).n;

// ---- No contactar
export const listarNoContactar = (db: Db): unknown[] =>
  db.prepare('SELECT * FROM no_contactar ORDER BY id DESC').all();

export function crearNoContactar(db: Db, n: z.infer<typeof noContactarInput>): number {
  const r = db
    .prepare('INSERT OR IGNORE INTO no_contactar (tipo, valor, motivo) VALUES (?,?,?)')
    .run(n.tipo, n.valor, n.motivo ?? null);
  return Number(r.lastInsertRowid);
}

export const eliminarNoContactar = (db: Db, id: number): boolean =>
  db.prepare('DELETE FROM no_contactar WHERE id = ?').run(id).changes > 0;

// ---- Giros
export const listarGiros = (db: Db): unknown[] =>
  db.prepare('SELECT id, nombre FROM taxonomia_giros ORDER BY nombre').all();
export const crearGiro = (db: Db, nombre: string): number =>
  Number(
    db.prepare('INSERT OR IGNORE INTO taxonomia_giros (nombre) VALUES (?)').run(nombre)
      .lastInsertRowid,
  );

// ---- Corridas
export type ResultadoCorrida = { ok: true; id: number } | { ok: false; error: string };

export function crearCorrida(
  db: Db,
  c: z.infer<typeof corridaInput>,
  motor: string,
): ResultadoCorrida {
  const cfg = getConfig(db);
  if (!cfg.zonas_piloto.includes(c.zona))
    return {
      ok: false,
      error: `Zona fuera del piloto. Permitidas: ${cfg.zonas_piloto.join(', ')}`,
    };
  const activa = db.prepare("SELECT id FROM corridas WHERE estado='en_curso'").get();
  if (activa)
    return { ok: false, error: 'Ya hay una corrida en curso. Deténla antes de iniciar otra.' };
  const r = db
    .prepare('INSERT INTO corridas (zona, giro, max_empresas, motor) VALUES (?,?,?,?)')
    .run(c.zona, c.giro, c.max_empresas, motor);
  return { ok: true, id: Number(r.lastInsertRowid) };
}

export function cerrarCorrida(db: Db, id: number, estado: string, motivo?: string): boolean {
  return (
    db
      .prepare(
        "UPDATE corridas SET estado=?, motivo_fin=?, terminada_en=? WHERE id=? AND estado='en_curso'",
      )
      .run(estado, motivo ?? null, nowIso(), id).changes > 0
  );
}

export const listarCorridas = (db: Db): unknown[] =>
  db.prepare('SELECT * FROM corridas ORDER BY id DESC LIMIT 50').all();
