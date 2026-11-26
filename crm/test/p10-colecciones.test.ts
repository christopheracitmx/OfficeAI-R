import { describe, expect, it } from 'vitest';
import { claveNormalizada, coleccionInput, validarDatos } from '../src/shared/colecciones';
import { harness } from './helpers';

const CAMPOS = [
  { nombre: 'titulo', etiqueta: 'Título', tipo: 'texto', requerido: true },
  { nombre: 'enlace', etiqueta: 'Enlace', tipo: 'url', requerido: true },
  { nombre: 'precio', etiqueta: 'Precio', tipo: 'numero', requerido: false },
  { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: false },
  { nombre: 'ok', etiqueta: 'Verificado', tipo: 'booleano', requerido: false },
  {
    nombre: 'nivel',
    etiqueta: 'Nivel',
    tipo: 'enum',
    requerido: false,
    opciones: ['alto', 'bajo'],
  },
];

async function conColeccion() {
  const h = harness();
  await h.owner.post('/api/oficinas', { nombre: 'Noticias' });
  await h.owner.post('/api/oficinas', { nombre: 'Archivos' });
  const o = h.ownerEn('noticias');
  const c = await o.post('/api/colecciones', {
    nombre: 'Noticias',
    campos: CAMPOS,
    clave: 'enlace',
  });
  return { h, o, id: c.body.id as number, c };
}

describe('P10 esquema de colecciones', () => {
  it('valida tipos, obligatorios y campos desconocidos', () => {
    const campos = coleccionInput.parse({
      nombre: 'Prueba',
      campos: CAMPOS,
      clave: 'enlace',
    }).campos;
    expect(
      validarDatos(campos, {
        titulo: 'A',
        enlace: 'https://a.com',
        precio: '12.5',
        fecha: '2026-02-03',
        ok: true,
        nivel: 'alto',
      }),
    ).toMatchObject({ ok: true, datos: { precio: 12.5 } });
    const mal = validarDatos(campos, {
      enlace: 'javascript:alert(1)',
      precio: 'abc',
      fecha: '2026-02-30',
      ok: 'si',
      nivel: 'medio',
      extra: 1,
    });
    expect(mal.ok).toBe(false);
    expect(mal.errores.join('|')).toMatch(/obligatorio/);
    expect(mal.errores.join('|')).toMatch(/desconocido: extra/);
    expect(mal.errores.length).toBeGreaterThanOrEqual(6);
  });

  it('rechaza esquemas inválidos (clave inexistente, repetidos, enum sin opciones)', () => {
    expect(() =>
      coleccionInput.parse({ nombre: 'Prueba', campos: CAMPOS, clave: 'nada' }),
    ).toThrow();
    expect(() =>
      coleccionInput.parse({ nombre: 'Prueba', campos: [CAMPOS[0], CAMPOS[0]], clave: null }),
    ).toThrow();
    expect(() =>
      coleccionInput.parse({
        nombre: 'X',
        campos: [{ nombre: 'e', etiqueta: 'E', tipo: 'enum', requerido: false }],
        clave: null,
      }),
    ).toThrow();
    expect(() =>
      coleccionInput.parse({
        nombre: 'X',
        campos: [{ nombre: 'Mal Nombre', etiqueta: 'E', tipo: 'texto', requerido: false }],
        clave: null,
      }),
    ).toThrow();
  });

  it('normaliza la clave de deduplicación', () => {
    expect(claveNormalizada('enlace', { enlace: ' HTTPS://A.com/x/ ' })).toBe('https://a.com/x');
    expect(claveNormalizada(null, {})).toBeNull();
  });
});

describe('P10 colecciones por oficina (API del dueño)', () => {
  it('crea, rechaza duplicados de nombre y aísla por oficina', async () => {
    const { o, h, c } = await conColeccion();
    expect(c.status).toBe(201);
    const dup = await o.post('/api/colecciones', { nombre: 'Noticias', campos: CAMPOS });
    expect(dup.status).toBe(409);
    // otra oficina puede usar el mismo nombre y NO ve la de noticias
    const otra = h.ownerEn('archivos');
    expect((await otra.get('/api/colecciones')).body).toEqual([]);
    const c2 = await otra.post('/api/colecciones', {
      nombre: 'Noticias',
      campos: CAMPOS.slice(0, 2),
    });
    expect(c2.status).toBe(201);
    expect(c2.body.id).not.toBe(c.body.id);
    // acceso cruzado por id: 404
    expect((await otra.get(`/api/colecciones/${c.body.id}`)).status).toBe(404);
    expect((await otra.get(`/api/colecciones/${c.body.id}/registros`)).status).toBe(404);
    expect(
      (
        await otra.post(`/api/colecciones/${c.body.id}/registros`, {
          datos: { titulo: 'x', enlace: 'https://x.com' },
          fuente_url: 'https://x.com',
        })
      ).status,
    ).toBe(404);
  });

  it('upsert valida, exige fuente, deduplica por clave y guarda historial', async () => {
    const { o, id } = await conColeccion();
    const sinFuente = await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: 'A', enlace: 'https://a.com/1' },
    });
    expect(sinFuente.status).toBe(422);
    const r1 = await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: 'A', enlace: 'https://a.com/1' },
      fuente_url: 'https://a.com/1',
    });
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ accion: 'creado', version: 1 });
    const igual = await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: 'A', enlace: 'https://a.com/1' },
      fuente_url: 'https://a.com/1',
    });
    expect(igual.body.accion).toBe('sin_cambios');
    const cambia = await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: 'A cambiado', enlace: 'HTTPS://A.COM/1/' },
      fuente_url: 'https://a.com/1',
    });
    expect(cambia.body).toMatchObject({ accion: 'actualizado', id: r1.body.id, version: 2 });
    const lista = await o.get(`/api/colecciones/${id}/registros`);
    expect(lista.body.total).toBe(1);
    const hist = await o.get(`/api/colecciones/${id}/registros/${r1.body.id}/historial`);
    expect(hist.body.map((x: { version: number }) => x.version)).toEqual([2, 1]);
  });

  it('archivar no borra: el registro sale de la vista activa y el upsert lo reactiva', async () => {
    const { o, id, h } = await conColeccion();
    const r = await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: 'A', enlace: 'https://a.com/1' },
      fuente_url: 'https://a.com/1',
    });
    await o.post(`/api/colecciones/${id}/registros/${r.body.id}/archivar`);
    expect((await o.get(`/api/colecciones/${id}/registros`)).body.total).toBe(0);
    expect((await o.get(`/api/colecciones/${id}/registros?estado=archivado`)).body.total).toBe(1);
    const fisicos = h.db.prepare('SELECT COUNT(*) AS n FROM coleccion_registros').get() as {
      n: number;
    };
    expect(fisicos.n).toBe(1);
    const re = await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: 'A', enlace: 'https://a.com/1' },
      fuente_url: 'https://a.com/1',
    });
    expect(re.body).toMatchObject({ accion: 'actualizado', id: r.body.id });
    expect((await o.get(`/api/colecciones/${id}/registros`)).body.total).toBe(1);
  });

  it('el esquema solo crece: no se quitan campos ni se cambia el tipo', async () => {
    const { o, id } = await conColeccion();
    const sinCampo = await o.patch(`/api/colecciones/${id}`, { campos: CAMPOS.slice(0, 3) });
    expect(sinCampo.status).toBe(422);
    const otroTipo = await o.patch(`/api/colecciones/${id}`, {
      campos: CAMPOS.map((c) => (c.nombre === 'precio' ? { ...c, tipo: 'texto' } : c)),
    });
    expect(otroTipo.status).toBe(422);
    const ok = await o.patch(`/api/colecciones/${id}`, {
      campos: [...CAMPOS, { nombre: 'nota2', etiqueta: 'Nota', tipo: 'texto', requerido: false }],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.campos).toHaveLength(7);
  });

  it('CSV protegido contra fórmulas y filtro por texto', async () => {
    const { o, id } = await conColeccion();
    await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: '=HYPERLINK("http://x")', enlace: 'https://a.com/1', precio: -5 },
      fuente_url: 'https://a.com/1',
    });
    await o.post(`/api/colecciones/${id}/registros`, {
      datos: { titulo: '+cmd|calc', enlace: 'https://a.com/2' },
      fuente_url: 'https://a.com/2',
      nota: '@SUMA(1)',
    });
    const csv = await o.get(`/api/colecciones/${id}/csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const texto = csv.text;
    expect(texto).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(texto).toContain("'+cmd|calc");
    expect(texto).toContain("'@SUMA(1)");
    expect(texto).toContain(',-5,'); // número negativo legítimo no se altera
    expect(texto.split('\r\n').filter((l) => /^[=+@]/.test(l))).toEqual([]);
    const f = await o.get(`/api/colecciones/${id}/registros?q=cmd`);
    expect(f.body.total).toBe(1);
    // % y _ se buscan literalmente (no son comodines)
    expect((await o.get(`/api/colecciones/${id}/registros?q=%25`)).body.total).toBe(0);
  });

  it('exige Origin de la UI para mutar', async () => {
    const { h } = await conColeccion();
    const r = await h.api
      .post('/api/colecciones')
      .send({ nombre: 'Prueba', campos: CAMPOS.slice(0, 1) });
    expect(r.status).toBe(403);
  });
});

describe('P10 herramientas coleccion_* del agente', () => {
  it('upsert exige fuente, valida esquema, respeta la oficina y el allowlist', async () => {
    const { h, o, id } = await conColeccion();
    const ag = h.agent('Asistente');
    const mio = (r: import('supertest').Test) => r.set('x-office-id', 'noticias');
    const post = (b: object) => mio(ag.post('/coleccion/upsert', b));
    expect(
      (await post({ coleccion: 'Noticias', datos: { titulo: 'T', enlace: 'https://n.com/1' } }))
        .status,
    ).toBe(400);
    expect(
      (await post({ coleccion: 'Noticias', datos: { titulo: 'T' }, fuente_url: 'https://n.com/1' }))
        .status,
    ).toBe(422);
    const ok = await post({
      coleccion: 'Noticias',
      datos: { titulo: 'T', enlace: 'https://n.com/1' },
      fuente_url: 'https://n.com/1',
    });
    expect(ok.status).toBe(201);
    const busca = await mio(ag.get('/coleccion/buscar?coleccion=Noticias&texto=T'));
    expect(busca.body.total).toBe(1);
    expect(busca.body.registros[0].fuente_url).toBe('https://n.com/1');
    // la actividad queda en la oficina correcta
    const act = (await o.get('/api/actividad')).body as { accion: string }[];
    expect(act.some((a) => a.accion.includes('creado un registro'))).toBe(true);
    // otra oficina no ve la colección
    const otra = await ag
      .get('/coleccion/buscar?coleccion=Noticias')
      .set('x-office-id', 'archivos');
    expect(otra.status).toBe(404);
    // allowlist: si el dueño quita la herramienta, el servidor la rechaza
    await o.put('/api/oficinas/noticias/ajustes', { herramientas: ['kb_buscar', 'kb_leer'] });
    const sin = await post({
      coleccion: 'Noticias',
      datos: { titulo: 'T2', enlace: 'https://n.com/2' },
      fuente_url: 'https://n.com/2',
    });
    expect(sin.status).toBe(403);
    void id;
  });

  it('prospección conserva sus herramientas y no está limitada por el allowlist genérico', async () => {
    const h = harness();
    const r = await h
      .agent('Coordinador')
      .get('/coleccion/listar')
      .set('x-office-id', 'prospeccion');
    expect(r.status).toBe(200);
  });
});
