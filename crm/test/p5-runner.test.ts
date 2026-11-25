import { afterEach, describe, expect, it } from 'vitest';
import { corridaBody, montar, type Montaje } from './runner-helpers';
import { agentes, correr, estadoCorrida, prospectos } from './runner-util';

let m: Montaje | null = null;
afterEach(() => {
  m?.cerrar();
  m = null;
});
describe('Runner: seguridad de arranque', () => {
  it('no ejecuta nada sin corrida iniciada por el dueño', async () => {
    m = await montar();
    await new Promise((r) => setTimeout(r, 300));
    expect(m.llamadas()).toHaveLength(0);
    expect(m.runner.estado().activo).toBe(false);
    expect(() => m!.runner.iniciar(999)).toThrow(/no existe|en curso/);
    expect(m.llamadas()).toHaveLength(0);
  });

  it('no arranca una corrida que ya no está en curso y solo permite un pipeline activo', async () => {
    m = await montar({ escenario: { colgar: 'Explorador' } });
    const r = await m.post('/api/corridas', corridaBody(1));
    expect(r.status).toBe(201);
    expect(() => m!.runner.iniciar(r.body.id as number)).toThrow(/un pipeline activo/);
    expect((await m.post('/api/corridas', corridaBody(1))).status).toBe(409);
    await m.post(`/api/corridas/${r.body.id as number}/detener`);
    expect(() => m!.runner.iniciar(r.body.id as number)).toThrow(/no está en curso/);
  });

  it('las rutas de corrida exigen el Origin de la UI', async () => {
    m = await montar();
    const r = await (
      await import('supertest')
    )
      .default(m.app)
      .post('/api/corridas')
      .send(corridaBody(1));
    expect(r.status).toBe(403);
    expect(m.llamadas()).toHaveLength(0);
  });
});

describe('Runner: flujo feliz y datos del paso', () => {
  it('descubre, filtra en lote, procesa y reporta con correo interno', async () => {
    m = await montar();
    const id = await correr(m, 2);
    expect(estadoCorrida(m, id).estado).toBe('terminada');
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }, { estado: 'Reportado' }]);
    expect(m.mailer.enviados).toHaveLength(2);
    const a = agentes(m);
    // Places apagado (sin llave): Cartógrafo omitido; Explorador completa; un Guardián en lote.
    expect(a.filter((x) => x === 'Cartografo')).toHaveLength(0);
    expect(a.filter((x) => x === 'Explorador')).toHaveLength(1);
    expect(a.filter((x) => x === 'Guardian')).toHaveLength(1);
    expect(a.slice(0, 2)).toEqual(['Explorador', 'Guardian']);
    expect(a.filter((x) => x === 'Armador')).toHaveLength(2); // Estratega+Armador agrupados
    expect(a.filter((x) => x === 'Redactor')).toHaveLength(2); // Calificador+Redactor agrupados
    expect(a).toHaveLength(14);
  });

  it('fija modelo Sonnet 5.5, esfuerzo, tope de turnos, herramientas mínimas y mensajes solo con ids', async () => {
    m = await montar();
    await correr(m, 1);
    const ll = m.llamadas();
    for (const l of ll) {
      expect(l.modelo).toBe('claude-sonnet-5-5');
      expect(l.esfuerzo).toBe('low');
      expect(Number(l.maxTurns)).toBeGreaterThan(0);
      expect(l.herramientas.length).toBeGreaterThan(0);
      expect(l.placesKey).toBe('');
      expect(l.prompt).toContain('CANDADOS FIJOS');
      expect(l.prompt).toContain('CONTEXTO DE LA CORRIDA');
    }
    const g = ll.find((l) => l.agente === 'Guardian')!;
    expect(g.herramientas).not.toContain('crm_finalizar_prospecto');
    expect(g.herramientas).not.toContain('places_search');
    const rast = ll.find((l) => l.agente === 'Rastreador')!;
    expect(rast.mensaje).toMatch(/^empresa_id=\d+ — /);
    expect(rast.mensaje.length).toBeLessThan(200);
    const q = ll.find((l) => l.agente === 'QA-1')!;
    expect(q.mensaje).toMatch(/empresa_id=\d+ prospecto_id=\d+ — /);
  });

  it('registra salidas por agente y eventos con office_id para Ver oficina', async () => {
    m = await montar();
    const id = await correr(m, 1);
    const s = (await m.get(`/api/salidas?corrida_id=${id}`)).body as {
      office_id: string;
      agente: string;
      resultado: string;
      tokens_estimados: number | null;
    }[];
    // una fila por rol: los pasos agrupados (Estratega+Armador, Calificador+Redactor) dejan dos filas
    expect(s.length).toBe(m.llamadas().length + 2);
    expect(s.map((x) => x.agente)).toContain('Estratega');
    expect(s.every((x) => x.office_id === 'prospeccion' && x.resultado === 'ok')).toBe(true);
    expect(s.reduce((a, x) => a + (x.tokens_estimados ?? 0), 0)).toBeGreaterThanOrEqual(
      155 * m.llamadas().length,
    );
    const ev = m.db
      .prepare("SELECT agente, accion, office_id FROM actividad_agentes WHERE agente='Coordinador'")
      .all() as { accion: string; office_id: string }[];
    expect(ev.some((e) => e.accion === 'inició la corrida')).toBe(true);
    expect(ev.every((e) => e.office_id === 'prospeccion')).toBe(true);
    const prog = (await m.get(`/api/corridas/${id}/progreso`)).body as {
      progreso: { id: string; valor: number }[];
    };
    expect(prog.progreso.find((p) => p.id === 'reportados')?.valor).toBe(1);
  });

  it('con agrupar_pasos=false lanza cada rol por separado', async () => {
    m = await montar({ cfg: { agrupar_pasos: false } });
    await correr(m, 1);
    const a = agentes(m);
    expect(a).toEqual([
      'Explorador',
      'Guardian',
      'Rastreador',
      'Analista',
      'Estratega',
      'Armador',
      'QA-1',
      'Calificador',
      'Redactor',
      'QA-2',
    ]);
    const armador = m.llamadas().find((l) => l.agente === 'Armador')!;
    expect(armador.mensaje).toContain('Propuestas del Estratega');
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }]);
  });

  it('usa Places solo si hay llave y la capacidad no está apagada', async () => {
    m = await montar({ env: { GOOGLE_PLACES_API_KEY: 'llave-falsa' } });
    await correr(m, 2);
    const a = agentes(m);
    expect(a[0]).toBe('Cartografo');
    expect(a).not.toContain('Explorador');
    expect(m.llamadas()[0]!.placesKey).toBeUndefined();
    m.cerrar();
    m = await montar({ env: { GOOGLE_PLACES_API_KEY: 'x' }, cfg: { capacidades_off: ['places'] } });
    await correr(m, 1);
    expect(agentes(m)).not.toContain('Cartografo');
  });

  it('cuota de Places: el Explorador completa; si no alcanza, pausa con pausada_cuota_places', async () => {
    m = await montar({
      env: { GOOGLE_PLACES_API_KEY: 'x' },
      escenario: { Cartografo: 1, cuota: true },
    });
    let id = await correr(m, 2);
    expect(estadoCorrida(m, id).estado).toBe('terminada');
    m.cerrar();
    m = await montar({
      env: { GOOGLE_PLACES_API_KEY: 'x' },
      escenario: { Cartografo: 1, Explorador: 0, cuota: true },
    });
    id = await correr(m, 2);
    expect(estadoCorrida(m, id).estado).toBe('pausada_cuota_places');
    expect(prospectos(m)).toHaveLength(1); // procesó lo descubierto
  });
});

describe('Runner: devoluciones de QA', () => {
  it('QA-1 devuelve al Rastreador y vuelve a revisar', async () => {
    m = await montar({ escenario: { qa1_rechazos: 1, qa1_destino: 'Rastreador' } });
    await correr(m, 1);
    const a = agentes(m);
    expect(a.filter((x) => x === 'Rastreador')).toHaveLength(2);
    expect(a.filter((x) => x === 'QA-1')).toHaveLength(2);
    const rep = m.llamadas().filter((l) => l.agente === 'Rastreador')[1]!;
    expect(rep.mensaje).toContain('DEVOLUCIÓN de QA1');
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }]);
  });

  it('QA-2 devuelve al Redactor y se reporta tras corregir', async () => {
    m = await montar({ escenario: { qa2_rechazos: 1, qa2_destino: 'Redactor' } });
    await correr(m, 1);
    const a = agentes(m);
    expect(a.filter((x) => x === 'QA-2')).toHaveLength(2);
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }]);
    expect(m.mailer.enviados).toHaveLength(1);
  });

  it('a la tercera devolución el servidor pasa a Revisión humana y no se reporta', async () => {
    m = await montar({ escenario: { qa1_rechazos: 3, qa1_destino: 'Analista' } });
    const id = await correr(m, 1);
    expect(prospectos(m)).toEqual([{ estado: 'Revision humana' }]);
    expect(m.mailer.enviados).toHaveLength(0);
    expect(estadoCorrida(m, id).estado).toBe('terminada');
    expect(estadoCorrida(m, id).motivo_fin).toContain('Revisión humana 1');
  });

  it('si QA-2 aprueba pero no finaliza, el cierre lo hace el sistema', async () => {
    m = await montar({ escenario: { no_finalizar: true } });
    await correr(m, 1);
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }]);
    expect(m.mailer.enviados).toHaveLength(1);
  });

  it('reintenta una vez si el agente no guardó el resultado esperado', async () => {
    m = await montar({ escenario: { rastreador_olvida: true } });
    await correr(m, 1);
    const r = m.llamadas().filter((l) => l.agente === 'Rastreador');
    expect(r).toHaveLength(2);
    expect(r[1]!.mensaje).toContain('REINTENTO');
    expect(prospectos(m)).toEqual([{ estado: 'Reportado' }]);
  });

  it('empresa sin datos de contacto queda descartada con motivo y no avanza', async () => {
    m = await montar({ escenario: { sin_datos: [1] } });
    await correr(m, 1);
    const e = m.db.prepare('SELECT etapa, descartada_motivo FROM empresas').get() as {
      etapa: string;
      descartada_motivo: string;
    };
    expect(e.etapa).toBe('descartada');
    expect(e.descartada_motivo).toContain('sin_datos');
    expect(agentes(m)).not.toContain('Analista');
  });
});
