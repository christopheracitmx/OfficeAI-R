import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/server/db';
import { dirTemporal } from './p11-helpers';

describe('P11 migración 009 conserva los datos (BD de archivo temporal con datos previos)', () => {
  it('empresas, contactos y prospectos intactos; el CHECK admite las fuentes nuevas; nombre_norm se rellena', () => {
    const dir = dirTemporal('mig009-');
    const todas = resolve('src/server/db/migrations');
    const hasta008 = join(dir, 'migraciones-008');
    mkdirSync(hasta008);
    for (const f of readdirSync(todas).filter((x) => x < '009'))
      copyFileSync(join(todas, f), join(hasta008, f));
    const ruta = join(dir, 'crm.db');
    const db = new Database(ruta);
    db.pragma('foreign_keys = ON');
    migrate(db, hasta008);
    db.prepare(
      "INSERT INTO empresas (nombre, place_id, metodo_descubrimiento, direccion, zona, sitio_web, dominio) VALUES ('Aceros Previos SA de CV','pl-1','places','Calle 1, Naucalpan','Edomex - Naucalpan','https://previos.example','previos.example')",
    ).run();
    db.prepare(
      "INSERT INTO empresas (nombre, metodo_descubrimiento) VALUES ('Otra Previa','manual')",
    ).run();
    db.prepare(
      "INSERT INTO contactos (empresa_id, tipo, valor, fuente_url) VALUES (1,'correo','a@previos.example','https://previos.example')",
    ).run();
    db.prepare('INSERT INTO prospectos (empresa_id) VALUES (1)').run();
    db.prepare(
      "INSERT INTO necesidades (empresa_id, texto, tipo) VALUES (1,'Necesita red','inferencia')",
    ).run();
    const antes = db
      .prepare(
        'SELECT id, nombre, place_id, metodo_descubrimiento, zona, office_id FROM empresas ORDER BY id',
      )
      .all();

    expect(migrate(db)).toEqual([
      '009_fuentes.sql',
      '010_precalificacion.sql',
      '011_niveles_calidad.sql',
    ]);
    expect(
      db
        .prepare(
          'SELECT id, nombre, place_id, metodo_descubrimiento, zona, office_id FROM empresas ORDER BY id',
        )
        .all(),
    ).toEqual(antes);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM contactos').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT empresa_id FROM prospectos').get()).toEqual({ empresa_id: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM necesidades').get()).toEqual({ n: 1 });
    // respaldo previo automático
    expect(existsSync(join(dir, 'backups'))).toBe(true);
    // el CHECK ampliado admite las fuentes y rechaza lo desconocido
    db.prepare(
      "INSERT INTO empresas (nombre, metodo_descubrimiento) VALUES ('Nueva DENUE','denue_local')",
    ).run();
    expect(() =>
      db
        .prepare("INSERT INTO empresas (nombre, metodo_descubrimiento) VALUES ('X','inventado')")
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db.prepare("INSERT INTO empresas (nombre, place_id) VALUES ('Dup','pl-1')").run(),
    ).toThrow(/UNIQUE/);
    db.close();

    const otra = openDb(ruta);
    expect(otra.prepare('SELECT nombre_norm FROM empresas WHERE id = 1').get()).toEqual({
      nombre_norm: 'aceros previos',
    });
    expect(
      otra.prepare('SELECT COUNT(*) AS n FROM empresas WHERE nombre_norm IS NULL').get(),
    ).toEqual({ n: 0 });
    expect(migrate(otra)).toEqual([]);
    otra.close();
  });
});
