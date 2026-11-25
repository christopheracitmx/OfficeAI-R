import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../src/server/db';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('P6.5 migración 005 conserva los datos', () => {
  it('lecciones existentes sobreviven con versión 1 y la base queda íntegra', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig005-'));
    dirs.push(dir);
    const mig = resolve('src/server/db/migrations');
    const db = new Database(join(dir, 'crm.db'));
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)',
    );
    for (const f of ['001_init.sql', '002_office.sql', '003_cerebro.sql', '004_plan.sql']) {
      db.exec(readFileSync(join(mig, f), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, 'x');
    }
    db.prepare(
      "INSERT INTO lecciones (office_id, agente, tipo, texto, estado, origen, creado_en) VALUES ('prospeccion','Redactor','acierto','Lección previa del dueño.','aprobada','manual','2026-05-01')",
    ).run();
    expect(migrate(db)).toEqual(['005_aprendizaje.sql', '006_edificio.sql']);
    expect(
      db.prepare('SELECT texto, estado, version, actualizado_en FROM lecciones').get(),
    ).toEqual({
      texto: 'Lección previa del dueño.',
      estado: 'aprobada',
      version: 1,
      actualizado_en: '2026-05-01',
    });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
  });
});
