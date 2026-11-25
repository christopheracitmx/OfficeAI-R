import { resolve } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { openDb } from '../src/server/db';
import { crearRunner } from '../src/server/offices';
import { ColaIa } from '../src/server/runner/cola';
import { CONFIG_POR_DEFECTO } from '../src/server/runner/motor';
import type { EjecutarAgenteFn, EjecutarAgenteInput } from '../src/server/runner/types';
import { EventBus } from '../src/server/services/events';
import { FakeMailer, TOKEN, UI } from './helpers';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function entrada(officeId: string, signal?: AbortSignal): EjecutarAgenteInput {
  return {
    officeId,
    agente: {
      id: 'A',
      roles: ['A'],
      prompts: [],
      herramientas: [],
      webSearch: false,
      maxTurnos: 1,
    },
    prompt: 'p',
    mensaje: 'm',
    mcpEnv: {},
    timeout: 1000,
    signal,
  };
}

describe('P8 cola global de llamadas de IA', () => {
  it('solo una llamada a la vez, en orden de llegada, entre oficinas distintas', async () => {
    const cola = new ColaIa();
    const orden: string[] = [];
    let dentro = 0;
    let maximo = 0;
    const fn = cola.envolver(async (i) => {
      dentro++;
      maximo = Math.max(maximo, dentro);
      orden.push(i.officeId);
      await dormir(15);
      dentro--;
      return { ok: true, salida: 'ok' };
    });
    await Promise.all(['a', 'b', 'a', 'c', 'b'].map((o) => fn(entrada(o))));
    expect(maximo).toBe(1);
    expect(orden).toEqual(['a', 'b', 'a', 'c', 'b']);
    expect(cola.estado()).toMatchObject({ usando: false, esperando: 0, maximo_simultaneas: 1 });
  });

  it('una espera abortada sale de la cola sin ejecutar ni consumir turno', async () => {
    const cola = new ColaIa();
    const corrieron: string[] = [];
    const fn = cola.envolver(async (i) => {
      corrieron.push(i.officeId);
      await dormir(30);
      return { ok: true, salida: 'ok' };
    });
    const ac = new AbortController();
    const p1 = fn(entrada('a'));
    const p2 = fn(entrada('b', ac.signal));
    const p3 = fn(entrada('c'));
    await dormir(5);
    expect(cola.estado().esperando).toBe(2);
    ac.abort();
    const r2 = await p2;
    expect(r2).toMatchObject({ ok: false, abortado: true });
    await Promise.all([p1, p3]);
    expect(corrieron).toEqual(['a', 'c']);
  });
});

function montar() {
  const db = openDb(':memory:');
  const bus = new EventBus();
  const llamadas: { officeId: string; tools: string; t0: number; t1: number }[] = [];
  let dentro = 0;
  let maximo = 0;
  const motor: EjecutarAgenteFn = async (i) => {
    dentro++;
    maximo = Math.max(maximo, dentro);
    const t0 = Date.now();
    await dormir(40);
    llamadas.push({ officeId: i.officeId, tools: i.mcpEnv['CRM_TOOLS'] ?? '', t0, t1: Date.now() });
    dentro--;
    return { ok: true, salida: 'listo' };
  };
  const runner = crearRunner({
    db,
    bus,
    mailer: new FakeMailer(),
    from: 'info@mail.acitmx.net',
    baseUrl: 'http://127.0.0.1:5174',
    raiz: resolve('.'),
    puerto: 1,
    tokenFile: 'no-existe',
    env: {},
    cfg: CONFIG_POR_DEFECTO,
    ejecutar: motor,
  });
  const app = createApp({
    db,
    bus,
    mailer: new FakeMailer(),
    from: 'x@y.mx',
    baseUrl: 'http://127.0.0.1:5174',
    agentToken: TOKEN,
    uiOrigins: [UI],
    env: { NODE_ENV: 'test' },
    runner,
  });
  const api = request(app);
  const owner = {
    get: (u: string) => api.get(u).set('Origin', UI),
    post: (u: string, b?: object) =>
      api
        .post(u)
        .set('Origin', UI)
        .send(b ?? {}),
    put: (u: string, b?: object) =>
      api
        .put(u)
        .set('Origin', UI)
        .send(b ?? {}),
  };
  const agente = (office: string) => ({
    get: (u: string) =>
      api
        .get(`/api/agent${u}`)
        .set('x-agent-token', TOKEN)
        .set('x-agent-name', 'Asistente')
        .set('x-office-id', office),
    post: (u: string, b?: object) =>
      api
        .post(`/api/agent${u}`)
        .set('x-agent-token', TOKEN)
        .set('x-agent-name', 'Asistente')
        .set('x-office-id', office)
        .send(b ?? {}),
  });
  return { db, runner, owner, agente, llamadas, maximo: () => maximo };
}

const corrida = (office: string) => ({
  office_id: office,
  params: { tarea: 'resume las noticias', max_items: 1 },
});

describe('P8 runner multi-oficina', () => {
  it('dos oficinas corren a la vez pero la IA se llama de una en una; el plan es global', async () => {
    const m = montar();
    await m.owner.post('/api/oficinas', { nombre: 'Noticias' });
    await m.owner.post('/api/oficinas', { nombre: 'Archivos' });
    const a = await m.owner.post('/api/corridas', corrida('noticias'));
    const b = await m.owner.post('/api/corridas', corrida('archivos'));
    expect([a.status, b.status]).toEqual([201, 201]);
    // dos corridas en curso al mismo tiempo, una por oficina
    const st = (await m.owner.get('/api/estado')).body.runner;
    expect(st.activos.map((x: { office_id: string }) => x.office_id).sort()).toEqual([
      'archivos',
      'noticias',
    ]);
    // una segunda corrida en la MISMA oficina se rechaza
    expect((await m.owner.post('/api/corridas', corrida('noticias'))).status).toBe(409);
    await m.runner.esperarFin();
    expect(m.maximo()).toBe(1);
    expect(m.runner.cola.estado().maximo_simultaneas).toBe(1);
    expect(m.llamadas.map((l) => l.officeId).sort()).toEqual(['archivos', 'noticias']);
    const [x, y] = [...m.llamadas].sort((p, q) => p.t0 - q.t0);
    expect(y!.t0).toBeGreaterThanOrEqual(x!.t1 - 2);
    const fin = m.db.prepare('SELECT office_id, estado FROM corridas ORDER BY id').all();
    expect(fin).toEqual([
      { office_id: 'noticias', estado: 'terminada' },
      { office_id: 'archivos', estado: 'terminada' },
    ]);
    // las salidas quedan en su oficina
    const so = m.db.prepare('SELECT DISTINCT office_id FROM salidas_agente ORDER BY 1').all();
    expect(so).toEqual([{ office_id: 'archivos' }, { office_id: 'noticias' }]);
  });

  it('herramientas MCP por oficina: las oficinas nuevas solo reciben kb_*, web y aviso interno', async () => {
    const m = montar();
    await m.owner.post('/api/oficinas', { nombre: 'Noticias' });
    await m.owner.post('/api/corridas', corrida('noticias'));
    await m.runner.esperarFin();
    const tools = m.llamadas[0]!.tools.split(',').sort();
    expect(tools).toEqual(['kb_buscar', 'kb_leer', 'notificar_interno', 'obscura_extract']);
  });

  it('un workflow editado con crm_* no es ejecutable; el duplicado de prospección tampoco', async () => {
    const m = montar();
    await m.owner.post('/api/oficinas', { nombre: 'Noticias' });
    const wf = (await m.owner.get('/api/oficinas/noticias/workflow')).body.workflow;
    wf.pasos.asistente.herramientas.push('crm_qa');
    const put = await m.owner.put('/api/oficinas/noticias/workflow', { workflow: wf });
    expect(put.status).toBe(200);
    expect(put.body.advertencias[0]).toContain('crm_qa');
    const r = await m.owner.post('/api/corridas', corrida('noticias'));
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('herramientas no permitidas');
    // JSON inválido o con SQL que escribe se rechaza con 400
    const mal = await m.owner.put('/api/oficinas/noticias/workflow', { workflow: { version: 1 } });
    expect(mal.status).toBe(400);
    const sql = structuredClone(wf);
    sql.progreso[0].sql = 'DELETE FROM empresas';
    expect((await m.owner.put('/api/oficinas/noticias/workflow', { workflow: sql })).status).toBe(
      400,
    );
    const dup = await m.owner.post('/api/oficinas', {
      nombre: 'Prospección 2',
      plantilla: 'duplicar',
      origen: 'prospeccion',
    });
    expect(dup.body.ejecutable).toBe(false);
    const rd = await m.owner.post('/api/corridas', {
      office_id: dup.body.id,
      params: { max_items: 1 },
    });
    expect(rd.status).toBe(409);
    expect(m.llamadas).toHaveLength(0);
  });

  it('una oficina archivada no corre; al restaurarla sí', async () => {
    const m = montar();
    await m.owner.post('/api/oficinas', { nombre: 'Noticias' });
    await m.owner.post('/api/oficinas/noticias/archivar');
    const r = await m.owner.post('/api/corridas', corrida('noticias'));
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('archivada');
    await m.owner.post('/api/oficinas/noticias/restaurar');
    expect((await m.owner.post('/api/corridas', corrida('noticias'))).status).toBe(201);
    await m.runner.esperarFin();
  });

  it('la API de agente solo permite crm_* a prospección; kb y avisos sirven a todas', async () => {
    const m = montar();
    await m.owner.post('/api/oficinas', { nombre: 'Noticias' });
    const ag = m.agente('noticias');
    expect((await ag.post('/empresas', { nombre: 'X' })).status).toBe(403);
    expect((await ag.get('/directorio/buscar?texto=x')).status).toBe(403);
    expect((await ag.get('/kb/buscar?texto=hola')).status).toBe(200);
    const n = await ag.post('/notificar', { asunto: 'Listo', texto: 'Terminé el resumen' });
    expect(n.status).toBe(201);
    expect(n.body).toMatchObject({ office_id: 'noticias', agente: 'Asistente' });
    expect((await m.agente('prospeccion').get('/corrida')).status).toBe(200);
    const act = (await m.owner.get('/api/actividad').set('x-office-id', 'noticias'))
      .body as unknown[];
    expect(act).toHaveLength(1);
    expect((await m.owner.get('/api/actividad')).body).toEqual([]);
  });
});
