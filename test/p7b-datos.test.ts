import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { escuchar } from '../src/server/arranque';
import { migrate, openDb, respaldarAntesDeMigrar } from '../src/server/db';
import { EventBus } from '../src/server/services/events';
import { FakeMailer, TOKEN, UI } from './helpers';

const dirs: string[] = [];
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'datos-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const MIG = resolve('src/server/db/migrations');
const app = (db: ReturnType<typeof openDb>, dbModo?: 'real' | 'demo') =>
  createApp({
    db,
    bus: new EventBus(),
    mailer: new FakeMailer(),
    from: 'x@y.mx',
    baseUrl: 'http://127.0.0.1:5174',
    agentToken: TOKEN,
    uiOrigins: [UI],
    env: { NODE_ENV: 'test' },
    ...(dbModo ? { dbModo } : {}),
  });

describe('P7b datos: persistencia y migraciones seguras', () => {
  it('lo creado por la API sobrevive a cerrar y reabrir la base de archivo', async () => {
    const f = join(temp(), 'crm.db');
    const db = openDb(f);
    const r = await request(app(db))
      .post('/api/directorio')
      .set('Origin', UI)
      .send({ nombre: 'Persistente SA de CV', direccion: 'CDMX' });
    expect(r.status).toBeLessThan(300);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    const otra = openDb(f);
    const fila = otra.prepare("SELECT nombre FROM empresas WHERE nombre LIKE 'Persistente%'").get();
    expect(fila).toEqual({ nombre: 'Persistente SA de CV' });
    otra.close();
  });

  it('respalda antes de migrar, conserva los datos y deja foreign_key_check limpio', () => {
    const dir = temp();
    const f = join(dir, 'crm.db');
    // Base "vieja": solo migraciones 001-003, con datos.
    const viejo = new Database(f);
    for (const m of ['001_init.sql', '002_office.sql', '003_cerebro.sql']) {
      viejo.exec(readFileSync(join(MIG, m), 'utf8'));
    }
    viejo.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)',
    );
    for (const m of ['001_init.sql', '002_office.sql', '003_cerebro.sql'])
      viejo.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(m, 'x');
    viejo
      .prepare(
        "INSERT INTO corridas (zona, giro, max_empresas, motor, estado) VALUES ('CDMX','x',2,'m','terminada')",
      )
      .run();
    viejo
      .prepare(
        "INSERT INTO empresas (nombre, corrida_id, metodo_descubrimiento) VALUES ('Vieja SA', 1, 'manual')",
      )
      .run();
    viejo.close();

    const db = openDb(f);
    expect(db.prepare('SELECT nombre FROM empresas').get()).toEqual({ nombre: 'Vieja SA' });
    expect(db.prepare('SELECT estado FROM corridas').get()).toEqual({ estado: 'terminada' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const resp = readdirSync(join(dir, 'backups'));
    expect(resp.some((n) => n.startsWith('crm-pre-004_plan-'))).toBe(true);
    const copia = new Database(join(dir, 'backups', resp[0]!), { readonly: true });
    expect(copia.prepare('SELECT nombre FROM empresas').get()).toEqual({ nombre: 'Vieja SA' });
    copia.close();
    db.close();
  });

  it('una migración que falla se revierte por completo y avisa del respaldo', () => {
    const dir = temp();
    const mdir = join(dir, 'mig');
    mkdirSync(mdir);
    writeFileSync(
      join(mdir, '001_a.sql'),
      'CREATE TABLE a (id INTEGER PRIMARY KEY); INSERT INTO a VALUES (1);',
    );
    const db = new Database(join(dir, 'x.db'));
    migrate(db, mdir);
    writeFileSync(
      join(mdir, '002_mala.sql'),
      'CREATE TABLE b (id INTEGER); INSERT INTO tabla_inexistente VALUES (1);',
    );
    expect(() => migrate(db, mdir)).toThrow(/002_mala.*revirtió.*respaldo previo/);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='b'").get()).toBeUndefined();
    expect(db.prepare('SELECT id FROM a').get()).toEqual({ id: 1 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('conserva solo los últimos 5 respaldos', () => {
    const dir = temp();
    const db = new Database(join(dir, 'x.db'));
    db.exec('CREATE TABLE t (id INTEGER)');
    for (let i = 0; i < 8; i++)
      respaldarAntesDeMigrar(db, `00${i}_m.sql`, new Date(2026, 0, 1, 0, 0, i));
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(5);
    db.close();
  });

  it('/api/estado identifica la base: ruta absoluta y modo (demo si no es el servidor real)', async () => {
    const f = join(temp(), 'crm.db');
    const db = openDb(f);
    const demo = await request(app(db)).get('/api/estado').set('Origin', UI);
    expect(demo.body.base_datos).toEqual({ ruta: f, modo: 'demo' });
    const real = await request(app(db, 'real')).get('/api/estado').set('Origin', UI);
    expect(real.body.base_datos.modo).toBe('real');
    db.close();
  });
});

describe('P7b datos: arranque', () => {
  it('puerto ocupado: error claro en español', async () => {
    const ocupante = createServer();
    await new Promise<void>((r) => ocupante.listen(0, '127.0.0.1', () => r()));
    const puerto = (ocupante.address() as { port: number }).port;
    const db = openDb(':memory:');
    await expect(escuchar(app(db), puerto)).rejects.toThrow(
      `Puerto ${puerto} ocupado: otro proceso lo usa`,
    );
    ocupante.close();
    db.close();
  });

  it('ningún test/script apunta a la base real ni al puerto 4010', () => {
    const real = ['data', 'crm' + '.db'].join('/');
    const puerto = ':40' + '10';
    for (const f of readdirSync('test')) {
      if (!/\.(ts|mjs)$/.test(f) || f === 'p7b-datos.test.ts') continue;
      const t = readFileSync(join('test', f), 'utf8');
      expect(t.includes(real), `${f} usa la base real`).toBe(false);
      expect(t.includes(puerto), `${f} usa el puerto del CRM real`).toBe(false);
    }
    expect(existsSync('test')).toBe(true);
  });
});
