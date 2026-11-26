import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/server/db';
import { seed } from '../src/server/db/seed';
import type { H } from './helpers';
import { efectiva, harness } from './p9-helpers';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const personaje = (h: H, id = 'Cartografo') => h.owner.get(`/api/apariencias/personaje/${id}`);

describe('P9 migración 007 con datos previos (BD de archivo temporal)', () => {
  it('conserva empresas, prospectos y oficinas; crea tablas; los presets se siembran una vez', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig007-'));
    dirs.push(dir);
    const mig = resolve('src/server/db/migrations');
    const db = new Database(join(dir, 'crm.db'));
    db.exec('CREATE TABLE schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)');
    for (const f of [
      '001_init.sql',
      '002_office.sql',
      '003_cerebro.sql',
      '004_plan.sql',
      '005_aprendizaje.sql',
      '006_edificio.sql',
    ]) {
      db.exec(readFileSync(join(mig, f), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, 'x');
    }
    db.exec(`
      INSERT INTO corridas (zona, giro, max_empresas, motor, office_id) VALUES ('CDMX','Logística',5,'claude-code','prospeccion');
      INSERT INTO empresas (id, nombre, corrida_id) VALUES (1, 'Acme Logística SA', 1);
      INSERT INTO oficinas (id, nombre, orden) VALUES ('noticias', 'Noticias', 2);
    `);
    expect(migrate(db)).toEqual([
      '007_apariencias.sql',
      '008_p10_herramientas.sql',
      '009_fuentes.sql',
      '010_precalificacion.sql',
      '011_niveles_calidad.sql',
    ]);
    expect(db.prepare('SELECT nombre FROM empresas').get()).toEqual({
      nombre: 'Acme Logística SA',
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM oficinas').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM apariencias').get()).toEqual({ n: 0 });
    seed(db);
    seed(db);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM presets_apariencia WHERE builtin = 1').get(),
    ).toEqual({ n: 11 });
    // respaldo previo a la migración
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 11 });
    db.close();
    // reabrir con openDb no repite ni pierde nada
    const otra = openDb(join(dir, 'crm.db'));
    expect(otra.prepare('SELECT COUNT(*) AS n FROM presets_apariencia').get()).toEqual({ n: 11 });
    otra.close();
  });
});

describe('P9 API: apariencia efectiva y validación', () => {
  it('guardar un cambio lo refleja en la definición 3D; lo no guardado no', async () => {
    const h = harness();
    const antes = await efectiva(h);
    const cam0 = antes.agentes.find((a: { id: string }) => a.id === 'Cartografo').apariencia.camisa;
    const r = await h.owner.put('/api/apariencias/personaje/Cartografo', {
      overrides: { camisa: '#123456', peinado: 'rizado', nombre: 'Cami' },
    });
    expect(r.status).toBe(200);
    expect(r.body.capa.overrides.camisa).toBe('#123456');
    const despues = await efectiva(h);
    const a = despues.agentes.find((x: { id: string }) => x.id === 'Cartografo');
    expect(a.apariencia.camisa).toBe('#123456');
    expect(a.apariencia.peinado).toBe('rizado');
    expect(a.persona).toBe('Cami');
    expect(cam0).not.toBe('#123456');
    // la plantilla (base) sigue intacta y viaja en /apariencias
    const est = (await h.owner.get('/api/apariencias')).body;
    expect(
      est.base.agentes.find((x: { id: string }) => x.id === 'Cartografo').apariencia.camisa,
    ).toBe(cam0);
    expect(est.presets.length).toBeGreaterThanOrEqual(11);
  });

  it('rechaza campos inválidos, desconocidos, entidades inexistentes y falta de Origin', async () => {
    const h = harness();
    expect(
      (
        await h.owner.put('/api/apariencias/personaje/Cartografo', {
          overrides: { camisa: 'rojo' },
        })
      ).status,
    ).toBe(400);
    expect(
      (await h.owner.put('/api/apariencias/personaje/Cartografo', { overrides: { volar: 1 } }))
        .status,
    ).toBe(400);
    expect(
      (await h.owner.put('/api/apariencias/personaje/Nadie', { overrides: { camisa: '#112233' } }))
        .status,
    ).toBe(404);
    expect((await h.owner.put('/api/apariencias/animal/x', { overrides: {} })).status).toBe(400);
    const sinOrigen = await h.api
      .put('/api/apariencias/personaje/Cartografo')
      .send({ overrides: { camisa: '#112233' } });
    expect(sinOrigen.status).toBe(403);
  });

  it('el tamaño de sala se valida con el esquema de definición: traslape o pasillo bloqueado = 400', async () => {
    const h = harness();
    const ok = await h.owner.put('/api/apariencias/sala/direccion', {
      overrides: { ancho: 6, fondo: 7 },
    });
    expect(ok.status).toBe(200);
    expect(
      (await efectiva(h)).salas.find((s: { id: string }) => s.id === 'direccion').apariencia.ancho,
    ).toBe(6);
    const traslape = await h.owner.put('/api/apariencias/sala/descubrimiento', {
      overrides: { x: 3 },
    });
    expect(traslape.status).toBe(400);
    expect(traslape.body.error).toMatch(/traslapan/);
    const pasillo = await h.owner.put('/api/apariencias/sala/direccion', {
      overrides: { fondo: 11 },
    });
    expect(pasillo.status).toBe(400);
    const puestos = await h.owner.put('/api/apariencias/sala/descubrimiento', {
      overrides: { puestos: { cantidad: 3, distribucion: 'doble_fila' } },
    });
    expect(puestos.status).toBe(200);
    const def = await efectiva(h);
    expect(def.puestos.filter((p: { sala: string }) => p.sala === 'descubrimiento')).toHaveLength(
      3,
    );
  });

  it('oficina: paleta, marca blanca y ciclo; el logo se oculta', async () => {
    const h = harness();
    const r = await h.owner.put('/api/apariencias/oficina/prospeccion', {
      overrides: { marca: 'Mi Marca', logo: 'ninguno', ciclo: 'hora', hora: 21 },
    });
    expect(r.status).toBe(200);
    const d = await efectiva(h);
    expect(d.office.logo).toBeNull();
    expect(d.office.apariencia.marca).toBe('Mi Marca');
    expect(d.office.apariencia.ciclo).toBe('hora');
  });
});

describe('P9 versiones: deshacer, rehacer, restaurar y restablecer', () => {
  it('historial lineal, rehacer se descarta al guardar tras deshacer y todo queda en cambios_log', async () => {
    const h = harness();
    const put = (camisa: string) =>
      h.owner.put('/api/apariencias/personaje/Cartografo', { overrides: { camisa } });
    expect((await personaje(h)).body.capa).toBeNull();
    await put('#111111');
    await put('#222222');
    let c = (await personaje(h)).body.capa;
    expect(c.overrides.camisa).toBe('#222222');
    expect(c.puedeDeshacer).toBe(true);
    expect(c.puedeRehacer).toBe(false);
    c = (await h.owner.post('/api/apariencias/personaje/Cartografo/deshacer')).body.capa;
    expect(c.overrides.camisa).toBe('#111111');
    expect(c.puedeRehacer).toBe(true);
    c = (await h.owner.post('/api/apariencias/personaje/Cartografo/rehacer')).body.capa;
    expect(c.overrides.camisa).toBe('#222222');
    await h.owner.post('/api/apariencias/personaje/Cartografo/deshacer');
    await put('#333333');
    c = (await personaje(h)).body.capa;
    expect(c.overrides.camisa).toBe('#333333');
    expect(c.puedeRehacer).toBe(false);
    // deshacer hasta la plantilla y luego nada que deshacer
    await h.owner.post('/api/apariencias/personaje/Cartografo/deshacer');
    await h.owner.post('/api/apariencias/personaje/Cartografo/deshacer');
    expect((await personaje(h)).body.capa.overrides).toEqual({});
    expect((await h.owner.post('/api/apariencias/personaje/Cartografo/deshacer')).status).toBe(409);
    expect((await h.owner.post('/api/apariencias/personaje/Cartografo/rehacer')).status).toBe(200);
    // restaurar una versión crea una nueva (rollback sin perder historial)
    const versiones = (await personaje(h)).body.versiones as { version: number }[];
    const v1 = versiones.find((v) => v.version === 2)!;
    const r = await h.owner.post('/api/apariencias/personaje/Cartografo/restaurar', {
      version: v1.version,
    });
    expect(r.status).toBe(200);
    expect(r.body.capa.overrides.camisa).toBe('#111111');
    expect(r.body.versiones.length).toBeGreaterThan(versiones.length - 1);
    // restablecer = plantilla, pero reversible
    const x = await h.owner.post('/api/apariencias/personaje/Cartografo/restablecer');
    expect(x.body.capa.overrides).toEqual({});
    expect(x.body.capa.puedeDeshacer).toBe(true);
    const log = h.db
      .prepare(
        "SELECT accion FROM cambios_log WHERE entidad = 'apariencia' AND office_id = 'prospeccion'",
      )
      .all() as { accion: string }[];
    expect(log.length).toBeGreaterThanOrEqual(8);
    expect(log.some((l) => l.accion === 'deshizo un cambio')).toBe(true);
    expect(log.some((l) => l.accion.startsWith('restauró'))).toBe(true);
  });
});

describe('P9 aleatorio con semilla y paridad en equipos', () => {
  it('misma semilla = mismo resultado (por personaje y por equipo)', async () => {
    const a = harness();
    const b = harness();
    const ra = await a.owner.post('/api/apariencias/personaje/Analista/aleatorio', { semilla: 42 });
    const rb = await b.owner.post('/api/apariencias/personaje/Analista/aleatorio', { semilla: 42 });
    expect(ra.status).toBe(200);
    expect(ra.body.capa.overrides).toEqual(rb.body.capa.overrides);
    expect(ra.body.capa.overrides.cuerpo).toBeUndefined();
    const ea = await a.owner.post('/api/apariencias/equipo', { accion: 'aleatorio', semilla: 7 });
    const eb = await b.owner.post('/api/apariencias/equipo', { accion: 'aleatorio', semilla: 7 });
    expect((await efectiva(a)).agentes).toEqual((await efectiva(b)).agentes);
    expect(ea.body.paridad).toEqual({ f: 6, m: 6, equilibrado: true });
    expect(eb.body.cambiados).toBe(12);
  });

  it('rebalancea una paridad rota con el mínimo de cambios y la deja 50/50', async () => {
    const h = harness();
    const d = await efectiva(h);
    // Forzamos 9 mujeres / 3 hombres desde la UI de género
    const hombres = d.agentes.filter((a: { genero: string }) => a.genero === 'm').slice(0, 3);
    for (const a of hombres)
      await h.owner.put(`/api/apariencias/personaje/${a.id}`, { overrides: { cuerpo: 'f' } });
    const r = await h.owner.post('/api/apariencias/equipo', { accion: 'aleatorio', semilla: 3 });
    expect(r.body.paridad).toEqual({ f: 6, m: 6, equilibrado: true });
  });

  it('presets de equipo cambian solo la ropa y restablecer vuelve a la plantilla', async () => {
    const h = harness();
    const base = (await h.owner.get('/api/apariencias')).body.base;
    await h.owner.post('/api/apariencias/equipo', { accion: 'formal' });
    const d = await efectiva(h);
    const mich = d.agentes.find((a: { id: string }) => a.id === 'Coordinador');
    expect(mich.apariencia.camisa).toBe('#F4F8FA');
    expect(mich.apariencia.accesorio).toBe('corbata');
    const b0 = base.agentes.find((a: { id: string }) => a.id === 'Coordinador');
    expect(mich.apariencia.piel).toBe(b0.apariencia.piel);
    expect(mich.apariencia.peinado).toBe(b0.apariencia.peinado);
    await h.owner.post('/api/apariencias/equipo', { accion: 'restablecer' });
    expect(
      (await efectiva(h)).agentes.find((a: { id: string }) => a.id === 'Coordinador').apariencia,
    ).toEqual(b0.apariencia);
  });
});
