import { describe, expect, it } from 'vitest';
import { expedienteListo, harness } from './helpers';

describe('Seguridad de acceso', () => {
  it('rutas del dueño rechazan mutaciones sin Origin de la UI', async () => {
    const h = harness();
    expect((await h.api.post('/api/corridas').send({})).status).toBe(403);
    expect((await h.api.get('/api/dashboard')).status).toBe(200);
  });
  it('rutas de agentes exigen token', async () => {
    const h = harness();
    expect((await h.api.get('/api/agent/corrida')).status).toBe(401);
    expect((await h.agent().get('/corrida')).status).toBe(200);
  });
});

describe('Flujo completo del expediente', () => {
  it('no finaliza sin QA-1 y QA-2; con ambas guarda y envía a la allowlist', async () => {
    const h = harness();
    const { prospecto_id, empresa_id } = await expedienteListo(h);

    const sinQa = await h.agent('QA-2').post('/finalizar', { prospecto_id });
    expect(sinQa.status).toBe(409);
    expect(sinQa.body.error).toContain('QA-1');

    await h.agent('QA-1').post('/qa', { prospecto_id, etapa: 'qa1', aprobado: true });
    await h.agent('QA-2').post('/qa', { prospecto_id, etapa: 'qa2', aprobado: true });
    const ok = await h.agent('QA-2').post('/finalizar', { prospecto_id });
    expect(ok.status).toBe(200);
    expect(ok.body.enviados).toBe(1);

    expect(h.mailer.enviados).toHaveLength(1);
    expect(h.mailer.enviados[0]!.to).toBe('christopher.rodriguez@acitmx.com');
    expect(h.mailer.enviados[0]!.from).toBe('info@mail.acitmx.net');

    const det = (await h.owner.get(`/api/prospectos/${prospecto_id}`)).body;
    expect(det.estado).toBe('Reportado');
    expect(det.nivel).toBe('A');
    expect(det.zona).toBe('Edomex - Cuautitlán Izcalli');
    expect(det.contactos[0].fuente_url).toContain('/contacto');
    expect(det.envios[0].estado).toBe('enviado');
    const emp = h.db.prepare('SELECT etapa FROM empresas WHERE id=?').get(empresa_id) as {
      etapa: string;
    };
    expect(emp.etapa).toBe('prospecto');
  });

  it('si Resend falla el prospecto queda guardado y se puede reenviar', async () => {
    const h = harness();
    const { prospecto_id } = await expedienteListo(h);
    await h.agent('QA-1').post('/qa', { prospecto_id, etapa: 'qa1', aprobado: true });
    await h.agent('QA-2').post('/qa', { prospecto_id, etapa: 'qa2', aprobado: true });
    h.mailer.fallar = true;
    const r = await h.agent('QA-2').post('/finalizar', { prospecto_id });
    expect(r.status).toBe(200);
    expect(r.body.fallidos).toBe(1);

    const lista = (await h.owner.get('/api/prospectos')).body as {
      correo_estado: string;
      estado: string;
    }[];
    expect(lista[0]!.estado).toBe('Reportado');
    expect(lista[0]!.correo_estado).toBe('fallido');
    expect(
      ((await h.owner.get('/api/dashboard')).body as { correos_fallidos: number }).correos_fallidos,
    ).toBe(1);

    h.mailer.fallar = false;
    const re = await h.owner.post(`/api/prospectos/${prospecto_id}/reenviar`);
    expect(re.body.enviados).toBe(1);
    expect(h.mailer.enviados).toHaveLength(1);
  });

  it('GUARDIA: nunca envía a un correo fuera de la allowlist', async () => {
    const h = harness();
    const { prospecto_id } = await expedienteListo(h);
    await h.agent('QA-1').post('/qa', { prospecto_id, etapa: 'qa1', aprobado: true });
    await h.agent('QA-2').post('/qa', { prospecto_id, etapa: 'qa2', aprobado: true });
    // Alguien intenta colar un destinatario externo directo en la cola:
    h.db
      .prepare(
        "INSERT INTO envios_email (prospecto_id, destinatario) VALUES (?, 'cliente@externo.mx')",
      )
      .run(prospecto_id);
    await h.agent('QA-2').post('/finalizar', { prospecto_id });
    const destinos = h.mailer.enviados.map((m) => m.to);
    expect(destinos).not.toContain('cliente@externo.mx');
    const fila = h.db
      .prepare("SELECT estado, error FROM envios_email WHERE destinatario='cliente@externo.mx'")
      .get() as { estado: string; error: string };
    expect(fila.estado).toBe('fallido');
    expect(fila.error).toContain('no permitido');
  });

  it('tres devoluciones de QA pasan el prospecto a Revisión humana', async () => {
    const h = harness();
    const { prospecto_id } = await expedienteListo(h);
    for (let i = 0; i < 2; i++) {
      const r = await h.agent('QA-1').post('/qa', {
        prospecto_id,
        etapa: 'qa1',
        aprobado: false,
        devolver_a: 'Rastreador',
        motivos: ['Sitio no coincide'],
      });
      expect(r.body.siguiente).toBe('devolver');
    }
    const ultima = await h
      .agent('QA-1')
      .post('/qa', { prospecto_id, etapa: 'qa1', aprobado: false, devolver_a: 'Rastreador' });
    expect(ultima.body.siguiente).toBe('revision_humana');
    const det = (await h.owner.get(`/api/prospectos/${prospecto_id}`)).body;
    expect(det.estado).toBe('Revision humana');
    const fin = await h.agent('QA-2').post('/finalizar', { prospecto_id });
    expect(fin.status).toBe(409);
  });
});

describe('Reglas de negocio', () => {
  it('rechaza precios en paquetes (400)', async () => {
    const h = harness();
    const { empresa_id } = await expedienteListo(h);
    const r = await h.agent('Armador').post('/propuestas', {
      empresa_id,
      productos: [],
      paquetes: [{ nombre: 'P', componentes: ['ThinkPad'], argumento: 'Con descuento especial' }],
    });
    expect(r.status).toBe(400);
  });

  it('contacto sin fuente se rechaza', async () => {
    const h = harness();
    const { empresa_id } = await expedienteListo(h);
    const r = await h
      .agent('Rastreador')
      .post('/contactos', { empresa_id, tipo: 'telefono', valor: '5555551234' });
    expect(r.status).toBe(400);
  });

  it('rechaza gobierno, fuera de piloto y no_contactar; deduplica', async () => {
    const h = harness();
    const base = { metodo_descubrimiento: 'places', origen_url: 'https://maps.example/x' };
    const gob = await h
      .agent('Cartografo')
      .post('/empresas', { ...base, nombre: 'Gobierno del Municipio de Toluca' });
    expect(gob.body).toEqual({ status: 'rechazada', motivo: 'gobierno' });
    const fuera = await h.agent('Cartografo').post('/empresas', {
      ...base,
      nombre: 'Industrias Bajío SA',
      direccion: 'Av. Universidad 100, Querétaro, Qro., 76000',
    });
    expect(fuera.body.motivo).toBe('fuera_de_zona_piloto');
    await h.owner.post('/api/config/no-contactar', {
      tipo: 'dominio',
      valor: 'bloqueada.mx',
      motivo: 'pidió no ser contactada',
    });
    const nc = await h.agent('Cartografo').post('/empresas', {
      ...base,
      nombre: 'Empresa Bloqueada',
      sitio_web: 'https://www.bloqueada.mx',
    });
    expect(nc.body.motivo).toBe('no_contactar');
    const a = await h.agent('Cartografo').post('/empresas', {
      ...base,
      nombre: 'Logística Norte SA',
      sitio_web: 'https://logistica-norte.mx',
      place_id: 'p1',
    });
    const b = await h.agent('Explorador').post('/empresas', {
      ...base,
      nombre: 'Logistica Norte',
      sitio_web: 'https://www.logistica-norte.mx',
    });
    expect(a.body.status).toBe('creada');
    expect(b.body.status).toBe('existente');
    expect(b.body.id).toBe(a.body.id);
  });

  it('el hallazgo oportunista queda registrado con su origen', async () => {
    const h = harness();
    const r = await h.agent('Rastreador').post('/hallazgos', {
      nombre: 'Aceros del Valle SA',
      origen_url: 'https://otraempresa.mx/proveedores',
      origen_nota: 'Aparece como proveedor de la empresa investigada',
    });
    expect(r.status).toBe(201);
    const fila = h.db
      .prepare('SELECT metodo_descubrimiento m, origen_nota n FROM empresas WHERE id=?')
      .get(r.body.id) as { m: string; n: string };
    expect(fila.m).toBe('hallazgo_oportunista');
    expect(fila.n).toContain('proveedor');
  });

  it('un agente no puede poner estados del dueño; el dueño sí', async () => {
    const h = harness();
    const { prospecto_id } = await expedienteListo(h);
    const { patchProspecto } = await import('../src/server/services/consultas');
    expect(patchProspecto(h.db, prospecto_id, 'agent', { estado: 'Ganado' })).toMatchObject({
      ok: false,
      status: 403,
    });
    const own = await h.owner.patch(`/api/prospectos/${prospecto_id}`, {
      estado: 'Canalizado',
      canalizado_a: 'Ana (Querétaro)',
    });
    expect(own.status).toBe(200);
    expect(
      (await h.owner.patch(`/api/prospectos/${prospecto_id}`, { estado: 'Perdido' })).status,
    ).toBe(400);
  });
});

describe('Configuración, cuota y corridas', () => {
  it('CRUD de destinatarios y correo de prueba solo a destinatarios válidos', async () => {
    const h = harness();
    const nuevo = await h.owner.post('/api/config/destinatarios', {
      email: 'Jefe@ACITMX.com',
      nombre: 'Jefe',
    });
    expect(nuevo.status).toBe(201);
    expect(
      (await h.owner.post('/api/config/destinatarios', { email: 'jefe@acitmx.com' })).status,
    ).toBe(409);
    expect((await h.owner.post(`/api/config/destinatarios/${nuevo.body.id}/prueba`)).status).toBe(
      200,
    );
    expect(h.mailer.enviados[0]!.to).toBe('jefe@acitmx.com');
    const off = await h.owner.patch(`/api/config/destinatarios/${nuevo.body.id}`, {
      activo: false,
    });
    expect(off.body.sin_activos).toBe(false);
    expect((await h.owner.post(`/api/config/destinatarios/${nuevo.body.id}/prueba`)).status).toBe(
      502,
    );
    const del = await h.owner.del(`/api/config/destinatarios/1`);
    expect(del.body.sin_activos).toBe(true);
  });

  it('tope duro de Places: la solicitud que lo excede responde 429', async () => {
    const h = harness();
    h.db.prepare("UPDATE configuracion SET valor='2' WHERE clave='places_tope_pro'").run();
    expect((await h.agent('Cartografo').post('/places/consumir', { n: 1 })).status).toBe(200);
    expect((await h.agent('Cartografo').post('/places/consumir', { n: 1 })).status).toBe(200);
    const r = await h.agent('Cartografo').post('/places/consumir', { n: 1 });
    expect(r.status).toBe(429);
    expect(
      ((await h.owner.get('/api/estado')).body as { places: { usado: number } }).places.usado,
    ).toBe(2);
  });

  it('corridas: solo zonas piloto y una a la vez', async () => {
    const h = harness();
    expect(
      (
        await h.owner.post('/api/corridas', {
          zona: 'Querétaro',
          giro: 'Manufactura',
          confirmado: true,
        })
      ).status,
    ).toBe(409);
    const ok = await h.owner.post('/api/corridas', {
      zona: 'CDMX',
      giro: 'Manufactura',
      max_empresas: 10,
      confirmado: true,
    });
    expect(ok.status).toBe(201);
    expect(
      (await h.owner.post('/api/corridas', { zona: 'CDMX', giro: 'Logística', confirmado: true }))
        .status,
    ).toBe(409);
    expect((await h.owner.post(`/api/corridas/${ok.body.id}/detener`)).status).toBe(200);
    expect(
      (
        await h.owner.post('/api/corridas', {
          zona: 'Estado de México',
          giro: 'Logística',
          confirmado: true,
        })
      ).status,
    ).toBe(201);
  });

  it('las acciones de agentes se registran en la bitácora y se emiten en vivo', async () => {
    const h = harness();
    const recibidos: string[] = [];
    h.bus.on('actividad', (e: { accion: string }) => recibidos.push(e.accion));
    await expedienteListo(h);
    const act = (await h.owner.get('/api/actividad')).body as { agente: string }[];
    expect(act.length).toBeGreaterThan(4);
    expect(act.some((a) => a.agente === 'Rastreador')).toBe(true);
    expect(recibidos).toContain('registró empresa');
  });
});
