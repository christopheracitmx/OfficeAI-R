import { afterEach, describe, expect, it } from 'vitest';
import { guardarLimites } from '../src/server/runner/plan';
import { harness } from './helpers';
import { montar, type Montaje } from './runner-helpers';

let m: Montaje | null = null;
afterEach(() => {
  m?.cerrar();
  m = null;
});

const A = (rol: string, o: Record<string, unknown> = {}) => ({
  rol,
  area: 'Trabajo',
  tarea: `Hacer la parte de ${rol}`,
  es_qa: false,
  herramientas: [],
  web: false,
  ...o,
});

const BORRADOR_OK = {
  nombre: 'Facturas del mes',
  objetivo: 'Clasificar las facturas recibidas cada mes',
  entregable: 'Una tabla de facturas con su categoría',
  entrada: 'Carpeta de facturas',
  salida: 'Tabla de facturas',
  almacenamiento: 'Colección Facturas',
  agentes: [
    A('Clasificadora', { herramientas: ['coleccion_upsert'] }),
    A('Capturista', { persona: 'Luis', genero: 'm' }),
    A('Auditora', { es_qa: true }),
    A('Archivista'),
  ],
  devoluciones_max: 1,
  items_max: 4,
  colecciones: [
    {
      nombre: 'Facturas',
      campos: [{ nombre: 'folio', etiqueta: 'Folio', tipo: 'texto', requerido: true }],
      clave: 'folio',
    },
  ],
};

const sal = (mensaje: string, fase: number, borrador: object = {}, listo = false) =>
  JSON.stringify({ mensaje, fase, borrador, listo });
const turnos = (...t: [string, string][]) => ({
  libre_segun_prompt: t.map(([contiene, salida]) => ({ contiene, salida })),
});

describe('P10b Constructor (candados, reserva, prueba, galería)', () => {
  it('candados: topes fijos, relajar exige confirmación explícita y queda en cambios_log', async () => {
    m = await montar();
    const s = (await m.post('/api/constructor/sesiones', { modo: 'formulario' })).body;
    await m.patch(`/api/constructor/sesiones/${s.id}`, {
      parche: { ...BORRADOR_OK, items_max: 40 },
    });
    const mal = (await m.get(`/api/constructor/sesiones/${s.id}/vista-previa`)).body;
    expect(mal.errores.join(' ')).toMatch(/Máximo/);
    // los candados fijos no se relajan
    const fijo = await m.patch(`/api/constructor/sesiones/${s.id}`, {
      parche: { relajar_candados: ['sin_borrado'] },
    });
    expect(fijo.body.rechazos.length).toBe(0); // se guarda como solicitud…
    expect(
      (await m.get(`/api/constructor/sesiones/${s.id}/vista-previa`)).body.errores.join(' '),
    ).toMatch(/relaj|candado|Máximo/i);
    await m.patch(`/api/constructor/sesiones/${s.id}`, {
      parche: { relajar_candados: ['topes_consumo'] },
    });
    const sin = await m.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true });
    expect(sin.status).toBe(409);
    const con = await m.post(`/api/constructor/sesiones/${s.id}/crear`, {
      aprobado: true,
      confirmar_relajar: true,
    });
    expect(con.status).toBe(201);
    const log = m.db
      .prepare("SELECT accion FROM cambios_log WHERE office_id = ? AND entidad = 'candados'")
      .all(con.body.office_id) as { accion: string }[];
    expect(log.some((l) => l.accion.includes('RELAJÓ'))).toBe(true);
  });

  it('reserva del plan: pausa el asistente y avisa; el formulario sigue funcionando', async () => {
    m = await montar({ escenario: turnos(['X', sal('hola', 1)]) });
    guardarLimites(m.db, {
      estado: 'allowed',
      ventanas: {
        five_hour: {
          utilizacion: 0.99,
          reinicia_en: Math.floor(Date.now() / 1000) + 3600,
          estado: 'allowed',
        },
      },
    });
    const s = (await m.post('/api/constructor/sesiones', {})).body;
    expect(s.ia.disponible).toBe(false);
    const r = await m.post(`/api/constructor/sesiones/${s.id}/turno`, { texto: 'X' });
    expect(r.status).toBe(409);
    expect(r.body.error ?? JSON.stringify(r.body)).toMatch(/pausa|Reserva/i);
    expect(m.llamadas()).toHaveLength(0);
    const f = await m.patch(`/api/constructor/sesiones/${s.id}`, {
      modo: 'formulario',
      parche: { nombre: 'Sin IA' },
    });
    expect(f.status).toBe(200);
    expect(f.body.borrador.nombre).toBe('Sin IA');
  });

  it('prueba controlada: exige confirmación, estima consumo y hace UNA llamada sin herramientas', async () => {
    m = await montar({
      escenario: {
        libre_segun_prompt: [
          { contiene: 'PRUEBA', salida: 'Clasificaría la factura y la guardaría con su fuente.' },
        ],
      },
    });
    const s = (await m.post('/api/constructor/sesiones', { modo: 'formulario' })).body;
    await m.patch(`/api/constructor/sesiones/${s.id}`, { parche: BORRADOR_OK });
    const sin = await m.post(`/api/constructor/sesiones/${s.id}/prueba`, {});
    expect(sin.status).toBe(409);
    expect(JSON.stringify(sin.body)).toMatch(/tokens/);
    expect(m.llamadas()).toHaveLength(0);
    const ok = await m.post(`/api/constructor/sesiones/${s.id}/prueba`, { confirmar: true });
    expect(ok.status).toBe(200);
    expect(ok.body.respuesta).toContain('Clasificaría');
    expect(m.llamadas()).toHaveLength(1);
    expect((m.llamadas()[0] as unknown as { herramientas: string | null }).herramientas).toBeNull();
  });

  it('galería como punto de partida y prompt de la Arquitecta editable (versionado)', async () => {
    m = await montar();
    const s = (
      await m.post('/api/constructor/sesiones', { modo: 'formulario', plantilla: 'noticias' })
    ).body;
    expect(s.borrador.nombre).toBe('Noticias del sector');
    expect(s.faltan).toEqual([]);
    expect((await m.post('/api/constructor/sesiones', { plantilla: 'no-existe' })).status).toBe(
      404,
    );
    const p = await m.put('/api/constructor/prompt', {
      texto: 'Prompt nuevo de la Arquitecta. '.repeat(5),
    });
    expect(p.body.version).toBeGreaterThanOrEqual(1);
    expect((await m.get('/api/constructor/prompt')).body.texto).toContain('Prompt nuevo');
  });
});

describe('P10b modo formulario sin motor de IA', () => {
  it('sin runner: el asistente IA responde 409 y el formulario crea un piso válido', async () => {
    const h = harness();
    const s = (await h.owner.post('/api/constructor/sesiones', { modo: 'formulario' })).body;
    expect(s.ia.disponible).toBe(false);
    expect(
      (await h.owner.post(`/api/constructor/sesiones/${s.id}/turno`, { texto: 'hola' })).status,
    ).toBe(409);
    const e = await h.owner.patch(`/api/constructor/sesiones/${s.id}`, {
      parche: BORRADOR_OK,
      fase: 9,
    });
    expect(e.body.faltan).toEqual([]);
    const ok = await h.owner.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true });
    expect(ok.status).toBe(201);
    expect(
      (await h.owner.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true })).status,
    ).toBe(409);
  });

  it('descartar no crea nada', async () => {
    const h = harness();
    const s = (await h.owner.post('/api/constructor/sesiones', { modo: 'formulario' })).body;
    await h.owner.patch(`/api/constructor/sesiones/${s.id}`, { parche: BORRADOR_OK });
    const antes = (await h.owner.get('/api/oficinas')).body.length;
    await h.owner.post(`/api/constructor/sesiones/${s.id}/descartar`);
    expect(
      (await h.owner.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true })).status,
    ).toBe(409);
    expect((await h.owner.get('/api/oficinas')).body.length).toBe(antes);
  });
});
