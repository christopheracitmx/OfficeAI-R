import { describe, expect, it } from 'vitest';
import { harness, type H } from './helpers';

const crear = async (h: H, plantilla: string, nombre?: string) => {
  const r = await h.owner.post(`/api/galeria/${plantilla}/crear`, nombre ? { nombre } : {});
  expect(r.status).toBe(201);
  return r.body.id as string;
};

describe('P10 galería de plantillas base', () => {
  it('ofrece Vacía, Base de datos, Archivos/CRM y Noticias, todas válidas', async () => {
    const h = harness();
    const g = await h.owner.get('/api/galeria');
    expect(g.body.map((p: { id: string }) => p.id)).toEqual([
      'vacia',
      'base-datos',
      'archivos-crm',
      'noticias',
    ]);
    for (const p of g.body as { agentes: number }[]) expect(p.agentes).toBeGreaterThan(0);
  });

  it('cada plantilla crea un piso completo con workflow, planta 3D, prompts y paridad', async () => {
    const h = harness();
    for (const p of ['vacia', 'base-datos', 'archivos-crm', 'noticias']) {
      const id = await crear(h, p, `Piso ${p}`);
      const wf = await h.owner.get(`/api/oficinas/${id}/workflow`);
      expect(wf.body.workflow.fases.length).toBeGreaterThan(0);
      const def = await h.owner.get(`/api/oficinas/${id}/definicion`);
      expect(def.body.agentes.length).toBeGreaterThan(0);
      const f = def.body.agentes.filter((a: { genero: string }) => a.genero === 'f').length;
      expect(Math.abs(f - (def.body.agentes.length - f))).toBeLessThanOrEqual(1);
      const prompts = await h.ownerEn(id).get('/api/prompts');
      expect(prompts.status).toBe(200);
      const oficina = await h.owner.get(`/api/oficinas/${id}`);
      if (p !== 'archivos-crm') expect(oficina.body.ejecutable).toBe(true);
      else
        // archivos desactivados por defecto: no es ejecutable hasta que el dueño lo active
        expect(oficina.body.advertencias.join(' ')).toContain('archivos_listar');
    }
  });

  it('Noticias trae su colección con clave y Base de datos las herramientas coleccion_*', async () => {
    const h = harness();
    const id = await crear(h, 'noticias');
    const cols = await h.ownerEn(id).get('/api/colecciones');
    expect(cols.body[0]).toMatchObject({ nombre: 'Noticias', clave: 'enlace' });
    const aj = await h.ownerEn(id).get(`/api/oficinas/${id}/ajustes`);
    expect(aj.body.herramientas_efectivas).toEqual(
      expect.arrayContaining(['coleccion_upsert', 'obscura_extract']),
    );
  });
});

describe('P10 exportar / importar', () => {
  it('exporta sin datos operativos ni secretos y reimporta una copia fiel', async () => {
    const h = harness();
    const id = await crear(h, 'noticias', 'Noticias A');
    const o = h.ownerEn(id);
    const col = (await o.get('/api/colecciones')).body[0];
    await o.post(`/api/colecciones/${col.id}/registros`, {
      datos: { titulo: 'Dato operativo secreto', enlace: 'https://x.com/1' },
      fuente_url: 'https://x.com/1',
    });
    h.db.prepare("INSERT INTO destinatarios_internos (email) VALUES ('interno@acitmx.com')").run();
    const ex = await h.owner.get(`/api/oficinas/${id}/exportar`);
    expect(ex.status).toBe(200);
    expect(ex.headers['content-disposition']).toContain('paquete-');
    const texto = ex.text;
    expect(texto).not.toContain('Dato operativo secreto');
    expect(texto).not.toContain('interno@acitmx.com');
    expect(texto).not.toMatch(/RESEND|agent\.token|api[_-]?key/i);
    const paquete = JSON.parse(texto);
    expect(paquete.colecciones[0].nombre).toBe('Noticias');
    expect(paquete.colecciones[0]).not.toHaveProperty('registros');

    const vista = await h.owner.post('/api/paquetes/vista-previa', {
      paquete,
      nombre: 'Noticias B',
    });
    expect(vista.body.ok).toBe(true);
    expect(vista.body.id_propuesto).toBe('noticias-b');
    // la vista previa no crea nada
    expect(
      (await h.owner.get('/api/oficinas')).body.map((x: { id: string }) => x.id),
    ).not.toContain('noticias-b');
    const imp = await h.owner.post('/api/paquetes/importar', { paquete, nombre: 'Noticias B' });
    expect(imp.status).toBe(201);
    const nuevo = imp.body.id as string;
    const b = h.ownerEn(nuevo);
    expect((await b.get('/api/colecciones')).body[0].registros).toBe(0); // sin registros
    const ag1 = h.db
      .prepare('SELECT id, genero, area FROM agentes WHERE office_id = ? ORDER BY id')
      .all(id);
    const ag2 = h.db
      .prepare('SELECT id, genero, area FROM agentes WHERE office_id = ? ORDER BY id')
      .all(nuevo);
    expect(ag2).toEqual(ag1);
    const p1 = h.db
      .prepare(
        'SELECT prompt FROM prompts_agente WHERE office_id = ? AND activo = 1 ORDER BY prompt',
      )
      .all(id);
    const p2 = h.db
      .prepare(
        'SELECT prompt FROM prompts_agente WHERE office_id = ? AND activo = 1 ORDER BY prompt',
      )
      .all(nuevo);
    expect(p2).toEqual(p1);
    const def = (await h.owner.get(`/api/oficinas/${nuevo}/definicion`)).body;
    expect(def.office.id).toBe(nuevo);
  });

  it('vista previa con diferencias respecto a otra oficina', async () => {
    const h = harness();
    const n = await crear(h, 'noticias');
    await crear(h, 'base-datos');
    const paquete = JSON.parse((await h.owner.get(`/api/oficinas/${n}/exportar`)).text);
    const v = await h.owner.post('/api/paquetes/vista-previa', {
      paquete,
      comparar_con: 'base-de-datos',
    });
    expect(v.body.diferencias.agentes.agregan.length).toBeGreaterThan(0);
    expect(v.body.diferencias.colecciones).toEqual({
      agregan: ['Noticias'],
      quitan: ['Registros'],
    });
  });

  it('rechaza JSON inválido, claves extra, gigantes y consultas peligrosas', async () => {
    const h = harness();
    const id = await crear(h, 'vacia');
    const base = JSON.parse((await h.owner.get(`/api/oficinas/${id}/exportar`)).text);
    const probar = async (mut: (p: Record<string, unknown>) => void) => {
      const p = structuredClone(base);
      mut(p);
      return (await h.owner.post('/api/paquetes/vista-previa', { paquete: p })).body;
    };
    expect((await probar(() => undefined)).ok).toBe(true);
    // clave desconocida (esquema estricto)
    expect((await probar((p) => (p['secreto'] = 'x'))).ok).toBe(false);
    // formato/versión incorrectos
    expect((await probar((p) => (p['formato'] = 'otro'))).ok).toBe(false);
    // herramienta fuera del catálogo
    const t = await probar((p) => (p['herramientas'] as string[]).push('whatsapp_enviar'));
    expect(t.ok).toBe(false);
    expect(t.errores.join(' ')).toContain('whatsapp_enviar');
    // consulta de escritura
    const w = await probar((p) => {
      const wf = p['workflow'] as { fases: { items: string }[] };
      wf.fases[0]!.items = 'DELETE FROM empresas';
    });
    expect(w.ok).toBe(false);
    // tabla de otra oficina/datos del CRM
    const tabla = await probar((p) => {
      const wf = p['workflow'] as { fases: { items: string }[] };
      wf.fases[0]!.items = 'SELECT id FROM empresas';
    });
    expect(tabla.errores.join(' ')).toContain('tabla no permitida');
    // planta con salas traslapadas
    const pl = await probar((p) => {
      const planta = p['planta'] as { salas: { x: number }[] };
      planta.salas[1]!.x = 0;
    });
    expect(pl.ok).toBe(false);
    // más de 40 agentes
    const muchos = await probar((p) => {
      const a = (p['agentes'] as unknown[])[0];
      p['agentes'] = Array.from({ length: 45 }, () => a);
    });
    expect(muchos.ok).toBe(false);
    // campo gigante
    const gigante = await probar(
      (p) => ((p['prompts'] as { global: string }).global = 'x'.repeat(30_000)),
    );
    expect(gigante.ok).toBe(false);
    // demasiado grande en conjunto (supera el tope lógico pero cabe en el parser)
    const grande = await probar((p) => (p['relleno'] = 'x'.repeat(1_600_000)));
    expect(grande.ok).toBe(false);
    expect(grande.errores[0]).toContain('demasiado grande');
    // más allá del parser: 413
    const r = await h.owner.post('/api/paquetes/vista-previa', {
      paquete: { relleno: 'x'.repeat(2_300_000) },
    });
    expect(r.status).toBe(413);
    // JSON roto
    const roto = await h.api
      .post('/api/paquetes/importar')
      .set('Origin', 'http://ui.test')
      .set('Content-Type', 'application/json')
      .send('{"paquete": ');
    expect(roto.status).toBe(400);
    // la importación inválida no crea nada
    const antes = (await h.owner.get('/api/oficinas')).body.length;
    const mal = await h.owner.post('/api/paquetes/importar', { paquete: { hola: 1 } });
    expect(mal.status).toBe(400);
    expect((await h.owner.get('/api/oficinas')).body.length).toBe(antes);
  });

  it('el workflow de prospección no se importa como paquete (consulta tablas del CRM)', async () => {
    const h = harness();
    const wfp = (await h.owner.get('/api/oficinas/prospeccion/workflow')).body.workflow;
    expect(wfp).toBeTruthy();
    const id = await crear(h, 'vacia');
    const base = JSON.parse((await h.owner.get(`/api/oficinas/${id}/exportar`)).text);
    base.workflow = wfp;
    const v = await h.owner.post('/api/paquetes/vista-previa', { paquete: base });
    expect(v.body.ok).toBe(false);
  });

  it('relajar candados exige confirmación explícita y queda en el registro de cambios', async () => {
    const h = harness();
    const id = await crear(h, 'vacia');
    const base = JSON.parse((await h.owner.get(`/api/oficinas/${id}/exportar`)).text);
    base.candados.relajados = ['topes_consumo'];
    const sin = await h.owner.post('/api/paquetes/importar', { paquete: base, nombre: 'Relajado' });
    expect(sin.status).toBe(409);
    const con = await h.owner.post('/api/paquetes/importar', {
      paquete: base,
      nombre: 'Relajado',
      confirmar_relajar: true,
    });
    expect(con.status).toBe(201);
    const log = h.db
      .prepare("SELECT accion FROM cambios_log WHERE office_id = ? AND entidad = 'candados'")
      .all(con.body.id) as { accion: string }[];
    expect(log[0]!.accion).toContain('RELAJÓ');
    // un candado fijo no se puede relajar
    base.candados.relajados = ['sin_borrado'];
    expect((await h.owner.post('/api/paquetes/importar', { paquete: base })).status).toBe(400);
    const r = await h.owner.put(`/api/oficinas/${id}/candados`, {
      relajados: ['sin_contacto_externo'],
      confirmar: true,
    });
    expect(r.status).toBe(422);
    const sinConf = await h.owner.put(`/api/oficinas/${id}/candados`, {
      relajados: ['topes_consumo'],
    });
    expect(sinConf.status).toBe(409);
  });
});
