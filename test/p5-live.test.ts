import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { openDb } from '../src/server/db';
import { crearRunner } from '../src/server/offices';
import { leerEngineYaml } from '../src/server/runner/motor';
import { crearCorrida } from '../src/server/services/admin';
import { upsertEmpresa } from '../src/server/services/empresas';
import { EventBus } from '../src/server/services/events';
import { FakeMailer, TOKEN, UI } from './helpers';

/**
 * PRUEBA EN VIVO con el CLI real (gasta plan de la suscripción). Solo con LIVE=1:
 *   LIVE=1 npx vitest run test/p5-live.test.ts
 * Una empresa sembrada, SIN Places (sin llave: no gasta cuota) y con correo FALSO (nada se envía).
 */
describe.skipIf(process.env['LIVE'] !== '1')('LIVE: una corrida real con Claude Code', () => {
  it('procesa 1 empresa de punta a punta', { timeout: 20 * 60_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-'));
    const tokenFile = join(dir, 'agent.token');
    writeFileSync(tokenFile, TOKEN);
    const db = openDb(':memory:');
    const bus = new EventBus();
    const mailer = new FakeMailer();
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const puerto = (server.address() as { port: number }).port;
    const cfg = leerEngineYaml(resolve('config/engine.yaml'));
    // P7b: LIVE_HAIKU="guardian,calificador_redactor" prueba esos pasos con Haiku; LIVE_ETIQUETA nombra el informe.
    const etiqueta = process.env['LIVE_ETIQUETA'] ?? 'last';
    const haiku = (process.env['LIVE_HAIKU'] ?? '').split(',').filter(Boolean);
    const runner = crearRunner({
      db,
      bus,
      mailer,
      from: 'info@mail.acitmx.net',
      baseUrl: 'http://127.0.0.1:5174',
      raiz: resolve('.'),
      puerto,
      tokenFile,
      env: {}, // sin llave de Places
      cfg,
    });
    server.on(
      'request',
      createApp({
        db,
        bus,
        mailer,
        from: 'info@mail.acitmx.net',
        baseUrl: 'http://127.0.0.1:5174',
        agentToken: TOKEN,
        uiOrigins: [UI],
        env: { NODE_ENV: 'test' },
        runner,
      }),
    );
    const eventos: string[] = [];
    bus.on('actividad', (e: { agente: string; accion: string }) =>
      eventos.push(`${e.agente}: ${e.accion}`),
    );

    const wf = runner.oficina('prospeccion')!.workflow;
    for (const p of haiku) wf.pasos[p]!.modelo = 'claude-haiku-5-5';
    const c = crearCorrida(
      db,
      { zona: 'CDMX', giro: 'Cualquiera', max_empresas: 1, office_id: 'prospeccion' },
      cfg.engine,
    );
    if (!c.ok) throw new Error(c.error);
    upsertEmpresa(db, {
      nombre: 'ACIT México (empresa de prueba)',
      metodo_descubrimiento: 'manual',
      origen_nota: 'Siembra de la prueba LIVE',
      direccion: 'Ciudad de México, CDMX',
      sitio_web: 'https://acitmx.net',
      corrida_id: c.id,
    });
    const t0 = Date.now();
    runner.iniciar(c.id);
    await runner.esperarFin();

    const corrida = db
      .prepare('SELECT estado, motivo_fin FROM corridas WHERE id = ?')
      .get(c.id) as {
      estado: string;
      motivo_fin: string;
    };
    const salidas = db
      .prepare(
        "SELECT agente, resultado, tokens_estimados, tokens_brutos, turnos, prompt_tokens, herramientas, duracion_ms FROM salidas_agente WHERE tipo = 'paso' ORDER BY id",
      )
      .all() as {
      agente: string;
      resultado: string;
      tokens_estimados: number | null;
      tokens_brutos: number | null;
      turnos: number | null;
      prompt_tokens: number | null;
      herramientas: string | null;
      duracion_ms: number;
    }[];
    const tokens = salidas.reduce((a, s) => a + (s.tokens_estimados ?? 0), 0);
    const brutos = salidas.reduce((a, s) => a + (s.tokens_brutos ?? 0), 0);
    const prospecto = db.prepare('SELECT estado, score, nivel FROM prospectos').all() as object[];
    const cab = `LIVE: ${corrida.estado} | ${corrida.motivo_fin} | ${salidas.length} pasos | ${tokens} tokens ponderados / ${brutos} brutos | ${Math.round((Date.now() - t0) / 1000)} s`;
    const pros = `prospectos: ${JSON.stringify(prospecto)} | correos falsos: ${mailer.enviados.length}`;
    const det = salidas.map(
      (x) =>
        `  ${x.agente} ${x.resultado} pond=${x.tokens_estimados ?? '?'} bruto=${x.tokens_brutos ?? '?'} turnos=${x.turnos ?? '?'} prompt=${x.prompt_tokens ?? '?'} ${Math.round(x.duracion_ms / 1000)}s ${x.herramientas ?? ''}`,
    );
    const lim = db.prepare('SELECT ventana, utilizacion FROM limites_plan').all();
    const calidad = {
      contactos: db.prepare('SELECT tipo, valor, nombre, fuente_url FROM contactos').all(),
      ficha: db
        .prepare(
          'SELECT nombre, etapa, descartada_motivo, sitio_web, sitio_verificado, tamano, sucursales, resumen FROM empresas',
        )
        .all(),
      necesidades: db.prepare('SELECT texto, tipo FROM necesidades').all(),
      qa: db.prepare('SELECT etapa, aprobado, devolver_a, motivos FROM revisiones_qa').all(),
      prospecto: db
        .prepare(
          'SELECT estado, score, nivel, justificacion, reporte_md, borrador_correo FROM prospectos',
        )
        .all(),
      paquetes: db.prepare('SELECT nombre, componentes, argumento FROM paquetes').all(),
      pasos_haiku: haiku,
      plan_despues: lim,
    };
    writeFileSync(
      resolve(`data/live-${etiqueta}.txt`),
      [cab, pros, `límites: ${JSON.stringify(lim)}`, ...det, ...eventos, ''].join('\n'),
    );
    writeFileSync(resolve(`data/live-${etiqueta}.json`), JSON.stringify(calidad, null, 2));
    server.close();
    rmSync(dir, { recursive: true, force: true });

    expect(['terminada', 'pausada_limite_plan']).toContain(corrida.estado);
    expect(salidas.length).toBeGreaterThan(0);
    expect(salidas.some((s) => s.resultado === 'ok')).toBe(true);
    // Seguridad: ningún correo salió del transporte falso hacia fuera de la allowlist.
    const permitidos = (
      db.prepare('SELECT email FROM destinatarios_internos').all() as { email: string }[]
    ).map((d) => d.email);
    for (const m of mailer.enviados) expect(permitidos).toContain(m.to);
  });
});
