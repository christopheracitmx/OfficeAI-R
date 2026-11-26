import { describe, expect, it } from 'vitest';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { corridaBody, montar } from './runner-helpers';
import { agentes } from './runner-util';
import { appFuentes, conDatasets, fetchSim, FX, OVERPASS, resp } from './p11-helpers';

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
      m.db.prepare("UPDATE configuracion SET valor='0' WHERE clave='fuentes_pre_score_min'").run();
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
