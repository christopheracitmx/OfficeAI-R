import { afterEach, describe, expect, it } from 'vitest';
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

describe('P10b Constructor con CLI simulado', () => {
  it('conversación completa hasta un piso válido, con contexto compacto y sin historial', async () => {
    m = await montar({
      escenario: turnos(
        [
          'TURNO_UNO',
          sal('¿Qué datos entran?', 2, {
            nombre: BORRADOR_OK.nombre,
            objetivo: BORRADOR_OK.objetivo,
            entregable: BORRADOR_OK.entregable,
          }),
        ],
        [
          'TURNO_DOS',
          sal('¿Qué agentes propones? Te sugiero cuatro.', 3, {
            entrada: BORRADOR_OK.entrada,
            salida: BORRADOR_OK.salida,
            almacenamiento: BORRADOR_OK.almacenamiento,
          }),
        ],
        [
          'TURNO_TRES',
          sal(
            'Listo, revisa el borrador.',
            6,
            {
              agentes: BORRADOR_OK.agentes,
              devoluciones_max: 1,
              items_max: 4,
              colecciones: BORRADOR_OK.colecciones,
            },
            true,
          ),
        ],
      ),
    });
    const s = (await m.post('/api/constructor/sesiones', {})).body;
    expect(s.modo).toBe('ia');
    expect(s.mensajes[0].de).toBe('asistente');
    for (const t of [
      'TURNO_UNO quiero clasificar facturas',
      'TURNO_DOS facturas en una carpeta',
      'TURNO_TRES propón el equipo',
    ]) {
      const r = await m.post(`/api/constructor/sesiones/${s.id}/turno`, { texto: t });
      expect(r.status).toBe(200);
    }
    const fin = (await m.get(`/api/constructor/sesiones/${s.id}`)).body;
    expect(fin.turnos).toBe(3);
    expect(fin.faltan).toEqual([]);
    expect(fin.fase).toBe(6);
    // una llamada por turno, sonnet/low, sin herramientas
    const ll = m.llamadas() as unknown as {
      modelo: string;
      esfuerzo: string;
      herramientas: string | null;
      mensaje: string;
      prompt: string;
    }[];
    expect(ll).toHaveLength(3);
    expect(
      ll.every(
        (x) => x.modelo === 'claude-sonnet-5-5' && x.esfuerzo === 'low' && x.herramientas === null,
      ),
    ).toBe(true);
    // contexto compacto: el 3.er turno NO lleva el texto de los turnos anteriores
    expect(ll[2]!.mensaje).not.toContain('TURNO_UNO');
    expect(ll[2]!.mensaje).toContain(BORRADOR_OK.objetivo);
    // candados fijos al final del prompt
    expect(ll[0]!.prompt).toContain('Arquitecta de oficinas');
    expect(
      ll[0]!.prompt
        .trimEnd()
        .endsWith(ll[0]!.prompt.slice(ll[0]!.prompt.indexOf('CANDADOS FIJOS')).trimEnd()),
    ).toBe(true);
    // vista previa válida y creación solo con aprobación
    const vp = (await m.get(`/api/constructor/sesiones/${s.id}/vista-previa`)).body;
    expect(vp.errores).toEqual([]);
    expect(vp.paquete.agentes).toHaveLength(5); // 4 + Coordinador
    const generos = vp.paquete.agentes.map((a: { genero: string }) => a.genero);
    expect(
      Math.abs(
        generos.filter((g: string) => g === 'f').length -
          generos.filter((g: string) => g === 'm').length,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      (await m.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: false })).status,
    ).toBe(409);
    const ok = await m.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true });
    expect(ok.status).toBe(201);
    const id = ok.body.office_id as string;
    expect((await m.get('/api/oficinas')).body.map((o: { id: string }) => o.id)).toContain(id);
    expect(
      m.db.prepare('SELECT COUNT(*) AS n FROM colecciones WHERE office_id = ?').get(id),
    ).toEqual({ n: 1 });
    expect(m.db.prepare('SELECT COUNT(*) AS n FROM agentes WHERE office_id = ?').get(id)).toEqual({
      n: 5,
    });
    expect((await m.get(`/api/constructor/sesiones/${s.id}`)).body.estado).toBe('creada');
    // el prompt de la Arquitecta quedó sembrado y versionado
    expect(
      m.db
        .prepare(
          "SELECT COUNT(*) AS n FROM prompts_agente WHERE office_id = '_edificio' AND activo = 1",
        )
        .get(),
    ).toEqual({ n: 1 });
  });

  it('rechaza campos inválidos del asistente, herramientas fuera del catálogo y borradores incompletos', async () => {
    m = await montar({
      escenario: turnos([
        'MALO',
        sal('Va', 3, {
          agentes: [{ rol: 'X' }],
          campo_raro: 1,
          items_max: 9999,
          nombre: 'Piso Raro',
          objetivo: 'Hacer algo útil',
          entregable: 'Algo',
        }),
      ]),
    });
    const s = (await m.post('/api/constructor/sesiones', {})).body;
    const r = await m.post(`/api/constructor/sesiones/${s.id}/turno`, { texto: 'MALO' });
    expect(r.body.rechazos.length).toBeGreaterThanOrEqual(3);
    expect(r.body.borrador.nombre).toBe('Piso Raro');
    expect(r.body.borrador.agentes).toBeUndefined();
    expect(
      (await m.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true })).status,
    ).toBe(422);
    // herramienta fuera del catálogo => integración «requiere herramienta nueva», nunca herramienta real
    await m.patch(`/api/constructor/sesiones/${s.id}`, {
      parche: {
        agentes: [
          A('Mensajera', { herramientas: ['enviar_whatsapp', 'kb_buscar'] }),
          A('Revisora', { es_qa: true }),
        ],
        devoluciones_max: 1,
      },
    });
    const vp = (await m.get(`/api/constructor/sesiones/${s.id}/vista-previa`)).body;
    expect(vp.errores).toEqual([]);
    expect(
      vp.integraciones.map((i: { nombre: string; estado: string }) => [i.nombre, i.estado]),
    ).toContainEqual(['enviar_whatsapp', 'requiere_herramienta_nueva']);
    expect(vp.paquete.herramientas).not.toContain('enviar_whatsapp');
    const ok = await m.post(`/api/constructor/sesiones/${s.id}/crear`, { aprobado: true });
    expect(ok.status).toBe(201);
    const wf = JSON.stringify(
      m.db.prepare('SELECT workflow_json FROM oficinas WHERE id = ?').get(ok.body.office_id),
    );
    expect(wf).not.toContain('enviar_whatsapp');
  });

  it('respuesta del asistente que no es JSON no rompe la sesión', async () => {
    m = await montar({
      escenario: {
        libre_segun_prompt: [{ contiene: 'HOLA', salida: 'Claro, charlemos sin formato' }],
      },
    });
    const s = (await m.post('/api/constructor/sesiones', {})).body;
    const r = await m.post(`/api/constructor/sesiones/${s.id}/turno`, { texto: 'HOLA' });
    expect(r.status).toBe(200);
    expect(r.body.rechazos).toHaveLength(1);
    expect(r.body.mensajes.at(-1).de).toBe('sistema');
  });
});
