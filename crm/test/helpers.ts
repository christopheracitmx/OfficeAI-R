import request from 'supertest';
import { createApp } from '../src/server/app';
import { openDb, type Db } from '../src/server/db';
import { EventBus } from '../src/server/services/events';
import type { MailMessage, Mailer } from '../src/server/services/mailer';

export const UI = 'http://ui.test';
export const TOKEN = 'token-de-prueba';

export class FakeMailer implements Mailer {
  enviados: MailMessage[] = [];
  fallar = false;
  async send(msg: MailMessage): Promise<{ id: string }> {
    if (this.fallar) throw new Error('Resend caído (simulado)');
    this.enviados.push(msg);
    return { id: `fake-${this.enviados.length}` };
  }
}

export function harness() {
  const db: Db = openDb(':memory:');
  const mailer = new FakeMailer();
  const bus = new EventBus();
  const app = createApp({
    db,
    bus,
    mailer,
    from: 'info@mail.acitmx.net',
    baseUrl: 'http://127.0.0.1:5174',
    agentToken: TOKEN,
    uiOrigins: [UI],
    env: { NODE_ENV: 'test' },
  });
  const api = request(app);
  const owner = {
    get: (u: string) => api.get(u).set('Origin', UI),
    post: (u: string, b?: object) =>
      api
        .post(u)
        .set('Origin', UI)
        .send(b ?? {}),
    patch: (u: string, b?: object) =>
      api
        .patch(u)
        .set('Origin', UI)
        .send(b ?? {}),
    put: (u: string, b?: object) =>
      api
        .put(u)
        .set('Origin', UI)
        .send(b ?? {}),
    del: (u: string) => api.delete(u).set('Origin', UI),
  };
  const agent = (name = 'Coordinador') => ({
    get: (u: string) =>
      api.get(`/api/agent${u}`).set('x-agent-token', TOKEN).set('x-agent-name', name),
    post: (u: string, b?: object) =>
      api
        .post(`/api/agent${u}`)
        .set('x-agent-token', TOKEN)
        .set('x-agent-name', name)
        .send(b ?? {}),
  });
  return { db, mailer, bus, api, owner, agent };
}

export type H = ReturnType<typeof harness>;

/** Lleva una empresa hasta tener expediente completo (sin QA ni finalizar). */
export async function expedienteListo(h: H, nombre = 'Manufacturas Ejemplo SA') {
  const emp = await h.agent('Explorador').post('/empresas', {
    nombre,
    metodo_descubrimiento: 'nicho_web',
    origen_url: 'https://directorio.example.mx/manufactura',
    origen_nota: 'Listado público de parque industrial',
    direccion: 'Parque Industrial 5, Cuautitlán Izcalli, Méx., 54730',
    sitio_web: 'https://manufacturas-ejemplo.mx',
  });
  const empresa_id = emp.body.id as number;
  await h.agent('Rastreador').post('/contactos', {
    empresa_id,
    tipo: 'correo',
    valor: 'contacto@manufacturas-ejemplo.mx',
    fuente_url: 'https://manufacturas-ejemplo.mx/contacto',
  });
  await h.agent('Analista').post('/ficha', {
    empresa_id,
    tamano: 'mediana',
    sucursales: 2,
    resumen: 'Fabricante de piezas metálicas con planta y oficina administrativa.',
    giro: 'Manufactura',
    sitio_verificado: true,
    necesidades: [{ texto: 'Estaciones de trabajo para ingeniería', tipo: 'inferencia' }],
  });
  const pr = await h.agent('Armador').post('/propuestas', {
    empresa_id,
    productos: [
      {
        marca: 'Lenovo',
        categoria: 'ThinkStation',
        razon: 'Diseño e ingeniería',
        prioridad: 'alta',
      },
    ],
    paquetes: [
      {
        nombre: 'Ingeniería y red',
        componentes: ['ThinkStation', 'Wi-Fi Aruba'],
        argumento: 'Renueva estaciones de planta y cobertura inalámbrica.',
      },
    ],
  });
  const prospecto_id = pr.body.prospecto_id as number;
  await h.agent('Calificador').post('/score', {
    prospecto_id,
    score: 82,
    score_desglose: { ajuste: 25, necesidad: 20, contacto: 15, cercania: 10, capacidad: 12 },
    justificacion: 'Buen ajuste de giro y cercanía a oficina Edomex.',
  });
  await h.agent('Redactor').post('/reporte', {
    prospecto_id,
    reporte_md:
      'Oye jefe, encontré Manufacturas Ejemplo SA en Cuautitlán Izcalli. Podrían necesitar estaciones de trabajo.',
    borrador_correo: 'Hola, vimos que su planta crece. ¿Platicamos sobre sus equipos de cómputo?',
  });
  return { empresa_id, prospecto_id };
}
