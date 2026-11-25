import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { leerLineaClaude, lecturaVacia } from '../src/server/runner/claude';
import {
  estadoPlan,
  estimarCorrida,
  guardarLimites,
  motivoReserva,
} from '../src/server/runner/plan';
import { workflowSchema } from '../src/server/runner/workflow';
import { corridaBody, montar, type Montaje } from './runner-helpers';
import { agentes, correr, estadoCorrida } from './runner-util';

let m: Montaje | null = null;
afterEach(() => {
  m?.cerrar();
  m = null;
});

const EVENTO = {
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed',
    resetsAt: 1795662000,
    rateLimitType: 'five_hour',
    unifiedWindows: {
      five_hour: { utilization: 0.29, resetsAt: 1795662000, status: 'allowed' },
      seven_day: { utilization: 0.19, resetsAt: 1796090400, status: 'allowed' },
    },
  },
};

describe('P7b: límites del plan que informa el CLI', () => {
  it('lee ventanas, % y reinicio del rate_limit_event real; credits_required no es límite del plan', () => {
    const st = lecturaVacia();
    leerLineaClaude(JSON.stringify(EVENTO), st);
    expect(st.plan?.ventanas['five_hour']).toEqual({
      utilizacion: 0.29,
      reinicia_en: 1795662000,
      estado: 'allowed',
    });
    expect(st.limite).toBe(false);
    const c = lecturaVacia();
    leerLineaClaude(
      JSON.stringify({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', errorCode: 'credits_required' },
      }),
      c,
    );
    expect(c.limite).toBe(false);
    expect(c.requiereCreditos).toBe(true);
  });

  it('guarda el último estado y GET /api/plan lo expone como dato del CLI', async () => {
    m = await montar({ escenario: { plan: 0.4 } });
    await correr(m, 1);
    const r = await m.get('/api/plan');
    expect(r.body.modo).toBe('cli');
    expect(r.body.ventanas.five_hour.pct).toBe(40);
    expect(r.body.ventanas.seven_day.pct).toBe(10);
    expect(r.body.reserva.five_hour_pct).toBe(70);
  });

  it('un dato del CLI de una ventana ya reiniciada no cuenta', () => {
    const db = openDb(':memory:');
    guardarLimites(db, {
      estado: 'allowed',
      ventanas: { five_hour: { utilizacion: 0.9, reinicia_en: 1000, estado: 'allowed' } },
    });
    expect(estadoPlan(db).modo).toBe('sin_datos');
    expect(motivoReserva(db)).toBeNull();
  });
});

describe('P7b: reserva del plan', () => {
  it('pausa con pausada_reserva_plan al cruzar la reserva y se reanuda sin volver a pausar', async () => {
    m = await montar({ escenario: { plan: 0.8 } });
    const id = await correr(m, 2);
    const c = estadoCorrida(m, id);
    expect(c.estado).toBe('pausada_reserva_plan');
    expect(c.motivo_fin).toContain('80 %');
    expect(m.llamadas().length).toBeGreaterThan(0);
    m.cambiarEscenario({});
    const r = await m.post(`/api/corridas/${id}/reanudar`);
    expect(r.status).toBe(200);
    await m.runner.esperarFin();
    expect(estadoCorrida(m, id).estado).toBe('terminada');
  });

  it('la reserva es editable desde Configuración', async () => {
    m = await montar({ escenario: { plan: 0.8 } });
    expect((await m.patch('/api/config', { reserva_5h_pct: 90 })).status).toBe(200);
    const id = await correr(m, 1);
    expect(estadoCorrida(m, id).estado).toBe('terminada');
    expect((await m.patch('/api/config', { reserva_5h_pct: 5 })).status).toBe(400);
  });

  it('sin datos del CLI usa el estimado con tokens y presupuesto del dueño, rotulado como estimado', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ('presupuesto_5h_tokens','100000','x')",
    ).run();
    expect(estadoPlan(db).modo).toBe('estimado');
    expect(estadoPlan(db).estimado.pct).toBe(0);
    db.prepare(
      "INSERT INTO salidas_agente (agente, paso, tipo, resultado, tokens_estimados) VALUES ('Analista','analista','paso','ok',75000)",
    ).run();
    expect(estadoPlan(db).estimado.pct).toBe(75);
    expect(motivoReserva(db)).toContain('estimado');
  });
});

describe('P7b: estimador por corrida', () => {
  it('sin historial usa la referencia; con historial usa el promedio por empresa', () => {
    const db = openDb(':memory:');
    const sin = estimarCorrida(db, 'prospeccion', 4);
    expect(sin.base).toBe('referencia');
    expect(sin.tokens).toBe(4 * sin.tokens_por_item);
    db.prepare(
      "INSERT INTO corridas (id, zona, giro, max_empresas, motor) VALUES (1,'a','b',2,'x')",
    ).run();
    for (const item of [1, 2])
      db.prepare(
        "INSERT INTO salidas_agente (office_id, corrida_id, agente, paso, item_id, tipo, resultado, tokens_estimados) VALUES ('prospeccion',1,'Analista','analista',?,'paso','ok',50000)",
      ).run(item);
    const con = estimarCorrida(db, 'prospeccion', 10);
    expect(con.base).toBe('historial');
    expect(con.tokens_por_item).toBe(50000);
    expect(con.requiere_confirmacion).toBe(false);
  });

  it('exige confirmación si supera el umbral y la acepta con confirmado=true', async () => {
    m = await montar();
    await m.patch('/api/config', { umbral_confirmacion_tokens: 100_000 });
    const sin = await m.post('/api/corridas', corridaBody(2));
    expect(sin.status).toBe(409);
    expect(sin.body.codigo).toBe('requiere_confirmacion');
    expect(sin.body.estimado.tokens).toBeGreaterThan(100_000);
    const est = await m.get('/api/corridas/estimado?max_empresas=2');
    expect(est.body.requiere_confirmacion).toBe(true);
    const ok = await m.post('/api/corridas', { ...corridaBody(1), confirmado: true });
    expect(ok.status).toBe(201);
    await m.runner.esperarFin();
  });
});

describe('P7b: modelo por paso', () => {
  it('usa el modelo del paso, o el de engine.yaml si no lo define, y lo registra en salidas', async () => {
    m = await montar();
    const wf = m.runner.oficina('prospeccion')!.workflow;
    wf.pasos['guardian']!.modelo = 'claude-haiku-5-5';
    wf.pasos['calificador_redactor']!.modelo = 'claude-haiku-5-5';
    await correr(m, 1);
    const por = (a: string) => m!.llamadas().find((l) => l.agente === a)?.modelo;
    expect(por('Guardian')).toBe('claude-haiku-5-5');
    expect(por('Redactor')).toBe('claude-haiku-5-5');
    expect(por('Rastreador')).toBe('claude-sonnet-5-5');
    const filas = m.db
      .prepare("SELECT DISTINCT modelo FROM salidas_agente WHERE agente='Guardian'")
      .all();
    expect(filas).toEqual([{ modelo: 'claude-haiku-5-5' }]);
    const pasos = (await m.get('/api/prompts-pasos')).body as { paso: string; modelo: string }[];
    expect(pasos.find((p) => p.paso === 'guardian')?.modelo).toBe('claude-haiku-5-5');
  });

  it('un modelo que exige créditos no se confunde con el límite del plan', async () => {
    m = await montar({ escenario: { credito: 'Analista' } });
    const id = await correr(m, 1);
    expect(estadoCorrida(m, id).estado).not.toBe('pausada_limite_plan');
    expect(agentes(m)).toContain('Analista');
  });

  it('el esquema del workflow rechaza modelos desconocidos', () => {
    const wf = JSON.parse(readFileSync('config/offices/prospeccion/workflow.json', 'utf8')) as {
      pasos: Record<string, { modelo?: string }>;
    };
    wf.pasos['guardian']!.modelo = 'gpt-4';
    expect(workflowSchema.safeParse(wf).success).toBe(false);
    wf.pasos['guardian']!.modelo = 'claude-haiku-5-5';
    expect(workflowSchema.safeParse(wf).success).toBe(true);
  });

  it('la migración 004 conserva integridad y acepta el estado nuevo', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO corridas (zona,giro,max_empresas,motor,estado) VALUES ('a','b',1,'x','pausada_reserva_plan')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO corridas (zona,giro,max_empresas,motor,estado) VALUES ('a','b',1,'x','malo')",
        )
        .run(),
    ).toThrow();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
