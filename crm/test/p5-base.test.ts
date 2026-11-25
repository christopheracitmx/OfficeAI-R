import { describe, expect, it } from 'vitest';
import { expedienteListo, harness } from './helpers';

describe('P5-2: base para el runner', () => {
  it('las altas de agentes heredan la corrida activa', async () => {
    const h = harness();
    const c = await h.owner.post('/api/corridas', {
      zona: 'CDMX',
      giro: 'Cualquiera',
      max_empresas: 3,
    });
    expect(c.status).toBe(201);
    const e = await h.agent('Explorador').post('/empresas', {
      nombre: 'Textiles del Valle SA',
      metodo_descubrimiento: 'nicho_web',
      origen_url: 'https://dir.example.mx/x',
      origen_nota: 'listado',
    });
    const hz = await h.agent('Rastreador').post('/hallazgos', {
      nombre: 'Proveedora Norte SA',
      origen_url: 'https://dir.example.mx/y',
      origen_nota: 'proveedor visto en sitio',
    });
    const filas = h.db.prepare('SELECT id, corrida_id FROM empresas ORDER BY id').all() as {
      id: number;
      corrida_id: number | null;
    }[];
    expect(filas.map((f) => f.corrida_id)).toEqual([c.body.id, c.body.id]);
    expect(e.status).toBe(201);
    expect(hz.status).toBe(201);
  });

  it('sin corrida activa las altas quedan sin corrida', async () => {
    const h = harness();
    await h.agent('Explorador').post('/empresas', {
      nombre: 'Textiles del Valle SA',
      metodo_descubrimiento: 'nicho_web',
      origen_url: 'https://dir.example.mx/x',
      origen_nota: 'listado',
    });
    const f = h.db.prepare('SELECT corrida_id FROM empresas').get() as {
      corrida_id: number | null;
    };
    expect(f.corrida_id).toBeNull();
  });

  it('crm_expediente devuelve el expediente completo y 404 si no existe', async () => {
    const h = harness();
    const { empresa_id, prospecto_id } = await expedienteListo(h);
    const r = await h.agent('QA-1').get(`/expediente/${empresa_id}`);
    expect(r.status).toBe(200);
    expect(r.body.empresa.nombre).toBe('Manufacturas Ejemplo SA');
    expect(r.body.contactos).toHaveLength(1);
    expect(r.body.prospecto.prospecto_id).toBe(prospecto_id);
    expect(r.body.paquetes).toHaveLength(1);
    expect((await h.agent('QA-1').get('/expediente/9999')).status).toBe(404);
  });

  it('el expediente exige token de agente', async () => {
    const h = harness();
    const r = await h.api.get('/api/agent/expediente/1');
    expect(r.status).toBe(401);
  });
});
