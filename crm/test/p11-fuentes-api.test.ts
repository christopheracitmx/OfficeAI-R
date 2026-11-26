import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, openDb } from '../src/server/db';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { corridaBody, montar } from './runner-helpers';
import { agentes } from './runner-util';
import {
  appFuentes,
  carpetaDatasets,
  conDatasets,
  dirTemporal,
  fetchSim,
  FX,
  OVERPASS,
  resp,
} from './p11-helpers';

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

    expect(migrate(db)).toEqual(['009_fuentes.sql']);
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

describe('P11 rutas del dueño: Configuración → Fuentes de descubrimiento', () => {
  it('lista fuentes con token sí/no sin mostrar su valor, cuota/tope, dataset y licencias', async () => {
    const t = appFuentes({
      env: { DENUE_TOKEN: 'valor-secreto-xyz' },
      dirDatasets: carpetaDatasets(),
    });
    const r = await t.dueno().get('/api/fuentes');
    expect(r.status).toBe(200);
    const fuentes = r.body.fuentes as {
      id: string;
      token_configurado: boolean | null;
      activa: boolean;
      cuota: { tope: number | null };
      licencia: string;
    }[];
    expect(fuentes.map((f) => f.id)).toEqual([
      'denue_local',
      'overture_local',
      'denue_api',
      'osm_overpass',
    ]);
    expect(fuentes.find((f) => f.id === 'denue_api')).toMatchObject({
      token_configurado: true,
      activa: true,
    });
    expect(fuentes.find((f) => f.id === 'denue_local')).toMatchObject({
      token_configurado: null,
      activa: true,
    });
    expect(fuentes.find((f) => f.id === 'osm_overpass')!.activa).toBe(false); // opt-in
    expect(fuentes.find((f) => f.id === 'denue_local')!.cuota.tope).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('valor-secreto-xyz');
    expect(r.body.descartadas.map((d: { id: string }) => d.id)).toEqual(
      expect.arrayContaining([
        'facebook_instagram',
        'seccion_amarilla',
        'yelp_fusion',
        'mapbox_search',
      ]),
    );
    expect(r.body.config).toEqual({ tamano_min: 11, incluir_sin_tamano: true });
  });

  it('activar/desactivar es por oficina y el tope solo aplica a fuentes con cuota', async () => {
    const t = appFuentes({});
    expect((await t.dueno().patch('/api/fuentes/osm_overpass', { activa: true })).status).toBe(200);
    const ven = async (office?: string) =>
      (
        (await t.dueno(office).get('/api/fuentes')).body.fuentes as {
          id: string;
          activa: boolean;
        }[]
      ).find((f) => f.id === 'osm_overpass')!.activa;
    expect(await ven()).toBe(true);
    expect(await ven('noticias')).toBe(false); // otra oficina no cambia
    expect((await t.dueno().patch('/api/fuentes/denue_local', { tope_mensual: 5 })).status).toBe(
      400,
    );
    expect((await t.dueno().patch('/api/fuentes/osm_overpass', { tope_mensual: 5 })).status).toBe(
      200,
    );
    const fs = (await t.dueno().get('/api/fuentes')).body.fuentes as {
      id: string;
      cuota: { tope: number };
    }[];
    expect(fs.find((f) => f.id === 'osm_overpass')!.cuota.tope).toBe(5);
    expect((await t.dueno().patch('/api/fuentes/inventada', { activa: true })).status).toBe(404);
    expect((await t.dueno().patch('/api/fuentes-config', { tamano_min: 31 })).status).toBe(200);
    expect((await t.dueno().get('/api/fuentes')).body.config.tamano_min).toBe(31);
  });

  it('«probar conexión» hace una consulta mínima y respeta el tope', async () => {
    const f = fetchSim([() => resp({ elements: [] })]);
    const t = appFuentes({ fetchFn: f.fn });
    const r = await t.dueno().post('/api/fuentes/osm_overpass/probar');
    expect(r.body.ok).toBe(true);
    expect(f.llamadas).toHaveLength(1);
    expect(
      t.db.prepare("SELECT contador FROM fuentes_uso WHERE fuente_id='osm_overpass'").get(),
    ).toEqual({ contador: 1 });
    t.db.prepare("UPDATE configuracion SET valor='1' WHERE clave='fuente_tope_osm_overpass'").run();
    const r2 = await t.dueno().post('/api/fuentes/osm_overpass/probar');
    expect(r2.body.ok).toBe(false);
    expect(r2.body.detalle).toMatch(/quota_exceeded/);
    expect(f.llamadas).toHaveLength(1);
    const sinToken = await t.dueno().post('/api/fuentes/denue_api/probar');
    expect(sinToken.body).toEqual({ ok: false, detalle: 'Falta DENUE_TOKEN en crm/.env' });
  });

  it('importa datasets solo desde la carpeta de datasets (sin rutas arbitrarias)', async () => {
    const t = appFuentes({ dirDatasets: carpetaDatasets() });
    const lista = await t.dueno().get('/api/fuentes/denue_local/archivos');
    expect(lista.body.archivos.map((a: { nombre: string }) => a.nombre)).toEqual([
      'denue-muestra.csv',
    ]);
    expect(
      (
        await t
          .dueno()
          .post('/api/fuentes/denue_local/importar', { archivos: ['../x.csv'], version: 'v' })
      ).status,
    ).toBe(400);
    expect(
      (
        await t
          .dueno()
          .post('/api/fuentes/denue_local/importar', { archivos: ['no-existe.csv'], version: 'v' })
      ).status,
    ).toBe(404);
    const ok = await t.dueno().post('/api/fuentes/denue_local/importar', {
      archivos: ['denue-muestra.csv'],
      version: 'DENUE 2026/05',
    });
    expect(ok.body).toMatchObject({ leidos: 7, guardados: 4 });
    const ov = await t.dueno().post('/api/fuentes/overture_local/importar', {
      archivos: ['overture-muestra.geojsonl'],
      version: '2026-11-18.0',
    });
    expect(ov.body.guardados).toBe(2);
    const fs = (await t.dueno().get('/api/fuentes')).body.fuentes as {
      id: string;
      dataset: { registros: number; version: string } | null;
    }[];
    expect(fs.find((f) => f.id === 'denue_local')!.dataset).toMatchObject({
      registros: 4,
      version: 'DENUE 2026/05',
    });
  });
});

describe('P11 herramientas de agente (fuente_buscar y directorio_importar_candidatos)', () => {
  it('fuente_buscar registra por código, no repite y solo existe en prospección', async () => {
    const t = appFuentes({});
    await conDatasets(t.db);
    const r = await t
      .agente()
      .post('/fuentes/buscar', { fuente: 'denue_local', zona: 'CDMX', giro: 'Cualquiera', max: 5 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      fuente: 'denue_local',
      estado: 'ok',
      nuevos: 2,
      encontrados: 2,
    });
    expect(r.body.registradas.map((x: { nombre: string }) => x.nombre).sort()).toEqual([
      'Clínica Santa Fe',
      'Logística Norte',
    ]);
    const otra = await t
      .agente()
      .post('/fuentes/buscar', { fuente: 'denue_local', zona: 'CDMX', giro: 'Cualquiera', max: 5 });
    expect(otra.body).toMatchObject({ estado: 'sin_datos', nuevos: 0 });
    expect(
      (await t.agente('noticias').post('/fuentes/buscar', { fuente: 'denue_local', max: 5 }))
        .status,
    ).toBe(403);
    expect((await t.agente().post('/fuentes/buscar', { fuente: 'google_maps' })).status).toBe(400);
    expect(
      t.db.prepare("SELECT COUNT(*) AS n FROM empresas WHERE office_id='noticias'").get(),
    ).toEqual({ n: 0 });
  });

  it('importa candidatos de páginas públicas con filtros y dedupe; exige fuente_url y método permitido', async () => {
    const t = appFuentes({});
    const c = (nombre: string, extra: object = {}) => ({
      nombre,
      fuente_url: 'https://camara.example/lista',
      ...extra,
    });
    const r = await t.agente().post('/fuentes/importar-candidatos', {
      metodo: 'directorio_publico',
      consulta: 'cámara industrial Naucalpan',
      candidatos: [
        c('Plásticos Uno SA', {
          direccion: 'Naucalpan de Juárez, Estado de México',
          sitio_web: 'https://plasticosuno.example',
        }),
        c('Plásticos Uno', {
          sitio_web: 'https://plasticosuno.example',
          fuente_url: 'https://otra.example/x',
        }),
        c('Plásticos Uno SA', { direccion: 'Naucalpan de Juárez, Estado de México' }),
        c('Ayuntamiento de Naucalpan'),
        c('Facebook Fan', { sitio_web: 'https://facebook.com/fan' }),
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nuevas: 2, fusionadas: 1, existentes: 1 });
    expect(r.body.rechazadas).toEqual([
      { nombre: 'Ayuntamiento de Naucalpan', motivo: 'gobierno' },
    ]);
    expect(
      t.db
        .prepare(
          "SELECT metodo_descubrimiento AS m, sitio_web FROM empresas WHERE nombre='Facebook Fan'",
        )
        .get(),
    ).toEqual({ m: 'directorio_publico', sitio_web: null });
    expect(
      (
        await t.agente().post('/fuentes/importar-candidatos', {
          metodo: 'places',
          consulta: 'xx',
          candidatos: [c('Algo SA')],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.agente().post('/fuentes/importar-candidatos', {
          metodo: 'nicho_web',
          consulta: 'xx',
          candidatos: [{ nombre: 'Sin url' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.agente('noticias').post('/fuentes/importar-candidatos', {
          metodo: 'nicho_web',
          consulta: 'xx',
          candidatos: [c('Algo SA')],
        })
      ).status,
    ).toBe(403);
  });

  it('el panel de Corrida resume lo que aportó cada fuente', async () => {
    const f = fetchSim([() => resp(OVERPASS)]);
    const t = appFuentes({ fetchFn: f.fn });
    await conDatasets(t.db);
    await t.dueno().patch('/api/fuentes/osm_overpass', { activa: true });
    const corrida = Number(
      t.db
        .prepare(
          "INSERT INTO corridas (zona, giro, max_empresas, motor, params) VALUES ('CDMX','Cualquiera',5,'x','{}')",
        )
        .run().lastInsertRowid,
    );
    await t
      .agente()
      .post('/fuentes/buscar', { fuente: 'denue_local', zona: 'CDMX', giro: 'Cualquiera', max: 5 });
    t.db.prepare('UPDATE candidatos_fuente SET corrida_id = ?').run(corrida);
    const r = await t.dueno().get(`/api/fuentes/corrida/${corrida}`);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({
      fuente_id: 'denue_local',
      nuevos: 2,
      estado: 'ok',
      nombre: 'DENUE (descarga masiva local)',
    });
    expect((await t.dueno('noticias').get(`/api/fuentes/corrida/${corrida}`)).body).toEqual([]);
  });
});

describe('P11 el runner usa primero las fuentes por código y luego a los agentes', () => {
  it('completa el lote con DENUE local sin llamar al Explorador ni al Cartógrafo', async () => {
    const m = await montar();
    try {
      await importarDenue(m.db, [FX('denue-muestra.csv')], { version: 'muestra' });
      const r = await m.post('/api/corridas', corridaBody(2));
      expect(r.status).toBe(201);
      await m.runner.esperarFin();
      const id = r.body.id as number;
      const e = m.db
        .prepare('SELECT metodo_descubrimiento AS m, corrida_id FROM empresas ORDER BY id')
        .all();
      expect(e).toEqual([
        { m: 'denue_local', corrida_id: id },
        { m: 'denue_local', corrida_id: id },
      ]);
      const a = agentes(m);
      expect(a).not.toContain('Explorador');
      expect(a).not.toContain('Cartografo');
      expect(a[0]).toBe('Guardian');
      expect(
        m.db
          .prepare('SELECT fuente_id, nuevos, estado FROM candidatos_fuente WHERE corrida_id = ?')
          .all(id),
      ).toEqual([{ fuente_id: 'denue_local', nuevos: 2, estado: 'ok' }]);
      const actividad = m.db
        .prepare(
          "SELECT COUNT(*) AS n FROM actividad_agentes WHERE accion LIKE 'descubrimiento por código%'",
        )
        .get() as { n: number };
      expect(actividad.n).toBe(1);
    } finally {
      m.cerrar();
    }
  });

  it('sin datasets (corridas actuales) todo sigue igual: el Explorador completa el lote', async () => {
    const m = await montar();
    try {
      const r = await m.post('/api/corridas', corridaBody(2));
      await m.runner.esperarFin();
      expect(r.status).toBe(201);
      expect(agentes(m).slice(0, 2)).toEqual(['Explorador', 'Guardian']);
      expect(m.db.prepare('SELECT estado FROM corridas WHERE id = ?').get(r.body.id)).toEqual({
        estado: 'terminada',
      });
    } finally {
      m.cerrar();
    }
  });
});
