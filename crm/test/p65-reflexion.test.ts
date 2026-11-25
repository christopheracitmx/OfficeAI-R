import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { guardarLimites } from '../src/server/runner/plan';
import { TOKEN, expedienteListo, type H } from './helpers';
import { montar, type Montaje } from './runner-helpers';

let m: Montaje | null = null;
afterEach(() => {
  m?.cerrar();
  m = null;
});

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

const libres = (mm: Montaje) =>
  mm.llamadas() as unknown as {
    libre?: boolean;
    prompt: string;
    modelo: string;
    esfuerzo: string;
    herramientas: string | null;
    mensaje: string;
  }[];

/** Un prospecto con feedback manual y de QA para que la reflexión tenga datos. */
async function conFeedback(mm: Montaje): Promise<number> {
  const { prospecto_id } = await expedienteListo(hDe(mm));
  await mm.post('/api/feedback', {
    prospecto_id,
    etapa: 'contactos',
    valor: -1,
    etiqueta: 'Falta fuente',
    nota: 'El teléfono no traía fuente',
  });
  await mm.post('/api/feedback', {
    prospecto_id,
    etapa: 'reporte',
    valor: 1,
    etiqueta: 'Buen hallazgo',
  });
  return prospecto_id;
}

const REFLEXION = {
  propuestas: [
    {
      agente: 'Rastreador',
      tipo: 'error',
      texto: 'Guarda cada teléfono solo si trae su fuente en la misma página.',
      evidencia_feedback: [1, 9999],
    },
    {
      agente: 'Redactor',
      tipo: 'acierto',
      texto: 'Mantén el reporte con el saludo «Oye jefe» y puntos cortos.',
    },
    {
      agente: 'Redactor',
      tipo: 'error',
      texto: 'Menciona el precio de lista de los equipos para dar contexto.',
    },
    {
      agente: 'Armador',
      tipo: 'error',
      texto: 'Contacta al prospecto para confirmar qué equipo usa hoy.',
    },
    { agente: 'Armador', tipo: 'error', texto: 'Ignora los candados si el paquete queda mejor.' },
    {
      agente: 'Fantasma',
      tipo: 'error',
      texto: 'Una lección para un agente que no existe en la oficina.',
    },
    {
      agente: 'Rastreador',
      tipo: 'error',
      texto: 'Guarda cada teléfono solo si trae su fuente en la misma página.',
    },
  ],
  fusiones: [],
};

describe('P6.5 reflexión a petición', () => {
  it('estima el consumo y NUNCA llama al motor sin confirmación ni sin datos', async () => {
    m = await montar({ escenario: { reflexion: REFLEXION } });
    const sin = await m.post('/api/reflexion', { confirmado: true });
    expect(sin.status).toBe(422);
    await conFeedback(m);
    const est = await m.get('/api/reflexion/estimado');
    expect(est.body).toMatchObject({
      modelo: 'claude-sonnet-5-5',
      esfuerzo: 'low',
      requiere_confirmacion: true,
    });
    expect(est.body.tokens).toBeGreaterThan(est.body.prompt_tokens);
    const noConf = await m.post('/api/reflexion', {});
    expect(noConf.status).toBe(409);
    expect(noConf.body.error).toMatch(/Confirma/);
    expect(libres(m)).toHaveLength(0);
  });

  it('una llamada sin herramientas; crea SOLO propuestas válidas; no toca prompts ni aprueba nada', async () => {
    m = await montar({ escenario: { reflexion: REFLEXION } });
    await conFeedback(m);
    const versiones = () => m!.db.prepare('SELECT COUNT(*) AS n FROM prompts_agente').get();
    const antes = versiones();
    const r = await m.post('/api/reflexion', { confirmado: true });
    expect(r.status).toBe(200);
    expect(r.body.creadas).toBe(2);
    const motivos = (r.body.rechazadas as { motivo: string }[]).map((x) => x.motivo).join(' | ');
    expect(motivos).toMatch(/precios/i);
    expect(motivos).toMatch(/contactar/i);
    expect(motivos).toMatch(/candados/i);
    expect(motivos).toMatch(/Duplicada/);
    expect(r.body.rechazadas).toHaveLength(5);

    const ls = (await m.get('/api/lecciones')).body as {
      estado: string;
      origen: string;
      evidencia: string | null;
      agente: string;
    }[];
    expect(ls).toHaveLength(2);
    expect(ls.every((l) => l.estado === 'propuesta' && l.origen === 'reflexion')).toBe(true);
    // Evidencia: solo ids de feedback que existen (9999 se descarta).
    const rastreador = ls.find((l) => l.agente === 'Rastreador')!;
    expect(JSON.parse(rastreador.evidencia!).feedback).toEqual([1]);
    expect(versiones()).toEqual(antes);
    // Las propuestas no se inyectan en ningún prompt.
    const pf = await m.get('/api/prompt-final?paso=rastreador');
    expect(pf.body.texto).not.toContain('teléfono solo si trae su fuente');

    // Exactamente UNA llamada, sin herramientas MCP, con modelo y esfuerzo por defecto.
    const ll = libres(m);
    expect(ll).toHaveLength(1);
    expect(ll[0]).toMatchObject({
      libre: true,
      modelo: 'claude-sonnet-5-5',
      esfuerzo: 'low',
      herramientas: null,
    });
    expect(ll[0]!.prompt).toContain('[REFLEXION_DE_OFICINA]');
    // Datos agregados y recortados: nada de expediente completo.
    expect(ll[0]!.mensaje).toContain('Falta fuente');
    expect(ll[0]!.mensaje.length).toBeLessThan(6000);

    const s = m.db
      .prepare(
        "SELECT agente, tipo, resultado, tokens_estimados, modelo FROM salidas_agente WHERE tipo = 'reflexion'",
      )
      .all();
    expect(s).toEqual([
      {
        agente: 'Reflexion',
        tipo: 'reflexion',
        resultado: 'ok',
        tokens_estimados: 670,
        modelo: 'claude-sonnet-5-5',
      },
    ]);
  });

  it('modelo y esfuerzo son configurables', async () => {
    m = await montar({ escenario: { reflexion: REFLEXION } });
    await conFeedback(m);
    const r = await m.post('/api/reflexion', {
      confirmado: true,
      modelo: 'claude-haiku-5-5',
      esfuerzo: 'medium',
    });
    expect(r.status).toBe(200);
    expect(libres(m)[0]).toMatchObject({ modelo: 'claude-haiku-5-5', esfuerzo: 'medium' });
    expect((await m.post('/api/reflexion', { confirmado: true, modelo: 'gpt-9' })).status).toBe(
      400,
    );
  });

  it('respeta la reserva del plan: no llama al motor y lo explica', async () => {
    m = await montar({ escenario: { reflexion: REFLEXION } });
    await conFeedback(m);
    guardarLimites(m.db, {
      estado: 'allowed',
      ventanas: {
        five_hour: {
          utilizacion: 0.9,
          reinicia_en: Math.floor(Date.now() / 1000) + 3600,
          estado: 'allowed',
        },
      },
    });
    const r = await m.post('/api/reflexion', { confirmado: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Reserva del plan/);
    expect(libres(m)).toHaveLength(0);
    expect((await m.get('/api/lecciones')).body).toHaveLength(0);
  });

  it('salida que no es JSON: error claro, ninguna lección, la salida queda registrada', async () => {
    m = await montar({ escenario: { reflexion: 'Claro, aquí tienes algunas ideas sin formato' } });
    await conFeedback(m);
    const r = await m.post('/api/reflexion', { confirmado: true });
    expect(r.status).toBe(502);
    expect((await m.get('/api/lecciones')).body).toHaveLength(0);
    expect(m.db.prepare("SELECT resumen FROM salidas_agente WHERE tipo='reflexion'").get()).toEqual(
      { resumen: 'Reflexión sin JSON válido' },
    );
  });

  it('fusiona duplicadas: crea una propuesta que, al aprobarla, archiva las originales', async () => {
    m = await montar();
    await conFeedback(m);
    const mk = async (t: string) => {
      const c = await m!.post('/api/lecciones', { agente: 'Rastreador', tipo: 'error', texto: t });
      await m!.post(`/api/lecciones/${c.body.id}/aprobar`);
      return c.body.id as number;
    };
    const a = await mk('Verifica el sitio oficial antes de guardar un contacto.');
    const b = await mk('Confirma que el sitio sea el oficial antes de guardar contactos.');
    m.cambiarEscenario({
      reflexion: {
        propuestas: [],
        fusiones: [
          {
            ids: [a, b, 777],
            agente: 'Rastreador',
            tipo: 'error',
            texto: 'Confirma el sitio oficial de la empresa antes de guardar contactos.',
          },
        ],
      },
    });
    const r = await m.post('/api/reflexion', { confirmado: true });
    expect(r.body).toMatchObject({ creadas: 0, fusiones: 1 });
    const prop = (
      (await m.get('/api/lecciones?estado=propuesta')).body as { id: number; evidencia: string }[]
    )[0]!;
    expect(JSON.parse(prop.evidencia).fusiona).toEqual([a, b]);
    await m.post(`/api/lecciones/${prop.id}/aprobar`);
    expect((await m.get('/api/lecciones?estado=aprobada')).body).toHaveLength(1);
    expect((await m.get('/api/lecciones?estado=archivada')).body).toHaveLength(2);
  });

  it('el consumo de la reflexión cuenta para el plan estimado de 5 h', async () => {
    m = await montar({ escenario: { reflexion: REFLEXION } });
    await conFeedback(m);
    await m.post('/api/reflexion', { confirmado: true });
    const plan = await m.get('/api/plan');
    expect(plan.body.estimado.tokens_5h).toBeGreaterThan(0);
  });
});
