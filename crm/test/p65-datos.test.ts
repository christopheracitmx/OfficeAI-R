import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { celdaCsv } from '../src/server/services/csv';
import { openDb } from '../src/server/db';
import { TOKEN, expedienteListo, type H } from './helpers';
import { montar, type Montaje } from './runner-helpers';
import { correr } from './runner-util';

let m: Montaje | null = null;
const dirs: string[] = [];
afterEach(() => {
  m?.cerrar();
  m = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'p65-'));
  dirs.push(d);
  return d;
};
const hDe = (mm: Montaje): H =>
  ({
    agent: (name: string) => ({
      post: (u: string, b?: object) =>
        request(mm.app)
          .post(`/api/agent${u}`)
          .set('x-agent-token', TOKEN)
          .set('x-agent-name', name)
          .send(b ?? {}),
    }),
  }) as unknown as H;

describe('P6.5 desempeño por agente', () => {
  it('métricas de ejecución, QA, devoluciones, 👍/👎 del dueño y tendencia por corrida', async () => {
    m = await montar({ escenario: { qa1_rechazos: 1 } });
    await correr(m, 2);
    const prospecto = m.db.prepare('SELECT id FROM prospectos ORDER BY id LIMIT 1').get() as {
      id: number;
    };
    await m.post('/api/feedback', { prospecto_id: prospecto.id, etapa: 'contactos', valor: 1 });
    await m.post('/api/feedback', {
      prospecto_id: prospecto.id,
      etapa: 'contactos',
      valor: -1,
      etiqueta: 'Falta fuente',
    });
    await m.post('/api/feedback', { prospecto_id: prospecto.id, etapa: 'contactos', valor: -1 });
    await m.patch(`/api/prospectos/${prospecto.id}`, { estado: 'Ganado' });
    await correr(m, 1);

    const d = (await m.get('/api/desempeno')).body;
    const ag = (n: string) => d.agentes.find((a: { agente: string }) => a.agente === n);
    const r = ag('Rastreador');
    expect(r.llamadas).toBeGreaterThanOrEqual(2);
    expect(r.ok_pct).toBe(100);
    expect(r.tokens_por_empresa).toBeGreaterThan(0);
    expect(r.tiempo_medio_s).not.toBeNull();
    expect(r.devoluciones).toBe(3); // QA-1 devuelve a Rastreador una vez por empresa: 2 + 1
    expect(r.aciertos_dueno).toBe(1);
    expect(r.errores_dueno).toBe(2);
    expect(r.tendencia.map((t: { corrida_id: number }) => t.corrida_id)).toEqual([1, 2]);
    const qa1 = ag('QA-1');
    expect(qa1.qa_revisiones).toBeGreaterThanOrEqual(4);
    expect(qa1.qa_aprobacion_pct).toBeLessThan(100);
    expect(ag('Calificador').lecciones_aprobadas).toBe(0);

    const o = d.oficina;
    expect(o.corridas).toBe(2);
    expect(o.prospectos).toBeGreaterThanOrEqual(2);
    expect(o.qa_aprobacion_pct).toBeLessThan(100);
    expect(o.devoluciones).toBeGreaterThanOrEqual(2);
    expect(o.resultados).toMatchObject({ Ganado: 1 });
    expect(o.tokens).toBeGreaterThan(0);
    expect(o.tokens_por_prospecto).toBeGreaterThan(0);
    expect(o.aciertos_dueno).toBe(1);
  });

  it('sin datos devuelve ceros y nulos, no revienta', async () => {
    m = await montar();
    const d = (await m.get('/api/desempeno')).body;
    expect(d.oficina).toMatchObject({
      corridas: 0,
      prospectos: 0,
      qa_aprobacion_pct: null,
      tokens_por_prospecto: null,
    });
    expect(d.agentes.every((a: { llamadas: number }) => a.llamadas === 0)).toBe(true);
  });
});

describe('P6.5 persistencia con base de archivo temporal', () => {
  it('feedback, lecciones, casos y evaluaciones sobreviven a cerrar y reabrir', async () => {
    const f = join(temp(), 'crm.db');
    m = await montar({ dbPath: f, escenario: { evaluacion: 'Oye jefe sin precios' } });
    const { prospecto_id } = await expedienteListo(hDe(m));
    await m.post('/api/feedback', {
      prospecto_id,
      etapa: 'ficha',
      valor: -1,
      etiqueta: 'Sitio equivocado',
    });
    const l = await m.post('/api/lecciones', {
      agente: 'Analista',
      tipo: 'error',
      texto: 'Verifica que el dominio coincida con el nombre de la empresa.',
    });
    await m.post(`/api/lecciones/${l.body.id}/aprobar`);
    await m.post('/api/evaluaciones', { etiqueta: 'Persistencia', confirmado: true });
    m.db.pragma('wal_checkpoint(TRUNCATE)');
    m.cerrar();
    m = null;

    const db = openDb(f);
    expect(db.prepare('SELECT etiqueta, agente FROM feedback').get()).toEqual({
      etiqueta: 'Sitio equivocado',
      agente: 'Analista',
    });
    expect(db.prepare('SELECT estado, version FROM lecciones').get()).toEqual({
      estado: 'aprobada',
      version: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM lecciones_historial').get()).toEqual({ n: 2 });
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM casos_dorados').get() as { n: number }).n,
    ).toBeGreaterThanOrEqual(5);
    expect(db.prepare('SELECT etiqueta, casos FROM evaluaciones').get()).toEqual({
      etiqueta: 'Persistencia',
      casos: 6,
    });
    // La siembra de reapertura no duplica casos ni pisa lo guardado.
    const n1 = (db.prepare('SELECT COUNT(*) AS n FROM casos_dorados').get() as { n: number }).n;
    db.close();
    const otra = openDb(f);
    expect((otra.prepare('SELECT COUNT(*) AS n FROM casos_dorados').get() as { n: number }).n).toBe(
      n1,
    );
    otra.close();
  });
});

describe('P6.5 respaldo y restauración manual', () => {
  const crearEmpresa = (mm: Montaje, nombre: string) =>
    mm.post('/api/directorio', { nombre, direccion: 'Calle 1, CDMX' });
  const nombres = (mm: Montaje) =>
    (mm.db.prepare('SELECT nombre FROM empresas ORDER BY id').all() as { nombre: string }[]).map(
      (e) => e.nombre,
    );

  it('base en memoria: avisa que no hay archivo que respaldar', async () => {
    m = await montar();
    expect((await m.get('/api/respaldos')).status).toBe(409);
  });

  it('crea respaldo, lista, restaura con confirmación fuerte y respalda antes el estado actual', async () => {
    const dir = temp();
    m = await montar({ dbPath: join(dir, 'crm.db') });
    await crearEmpresa(m, 'Empresa Uno SA');
    const l1 = await m.post('/api/lecciones', {
      agente: 'Redactor',
      tipo: 'acierto',
      texto: 'Mantén el reporte con saludo cercano.',
    });
    expect(l1.status).toBe(201);
    const b = await m.post('/api/respaldos');
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ tipo: 'manual' });
    expect(b.body.tamano).toBeGreaterThan(10_000);
    await crearEmpresa(m, 'Empresa Dos SA');
    await m.post('/api/lecciones', {
      agente: 'Redactor',
      tipo: 'error',
      texto: 'Evita párrafos de más de cinco líneas.',
    });
    expect(nombres(m)).toEqual(['Empresa Uno SA', 'Empresa Dos SA']);

    // Sin la palabra de confirmación, o con nombres raros, no pasa nada.
    for (const [archivo, confirmacion, status] of [
      [b.body.archivo, 'si', 400],
      [b.body.archivo, '', 400],
      ['../crm.db', 'RESTAURAR', 400],
      ['crm-manual-noexiste.db', 'RESTAURAR', 404],
    ] as const)
      expect(
        (await m.post('/api/respaldos/restaurar', { archivo, confirmacion })).status,
        `${archivo}/${confirmacion}`,
      ).toBe(status);
    expect(nombres(m)).toHaveLength(2);

    const r = await m.post('/api/respaldos/restaurar', {
      archivo: b.body.archivo,
      confirmacion: 'RESTAURAR',
    });
    expect(r.status).toBe(200);
    expect(r.body.filas).toBeGreaterThan(0);
    expect(nombres(m)).toEqual(['Empresa Uno SA']);
    expect(m.db.prepare('SELECT COUNT(*) AS n FROM lecciones').get()).toEqual({ n: 1 });
    expect(m.db.pragma('foreign_key_check')).toEqual([]);
    expect(existsSync(join(dir, 'backups', r.body.respaldo_previo))).toBe(true);

    // El respaldo previo permite deshacer la restauración.
    const lista = (await m.get('/api/respaldos')).body as { archivo: string; tipo: string }[];
    expect(lista.map((x) => x.tipo)).toEqual(expect.arrayContaining(['manual', 'restauracion']));
    const u = await m.post('/api/respaldos/restaurar', {
      archivo: r.body.respaldo_previo,
      confirmacion: 'RESTAURAR',
    });
    expect(u.status).toBe(200);
    expect(nombres(m)).toEqual(['Empresa Uno SA', 'Empresa Dos SA']);
    const cambios = (await m.get('/api/cambios?limit=50')).body as { accion: string }[];
    expect(cambios.some((c) => c.accion === 'restauró la base')).toBe(true);
  });

  it('un archivo que no es una base del CRM no toca nada', async () => {
    const dir = temp();
    m = await montar({ dbPath: join(dir, 'crm.db') });
    await crearEmpresa(m, 'Empresa Uno SA');
    const { default: Database } = await import('better-sqlite3');
    mkdirSync(join(dir, 'backups'), { recursive: true });
    const raro = new Database(join(dir, 'backups', 'crm-manual-raro.db'));
    raro.exec('CREATE TABLE otra (x INTEGER)');
    raro.close();
    const r = await m.post('/api/respaldos/restaurar', {
      archivo: 'crm-manual-raro.db',
      confirmacion: 'RESTAURAR',
    });
    expect(r.status).toBe(422);
    expect(nombres(m)).toEqual(['Empresa Uno SA']);
  });
});

describe('P6.5 exportar prospectos a CSV', () => {
  it('celdas seguras: comillas, separadores y sin fórmulas', () => {
    expect(celdaCsv('Acme, S.A.')).toBe('"Acme, S.A."');
    expect(celdaCsv('dice "hola"')).toBe('"dice ""hola"""');
    expect(celdaCsv('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celdaCsv('@cmd')).toBe("'@cmd");
    expect(celdaCsv(-5)).toBe('-5');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv('línea1\nlínea2')).toBe('línea1 línea2');
  });

  it('descarga con BOM y respeta los filtros; incluye contactos', async () => {
    m = await montar();
    const a = await expedienteListo(hDe(m), 'Manufacturas Ejemplo SA');
    const e2 = Number(
      m.db
        .prepare(
          "INSERT INTO empresas (nombre, metodo_descubrimiento) VALUES ('=Peligrosa Formula SA','manual')",
        )
        .run().lastInsertRowid,
    );
    m.db
      .prepare(
        "INSERT INTO prospectos (empresa_id, estado, score, nivel) VALUES (?, 'Nuevo', 55, 'B')",
      )
      .run(e2);
    await m.patch(`/api/prospectos/${a.prospecto_id}`, { estado: 'Ganado' });
    const todo = await m.get('/api/prospectos/export.csv');
    expect(todo.status).toBe(200);
    expect(todo.headers['content-type']).toMatch(/text\/csv/);
    expect(todo.headers['content-disposition']).toMatch(
      /attachment; filename="prospectos-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const txt = todo.text;
    expect(txt.charCodeAt(0)).toBe(0xfeff);
    const filas = txt.trim().split('\r\n');
    expect(filas).toHaveLength(3);
    expect(filas[0]).toContain('Empresa,Estado,Score,Nivel');
    expect(txt).toContain('contacto@manufacturas-ejemplo.mx');
    expect(txt).toContain("'=Peligrosa Formula SA");
    expect(txt).not.toMatch(/,=Peligrosa/);

    const ganados = await m.get('/api/prospectos/export.csv?estado=Ganado');
    const f2 = ganados.text.trim().split('\r\n');
    expect(f2).toHaveLength(2);
    expect(f2[1]).toContain('Manufacturas Ejemplo SA');
    expect(
      (await m.get('/api/prospectos/export.csv?q=peligrosa')).text.trim().split('\r\n'),
    ).toHaveLength(2);
    // La ruta no se confunde con /prospectos/:id.
    expect((await m.get(`/api/prospectos/${a.prospecto_id}`)).status).toBe(200);
  });
});
