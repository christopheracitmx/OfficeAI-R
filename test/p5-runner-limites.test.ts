import { afterEach, describe, expect, it } from 'vitest';
import { corridaBody, montar, vivo, type Montaje } from './runner-helpers';
import { agentes, correr, estadoCorrida, prospectos } from './runner-util';

let m: Montaje | null = null;
afterEach(() => {
  m?.cerrar();
  m = null;
});

describe('Runner: límites, fallos, timeout y detener', () => {
  it('límite del plan pausa la corrida sin reintentar y se puede reanudar', async () => {
    m = await montar({ escenario: { limite: 'Analista' } });
    const id = await correr(m, 2);
    expect(estadoCorrida(m, id).estado).toBe('pausada_limite_plan');
    expect(agentes(m).filter((x) => x === 'Analista')).toHaveLength(1);
    const antes = m.llamadas().length;
    await new Promise((r) => setTimeout(r, 300));
    expect(m.llamadas().length).toBe(antes);
    expect(m.runner.estado().activo).toBe(false);
    const s = m.db
      .prepare("SELECT resultado FROM salidas_agente WHERE agente='Analista'")
      .get() as {
      resultado: string;
    };
    expect(s.resultado).toBe('limite');

    m.cambiarEscenario({});
    const r = await m.post(`/api/corridas/${id}/reanudar`);
    expect(r.status).toBe(200);
    await m.runner.esperarFin();
    expect(estadoCorrida(m, id).estado).toBe('terminada');
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }, { estado: 'Reportado' }]);
  });

  it('circuit breaker: pasos fallidos seguidos cortan la corrida con error', async () => {
    m = await montar({ escenario: { error: 'Rastreador' } });
    const id = await correr(m, 5);
    const c = estadoCorrida(m, id);
    expect(c.estado).toBe('error');
    expect(c.motivo_fin).toContain('Circuit breaker');
    expect(agentes(m).filter((x) => x === 'Rastreador')).toHaveLength(6); // 3 pasos × (intento + reintento)
  });

  it('timeout por paso: mata el proceso, registra timeout y sigue', async () => {
    m = await montar({ escenario: { colgar: 'Rastreador' }, cfg: { timeout_paso_min: 0.03 } });
    const id = await correr(m, 1);
    expect(estadoCorrida(m, id).estado).toBe('terminada');
    const pids = m
      .llamadas()
      .filter((l) => l.agente === 'Rastreador')
      .map((l) => l.pid);
    expect(pids).toHaveLength(1); // un timeout no se reintenta
    expect(vivo(pids[0]!)).toBe(false);
    const s = m.db
      .prepare("SELECT resultado FROM salidas_agente WHERE agente='Rastreador'")
      .get() as {
      resultado: string;
    };
    expect(s.resultado).toBe('timeout');
  });

  it('detener aborta el proceso hijo y cierra la corrida como detenida', async () => {
    m = await montar({ escenario: { colgar: 'Rastreador' } });
    const r = await m.post('/api/corridas', corridaBody(1));
    const id = r.body.id as number;
    for (let i = 0; i < 100 && !m.llamadas().some((l) => l.agente === 'Rastreador'); i++)
      await new Promise((x) => setTimeout(x, 100));
    const pid = m.llamadas().find((l) => l.agente === 'Rastreador')!.pid;
    expect(vivo(pid)).toBe(true);
    const d = await m.post(`/api/corridas/${id}/detener`);
    expect(d.status).toBe(200);
    expect(estadoCorrida(m, id).estado).toBe('detenida');
    expect(vivo(pid)).toBe(false);
    expect(m.runner.estado().activo).toBe(false);
    const n = m.llamadas().length;
    await new Promise((x) => setTimeout(x, 300));
    expect(m.llamadas().length).toBe(n);
  });

  it('una corrida huérfana (servidor reiniciado) se marca con error', async () => {
    m = await montar();
    m.db
      .prepare("INSERT INTO corridas (zona, giro, max_empresas, motor) VALUES ('CDMX','x',1,'m')")
      .run();
    expect(m.runner.recuperarHuerfanas()).toBe(1);
    expect(estadoCorrida(m, 1).estado).toBe('error');
  });
});
