import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/server/db';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('P10 migración 008 conserva los datos (BD de archivo con datos previos)', () => {
  it('aplica 008 sobre una base hasta 007 con datos y no pierde nada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig008-'));
    dirs.push(dir);
    const todas = resolve('src/server/db/migrations');
    const hasta007 = join(dir, 'migraciones-007');
    mkdirSync(hasta007);
    for (const f of readdirSync(todas).filter((x) => x < '008'))
      copyFileSync(join(todas, f), join(hasta007, f));
    const ruta = join(dir, 'crm.db');
    const db = new Database(ruta);
    db.pragma('foreign_keys = ON');
    migrate(db, hasta007);
    db.prepare(
      "INSERT INTO empresas (nombre, metodo_descubrimiento) VALUES ('Empresa previa','manual')",
    ).run();
    db.prepare(
      "INSERT INTO lecciones (office_id, agente, tipo, texto, estado, origen, creado_en, version) VALUES ('prospeccion','Redactor','acierto','Lección previa','aprobada','manual','2026-05-01',1)",
    ).run();
    db.prepare(
      "INSERT INTO oficinas (id, nombre, descripcion, icono, orden) VALUES ('otra','Otra','','building',2)",
    ).run();
    const antes = {
      empresas: db.prepare('SELECT COUNT(*) AS n FROM empresas').get(),
      oficinas: db.prepare('SELECT id, nombre FROM oficinas ORDER BY id').all(),
    };

    expect(migrate(db)).toEqual([
      '008_p10_herramientas.sql',
      '009_fuentes.sql',
      '010_precalificacion.sql',
      '011_niveles_calidad.sql',
    ]);

    expect(db.prepare('SELECT COUNT(*) AS n FROM empresas').get()).toEqual(antes.empresas);
    expect(db.prepare('SELECT id, nombre FROM oficinas ORDER BY id').all()).toEqual(antes.oficinas);
    expect(db.prepare('SELECT texto FROM lecciones').get()).toEqual({ texto: 'Lección previa' });
    // columnas nuevas con valores seguros por defecto (archivos desactivados)
    expect(
      db
        .prepare(
          'SELECT archivos_activo, correo_activo, herramientas_json, candados_json FROM oficinas',
        )
        .all(),
    ).toEqual([
      { archivos_activo: 0, correo_activo: 0, herramientas_json: null, candados_json: null },
      { archivos_activo: 0, correo_activo: 0, herramientas_json: null, candados_json: null },
    ]);
    for (const t of [
      'colecciones',
      'coleccion_registros',
      'archivos_carpetas',
      'avisos_email',
      'constructor_sesiones',
    ])
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    // respaldo automático antes de migrar
    expect(existsSync(join(dir, 'backups'))).toBe(true);
    expect(readdirSync(join(dir, 'backups')).some((f) => f.includes('pre-008'))).toBe(true);
    // idempotente
    expect(migrate(db)).toEqual([]);
    db.close();
  });

  it('openDb sobre archivo existente conserva y reabre sin errores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig008b-'));
    dirs.push(dir);
    const ruta = join(dir, 'crm.db');
    const a = openDb(ruta);
    a.prepare(
      "INSERT INTO empresas (nombre, metodo_descubrimiento) VALUES ('Persistente','manual')",
    ).run();
    a.close();
    const b = openDb(ruta);
    expect(b.prepare('SELECT nombre FROM empresas').get()).toEqual({ nombre: 'Persistente' });
    b.close();
  });
});
