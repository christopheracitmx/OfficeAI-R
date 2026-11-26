import { describe, expect, it } from 'vitest';
import { efectiva, harness } from './p9-helpers';

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
