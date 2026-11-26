import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/server/db';
import { seed } from '../src/server/db/seed';
import { harness as harnessVacio, type H } from './helpers';

const ROSTER = [
  ['Coordinador', 'Michael', 'm', 'Dirección'],
  ['Cartografo', 'Camila', 'f', 'Descubrimiento'],
  ['Explorador', 'Mateo', 'm', 'Descubrimiento'],
  ['Guardian', 'Gabriela', 'f', 'Investigación'],
  ['Rastreador', 'Rodrigo', 'm', 'Investigación'],
  ['Analista', 'Ana', 'f', 'Investigación'],
  ['Estratega', 'Esteban', 'm', 'Estrategia'],
  ['Armador', 'Alejandra', 'f', 'Estrategia'],
  ['QA-1', 'Iván', 'm', 'Calidad'],
  ['QA-2', 'Valeria', 'f', 'Calidad'],
  ['Calificador', 'Carla', 'f', 'Reporte'],
  ['Redactor', 'Hugo', 'm', 'Reporte'],
] as const;

/** Harness con los 12 agentes de prospección (en producción los siembra el cargador de oficinas). */
function harness(): H {
  const h = harnessVacio();
  const ins = h.db.prepare(
    "INSERT OR IGNORE INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES ('prospeccion', ?, ?, ?, ?, ?, ?)",
  );
  for (const [id, persona, g, area] of ROSTER) ins.run(id, id, persona, g, id, area);
  return h;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const personaje = (h: H, id = 'Cartografo') => h.owner.get(`/api/apariencias/personaje/${id}`);
const efectiva = async (h: H, office = 'prospeccion') =>
  (await h.owner.get(`/api/oficinas/${office}/definicion`)).body;

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
    expect(migrate(db)).toEqual(['007_apariencias.sql']);
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
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 7 });
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

describe('P9 presets: propios, duplicar, borrar, importar y exportar', () => {
  it('crear, aplicar, duplicar y borrar propios; los builtin no se borran', async () => {
    const h = harness();
    const p = await h.owner.post('/api/apariencias/presets', {
      tipo: 'personaje',
      nombre: 'Mi look',
      json: { camisa: '#ABCDEF', pantalon: '#101010' },
    });
    expect(p.status).toBe(201);
    expect(p.body.builtin).toBe(false);
    const r = await h.owner.put('/api/apariencias/personaje/Analista', {
      preset: p.body.id,
      overrides: {},
    });
    expect(r.status).toBe(200);
    expect(
      (await efectiva(h)).agentes.find((a: { id: string }) => a.id === 'Analista').apariencia
        .camisa,
    ).toBe('#ABCDEF');
    // un override gana al preset
    await h.owner.put('/api/apariencias/personaje/Analista', {
      preset: p.body.id,
      overrides: { camisa: '#00FF00' },
    });
    const ef = (await efectiva(h)).agentes.find(
      (a: { id: string }) => a.id === 'Analista',
    ).apariencia;
    expect(ef.camisa).toBe('#00FF00');
    expect(ef.pantalon).toBe('#101010');
    const dup = await h.owner.post(`/api/apariencias/presets/${p.body.id}/duplicar`);
    expect(dup.status).toBe(201);
    expect(dup.body.nombre).toBe('Mi look (copia)');
    expect((await h.owner.del(`/api/apariencias/presets/${dup.body.id}`)).status).toBe(200);
    const builtin = (await h.owner.get('/api/apariencias/presets?tipo=personaje')).body.find(
      (x: { builtin: boolean }) => x.builtin,
    );
    expect((await h.owner.del(`/api/apariencias/presets/${builtin.id}`)).status).toBe(403);
    // un preset borrado no rompe la composición: queda la plantilla + overrides
    await h.owner.del(`/api/apariencias/presets/${p.body.id}`);
    const tras = (await efectiva(h)).agentes.find(
      (a: { id: string }) => a.id === 'Analista',
    ).apariencia;
    expect(tras.camisa).toBe('#00FF00');
    // preset inválido y vacío
    expect(
      (
        await h.owner.post('/api/apariencias/presets', {
          tipo: 'personaje',
          nombre: 'x',
          json: { camisa: 'z' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.owner.post('/api/apariencias/presets', {
          tipo: 'personaje',
          nombre: 'x',
          json: { nombre: 'Pepe' },
        })
      ).status,
    ).toBe(400);
  });

  it('exportar → importar conserva el contenido; rechaza JSON inválido, formato ajeno y gigante', async () => {
    const h = harness();
    const builtin = (await h.owner.get('/api/apariencias/presets?tipo=oficina')).body[0];
    const exp = await h.owner.get(`/api/apariencias/presets/${builtin.id}/exportar`);
    expect(exp.body.formato).toBe('acitmx-preset');
    const imp = await h.owner.post('/api/apariencias/presets/importar', {
      contenido: JSON.stringify(exp.body),
    });
    expect(imp.status).toBe(201);
    expect(imp.body.json).toEqual(builtin.json);
    expect(imp.body.builtin).toBe(false);
    expect(imp.body.nombre).toContain(builtin.nombre);
    expect(
      (await h.owner.post('/api/apariencias/presets/importar', { contenido: '{no es json' }))
        .status,
    ).toBe(400);
    expect(
      (
        await h.owner.post('/api/apariencias/presets/importar', {
          contenido: { formato: 'otro', version: 1 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await h.owner.post('/api/apariencias/presets/importar', {
          contenido: { ...exp.body, json: { colores: { primario: 'x' } } },
        })
      ).status,
    ).toBe(400);
    const gigante = JSON.stringify({
      ...exp.body,
      json: { camisa: '#112233', relleno: 'x'.repeat(30000) },
    });
    const g = await h.owner.post('/api/apariencias/presets/importar', { contenido: gigante });
    expect(g.status).toBe(413);
  });
});

describe('P9 aislamiento por office_id y duplicado de piso', () => {
  it('las apariencias y presets propios de un piso no aparecen en otro', async () => {
    const h = harness();
    const n = await h.owner.post('/api/oficinas', { nombre: 'Noticias', plantilla: 'vacia' });
    const id = n.body.id as string;
    await h.owner.put('/api/apariencias/oficina/prospeccion', {
      overrides: { marca: 'Solo prospección' },
    });
    const p = await h.owner.post('/api/apariencias/presets', {
      tipo: 'sala',
      nombre: 'Solo aquí',
      json: { colorPared: '#112233' },
    });
    expect((await efectiva(h, id)).office.apariencia.marca).toBe('');
    const otros = await h.ownerEn(id).get('/api/apariencias/presets');
    expect(otros.body.some((x: { id: number }) => x.id === p.body.id)).toBe(false);
    const mios = await h.owner.get('/api/apariencias/presets');
    expect(mios.body.some((x: { id: number }) => x.id === p.body.id)).toBe(true);
    // aplicar a otro piso un preset ajeno falla
    const ajeno = await h
      .ownerEn(id)
      .put('/api/apariencias/sala/recepcion', { preset: p.body.id, overrides: {} });
    expect(ajeno.status).toBe(400);
  });

  it('duplicar un piso copia sus apariencias, remapea presets propios y la capa de la oficina', async () => {
    const h = harness();
    await h.owner.put('/api/apariencias/personaje/Cartografo', {
      overrides: { camisa: '#ABCDEF' },
    });
    await h.owner.put('/api/apariencias/oficina/prospeccion', {
      overrides: { marca: 'Mi Marca', fachada: { estilo: 'ladrillo', color: '#AA5533' } },
    });
    const p = await h.owner.post('/api/apariencias/presets', {
      tipo: 'sala',
      nombre: 'Mío',
      json: { colorPared: '#223344' },
    });
    await h.owner.put('/api/apariencias/sala/direccion', { preset: p.body.id, overrides: {} });
    const dup = await h.owner.post('/api/oficinas', {
      nombre: 'Norte',
      plantilla: 'duplicar',
      origen: 'prospeccion',
    });
    expect(dup.status).toBe(201);
    const d = await efectiva(h, dup.body.id);
    expect(d.agentes.find((a: { id: string }) => a.id === 'Cartografo').apariencia.camisa).toBe(
      '#ABCDEF',
    );
    expect(d.office.apariencia.marca).toBe('Mi Marca');
    expect(d.office.apariencia.fachada.estilo).toBe('ladrillo');
    expect(d.salas.find((s: { id: string }) => s.id === 'direccion').apariencia.colorPared).toBe(
      '#223344',
    );
    // el original no cambia al editar la copia
    await h
      .ownerEn(dup.body.id)
      .put(`/api/apariencias/oficina/${dup.body.id}`, { overrides: { marca: 'Otra' } });
    expect((await efectiva(h)).office.apariencia.marca).toBe('Mi Marca');
    const ids = h.db
      .prepare('SELECT id FROM presets_apariencia WHERE office_id = ?')
      .all(dup.body.id);
    expect(ids).toHaveLength(1);
  });
});
