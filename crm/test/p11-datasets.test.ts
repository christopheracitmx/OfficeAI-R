import { describe, expect, it } from 'vitest';
import { buscarDataset, metaDataset } from '../src/server/fuentes/dataset';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { importarOverture } from '../src/server/fuentes/import-overture';
import { bd, conDatasets, FX } from './p11-helpers';

describe('P11 importadores de datasets (muestras pequeñas)', () => {
  it('DENUE: filtra gobierno, fuera del piloto y micronegocios; guarda versión y atribución', async () => {
    const db = bd();
    const r = await importarDenue(db, [FX('denue-muestra.csv')], {
      version: 'DENUE 2026/05',
      fecha_dataset: '2026-05-29',
    });
    expect(r.leidos).toBe(7);
    expect(r.guardados).toBe(4);
    expect(r.descartados).toEqual({ micronegocio: 1, gobierno: 1, fuera_de_piloto: 1 });
    const m = metaDataset(db, 'denue_local')!;
    expect(m).toMatchObject({
      version: 'DENUE 2026/05',
      fecha_dataset: '2026-05-29',
      registros: 4,
    });
    const f = db
      .prepare("SELECT * FROM dataset_registros WHERE registro_id = '1001'")
      .get() as Record<string, unknown>;
    expect(f).toMatchObject({
      nombre: 'Aceros del Valle',
      scian: '331111',
      giro: 'Manufactura',
      estrato: 5,
      personal_est: 51,
      telefono: '5555550101',
      correo: 'ventas@acerosdelvalle.example',
      estado_mx: 'Estado de México',
      municipio_norm: 'naucalpan de juarez',
    });
    expect(String(f['atribucion'])).toContain('INEGI');
    // un sitio que es una página de Facebook no se guarda como sitio de la empresa
    const clinica = db
      .prepare("SELECT sitio_web FROM dataset_registros WHERE registro_id='1006'")
      .get() as {
      sitio_web: string | null;
    };
    expect(clinica.sitio_web).toBeNull();
    // el índice por nombre/municipio/SCIAN/CP existe
    const idx = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dataset_registros'",
        )
        .all() as {
        name: string;
      }[]
    ).map((x) => x.name);
    expect(idx).toEqual(
      expect.arrayContaining([
        'idx_dataset_nombre',
        'idx_dataset_municipio',
        'idx_dataset_scian',
        'idx_dataset_cp',
      ]),
    );
  });

  it('DENUE: reimportar reemplaza (actualización manual) y registra la nueva versión', async () => {
    const db = bd();
    await importarDenue(db, [FX('denue-muestra.csv')], { version: 'v1' });
    await importarDenue(db, [FX('denue-muestra.csv')], { version: 'v2', estrato_min: 3 });
    expect(metaDataset(db, 'denue_local')).toMatchObject({ version: 'v2', registros: 3 });
  });

  it('Overture: conserva licencia por origen, ignora redes sociales y descarta lo dudoso', async () => {
    const db = bd();
    const r = await importarOverture(db, FX('overture-muestra.geojsonl'), {
      version: '2026-11-18.0',
    });
    expect(r.leidos).toBe(6);
    expect(r.guardados).toBe(2);
    expect(r.descartados).toEqual({
      confianza_baja: 1,
      fuera_de_piloto: 1,
      gobierno: 1,
      json_invalido: 1,
    });
    const a = db
      .prepare("SELECT * FROM dataset_registros WHERE registro_id='ov-1'")
      .get() as Record<string, string>;
    expect(a['licencia']).toBe('CDLA Permissive 2.0');
    expect(a['atribucion']).toContain('Overture');
    expect(a['telefono']).toBe('5555550101');
    expect(JSON.stringify(a)).not.toMatch(/facebook/i);
    const b = db
      .prepare("SELECT licencia FROM dataset_registros WHERE registro_id='ov-2'")
      .get() as {
      licencia: string;
    };
    expect(b.licencia).toBe('Apache 2.0');
  });

  it('consulta local por zona, giro y tamaño: primero lo más grande, sin red ni cuota', async () => {
    const db = bd();
    await conDatasets(db);
    const q = { zona: 'CDMX', giro: 'Cualquiera', max: 10, min_personal: 11 };
    expect(buscarDataset(db, 'denue_local', q).map((c) => c.registro_id)).toEqual(['1002', '1006']);
    const edo = {
      zona: 'Edomex - Naucalpan de Juárez',
      giro: 'Cualquiera',
      max: 10,
      min_personal: 0,
    };
    expect(buscarDataset(db, 'denue_local', edo).map((c) => c.registro_id)).toEqual([
      '1001',
      '1007',
    ]);
    expect(
      buscarDataset(db, 'denue_local', { ...edo, min_personal: 11 }).map((c) => c.registro_id),
    ).toEqual(['1001']);
    expect(
      buscarDataset(db, 'denue_local', { ...edo, giro: 'Manufactura' }).map((c) => c.registro_id),
    ).toEqual(['1001']);
    expect(
      buscarDataset(db, 'denue_local', { ...edo, texto: 'colegio' }).map((c) => c.registro_id),
    ).toEqual(['1007']);
    expect(
      buscarDataset(db, 'overture_local', {
        zona: 'CDMX',
        giro: 'Corporativo y servicios profesionales',
        max: 5,
      }).map((c) => c.registro_id),
    ).toEqual(['ov-2']);
  });
});
