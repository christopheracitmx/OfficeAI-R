import { describe, expect, it } from 'vitest';
import { appFuentes, carpetaDatasets, fetchSim, resp } from './p11-helpers';

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
    expect(r.body.config).toEqual({
      tamano_min: 11,
      incluir_sin_tamano: true,
      pre_score_min: 70,
      correo_score_min: 60,
    });
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
