import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { definicionOficina } from '../src/shared/oficina3d/definicion';
import { definicionMinima } from '../src/shared/oficina3d/minima';
import { migrate } from '../src/server/db';
import { GLOBAL, guardarPrompt, promptActivo } from '../src/server/services/prompts-db';
import { harness, TOKEN } from './helpers';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Base de archivo en el estado de P6.5 (migraciones 001-005) con datos reales de prospección. */
function baseAnterior(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'mig006-'));
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
  ]) {
    db.exec(readFileSync(join(mig, f), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, 'x');
  }
  return db;
}

describe('P8 migración 006: conserva los datos de prospección', () => {
  it('empresas, prospectos, KB, lecciones y corridas intactos; todo queda en prospeccion', () => {
    const db = baseAnterior();
    db.exec(`
      INSERT INTO corridas (zona, giro, max_empresas, motor, office_id) VALUES ('CDMX','Logística',5,'claude-code','prospeccion');
      INSERT INTO empresas (id, nombre, corrida_id) VALUES (1, 'Acme Logística SA', 1);
      INSERT INTO prospectos (id, empresa_id, corrida_id, estado, score, nivel, notas_dueno) VALUES (1, 1, 1, 'Reportado', 88, 'A', 'Llamar el lunes');
      INSERT INTO busquedas_realizadas (corrida_id, metodo, consulta, resultados, nuevas_empresas) VALUES (1, 'places', 'bodegas cdmx', 20, 5);
      INSERT INTO kb_documentos (office_id, tipo, titulo, contenido_md, creado_en, actualizado_en) VALUES ('prospeccion','voz','Tono','Hablar de tú','2026-01-01','2026-01-01');
      INSERT INTO lecciones (office_id, agente, tipo, texto, estado, origen, creado_en) VALUES ('prospeccion','Redactor','acierto','Sé breve','aprobada','manual','2026-01-01');
    `);
    expect(migrate(db)).toEqual([
      '006_edificio.sql',
      '007_apariencias.sql',
      '008_p10_herramientas.sql',
      '009_fuentes.sql',
      '010_precalificacion.sql',
      '011_niveles_calidad.sql',
    ]);
    expect(db.prepare('SELECT nombre, office_id FROM empresas').get()).toEqual({
      nombre: 'Acme Logística SA',
      office_id: 'prospeccion',
    });
    expect(
      db.prepare('SELECT estado, score, notas_dueno, office_id FROM prospectos').get(),
    ).toEqual({
      estado: 'Reportado',
      score: 88,
      notas_dueno: 'Llamar el lunes',
      office_id: 'prospeccion',
    });
    expect(db.prepare('SELECT office_id, consulta FROM busquedas_realizadas').get()).toEqual({
      office_id: 'prospeccion',
      consulta: 'bodegas cdmx',
    });
    expect((db.prepare('SELECT COUNT(*) n FROM kb_documentos').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM lecciones').get() as { n: number }).n).toBe(1);
    const of = db.prepare('SELECT id, estado, workflow_ref, orden FROM oficinas').all();
    expect(of).toEqual([
      { id: 'prospeccion', estado: 'activa', workflow_ref: 'archivo:prospeccion', orden: 1 },
    ]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
  });

  it('el id de oficina solo admite minúsculas, números, guion y guion bajo', () => {
    const db = baseAnterior();
    migrate(db);
    const ins = (id: string) =>
      db.prepare("INSERT INTO oficinas (id, nombre) VALUES (?, 'x')").run(id);
    expect(() => ins('Mala Oficina')).toThrow();
    expect(() => ins('ok-1_a')).not.toThrow();
    db.close();
  });
});

describe('P8 API de oficinas (dueño)', () => {
  it('lista la oficina de prospección sembrada y exige Origin al mutar', async () => {
    const h = harness();
    const l = await h.owner.get('/api/oficinas');
    expect(l.status).toBe(200);
    expect(l.body.map((o: { id: string }) => o.id)).toEqual(['prospeccion']);
    expect(l.body[0]).toMatchObject({ office_id: 'prospeccion', piso: 1, estado: 'activa' });
    const sinOrigen = await h.api.post('/api/oficinas').send({ nombre: 'Noticias' });
    expect(sinOrigen.status).toBe(403);
  });

  it('crea vacía, renombra, reordena, archiva y restaura; nunca se borra', async () => {
    const h = harness();
    const c = await h.owner.post('/api/oficinas', { nombre: 'Noticias del sector' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ id: 'noticias-del-sector', piso: 2, plantilla_origen: 'vacia' });
    expect((await h.owner.post('/api/oficinas', { nombre: 'Noticias del sector' })).body.id).toBe(
      'noticias-del-sector-2',
    );
    const p = await h.owner.patch('/api/oficinas/noticias-del-sector', { nombre: 'Noticias' });
    expect(p.body.nombre).toBe('Noticias');
    const def = (await h.owner.get('/api/oficinas/noticias-del-sector/definicion')).body;
    expect(def.office.nombre).toBe('Noticias');
    const ord = await h.owner.put('/api/oficinas/orden', {
      orden: ['noticias-del-sector-2', 'noticias-del-sector', 'prospeccion'],
    });
    expect(ord.status).toBe(200);
    expect((await h.owner.get('/api/oficinas/prospeccion')).body.piso).toBe(3);
    expect((await h.owner.put('/api/oficinas/orden', { orden: ['prospeccion'] })).status).toBe(400);
    const a = await h.owner.post('/api/oficinas/noticias-del-sector/archivar');
    expect(a.body.estado).toBe('archivada');
    expect((await h.owner.get('/api/oficinas')).body.length).toBe(2);
    expect((await h.owner.get('/api/oficinas?archivadas=1')).body.length).toBe(3);
    expect((await h.owner.post('/api/oficinas/noticias-del-sector/restaurar')).body.estado).toBe(
      'activa',
    );
    expect((await h.owner.del('/api/oficinas/noticias-del-sector')).status).toBe(404);
    expect((h.db.prepare('SELECT COUNT(*) n FROM oficinas').get() as { n: number }).n).toBe(3);
  });

  it('no archiva la última oficina activa ni una con corrida en curso; valida con zod', async () => {
    const h = harness();
    expect((await h.owner.post('/api/oficinas/prospeccion/archivar')).status).toBe(409);
    await h.owner.post('/api/oficinas', { nombre: 'Archivos' });
    h.db.exec(
      "INSERT INTO corridas (zona, giro, max_empresas, motor, office_id) VALUES ('-','-',1,'x','archivos')",
    );
    expect((await h.owner.post('/api/oficinas/archivos/archivar')).status).toBe(409);
    expect((await h.owner.post('/api/oficinas', { nombre: 'x' })).status).toBe(400);
    expect(
      (await h.owner.post('/api/oficinas', { nombre: 'Copia', plantilla: 'duplicar' })).status,
    ).toBe(400);
    expect((await h.owner.post('/api/oficinas', { nombre: 'Copia', id: 'MAL ID' })).status).toBe(
      400,
    );
    expect((await h.owner.get('/api/oficinas/no-existe')).status).toBe(404);
  });
});

describe('P8 duplicar una oficina', () => {
  it('copia agentes, prompts, habilidades, KB y lecciones aprobadas, SIN datos operativos', async () => {
    const h = harness();
    const { db } = h;
    db.exec(`
      INSERT INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES ('prospeccion','Redactor','Redactor','Hugo','m','Redactor','Reporte');
      INSERT INTO kb_documentos (office_id, tipo, titulo, contenido_md, creado_en, actualizado_en) VALUES ('prospeccion','voz','Tono','Hablar de tú','2026-01-01','2026-01-01');
      INSERT INTO lecciones (office_id, agente, tipo, texto, estado, origen, creado_en) VALUES ('prospeccion','Redactor','acierto','Aprobada A','aprobada','manual','2026-01-01');
      INSERT INTO lecciones (office_id, agente, tipo, texto, estado, origen, creado_en) VALUES ('prospeccion','Redactor','error','Propuesta B','propuesta','reflexion','2026-01-01');
      INSERT INTO corridas (zona, giro, max_empresas, motor) VALUES ('CDMX','x',1,'x');
      INSERT INTO empresas (id, nombre) VALUES (1, 'Acme');
      INSERT INTO prospectos (empresa_id, estado) VALUES (1, 'Nuevo');
      INSERT INTO salidas_agente (office_id, agente, paso, resultado) VALUES ('prospeccion','Redactor','p','ok');
      INSERT INTO feedback (office_id, etapa, agente, valor, origen, creado_en) VALUES ('prospeccion','reporte','Redactor',1,'manual','2026-01-01');
    `);
    guardarPrompt(db, 'prospeccion', 'redactor', 'Eres el redactor de prueba');
    guardarPrompt(db, 'prospeccion', GLOBAL, 'Bloque común de prueba');
    const n = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;
    const antes = {
      empresas: n('SELECT COUNT(*) n FROM empresas'),
      prospectos: n('SELECT COUNT(*) n FROM prospectos'),
    };
    const r = await h.owner.post('/api/oficinas', {
      nombre: 'Prospección Norte',
      plantilla: 'duplicar',
      origen: 'prospeccion',
    });
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    expect(id).toBe('prospeccion-norte');
    expect(r.body.plantilla_origen).toBe('duplicado:prospeccion');
    // copiado
    expect(n('SELECT COUNT(*) n FROM agentes WHERE office_id = ?', id)).toBe(
      n('SELECT COUNT(*) n FROM agentes WHERE office_id = ?', 'prospeccion'),
    );
    expect(n('SELECT COUNT(*) n FROM kb_documentos WHERE office_id = ?', id)).toBe(
      n('SELECT COUNT(*) n FROM kb_documentos WHERE office_id = ?', 'prospeccion'),
    );
    expect(
      n("SELECT COUNT(*) n FROM lecciones WHERE office_id = ? AND estado='aprobada'", id),
    ).toBe(1);
    expect(
      n('SELECT COUNT(*) n FROM lecciones WHERE office_id = ? AND texto = ?', id, 'Propuesta B'),
    ).toBe(0);
    // prompts: copia de los activos con versión 1
    expect(promptActivo(db, id, 'redactor')).toBe('Eres el redactor de prueba');
    expect(promptActivo(db, id, GLOBAL)).toBe('Bloque común de prueba');
    expect(n('SELECT COUNT(*) n FROM prompts_agente WHERE office_id = ? AND version = 1', id)).toBe(
      1,
    );
    // sin datos operativos
    for (const t of [
      'corridas',
      'salidas_agente',
      'feedback',
      'actividad_agentes',
      'casos_dorados',
    ])
      expect(n(`SELECT COUNT(*) n FROM ${t} WHERE office_id = ?`, id)).toBe(0);
    expect(n('SELECT COUNT(*) n FROM empresas')).toBe(antes.empresas);
    expect(n('SELECT COUNT(*) n FROM prospectos')).toBe(antes.prospectos);
    expect(n('SELECT COUNT(*) n FROM empresas WHERE office_id = ?', id)).toBe(0);
    // lo original sigue igual
    expect(n("SELECT COUNT(*) n FROM lecciones WHERE office_id='prospeccion'")).toBe(2);
    // el workflow copiado es el del origen con su propio id
    const wf = (await h.owner.get(`/api/oficinas/${id}/workflow`)).body;
    expect(wf.editable).toBe(true);
    expect(wf.workflow.office_id).toBe(id);
    expect(wf.workflow.pasos.cartografo).toBeTruthy();
    // el flujo usa crm_*: la oficina nueva lo advierte y no es ejecutable
    expect(r.body.ejecutable).toBe(false);
    expect(r.body.advertencias[0]).toContain('herramientas no permitidas');
  });
});

describe('P8 aislamiento por office_id', () => {
  it('una oficina no ve los prospectos, KB, lecciones ni salidas de otra', async () => {
    const h = harness();
    const { db } = h;
    await h.owner.post('/api/oficinas', { nombre: 'Archivos' });
    db.exec(`
      INSERT INTO empresas (id, nombre) VALUES (1, 'Acme');
      INSERT INTO prospectos (empresa_id, estado) VALUES (1, 'Nuevo');
      INSERT INTO kb_documentos (office_id, tipo, titulo, contenido_md, creado_en, actualizado_en) VALUES ('prospeccion','voz','Solo prospección','texto','2026-01-01','2026-01-01');
      INSERT INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES ('prospeccion','Redactor','Redactor','Hugo','m','Redactor','Reporte');
      INSERT INTO lecciones (office_id, agente, tipo, texto, estado, origen, creado_en) VALUES ('prospeccion','Redactor','acierto','Leccion prospeccion','aprobada','manual','2026-01-01');
      INSERT INTO salidas_agente (office_id, agente, paso, resultado, resumen) VALUES ('prospeccion','Redactor','p','ok','salida prospeccion');
      INSERT INTO actividad_agentes (agente, accion, creado_en, office_id) VALUES ('Redactor','trabajó','2026-01-01','prospeccion');
    `);
    const get = (u: string, of: string) =>
      h.api.get(u).set('Origin', 'http://ui.test').set('x-office-id', of);
    const lista = async (u: string, of: string) => (await get(u, of)).body as unknown[];
    for (const u of [
      '/api/prospectos',
      '/api/directorio',
      '/api/kb/docs',
      '/api/lecciones',
      '/api/salidas',
      '/api/actividad',
    ]) {
      expect((await lista(u, 'prospeccion')).length, u).toBeGreaterThan(0);
      expect(await lista(u, 'archivos'), u).toEqual([]);
    }
    expect((await get('/api/dashboard', 'archivos')).body).toMatchObject({ no_aplica: true });
  });
});

describe('P8 esquema 3D de los pisos', () => {
  it('la planta mínima es válida (recepción + 1 sala) y los pisos nuevos guardan una definición válida', async () => {
    const m = definicionMinima({ id: 'demo', nombre: 'Demo' });
    expect(definicionOficina.safeParse(m).success).toBe(true);
    expect(m.salas.map((s) => s.tipo)).toEqual(['recepcion', 'area']);
    expect(m.agentes).toEqual([]);
    const h = harness();
    await h.owner.post('/api/oficinas', { nombre: 'Piso nuevo' });
    const d = (await h.owner.get('/api/oficinas/piso-nuevo/definicion')).body;
    expect(definicionOficina.safeParse(d).success).toBe(true);
    expect(d.office).toMatchObject({ id: 'piso-nuevo', piso: 2 });
    // la de prospección se genera desde su roster y valida
    const p = (await h.owner.get('/api/oficinas/prospeccion/definicion')).body;
    expect(definicionOficina.safeParse(p).success).toBe(true);
    void TOKEN;
  });
});
