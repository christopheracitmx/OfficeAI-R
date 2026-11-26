import { describe, expect, it } from 'vitest';
import { preScore } from '../src/server/fuentes/precalificar';
import { resolverGiro } from '../src/server/services/calidad';
import { expedienteListo, harness } from './helpers';

describe('Giro obligatorio y compuertas de QA', () => {
  it('QA no puede aprobar un expediente sin giro', async () => {
    const h = harness();
    const { prospecto_id, empresa_id } = await expedienteListo(h);
    h.db.prepare('UPDATE empresas SET giro_id = NULL WHERE id = ?').run(empresa_id);
    const r = await h.agent('QA-1').post('/qa', { prospecto_id, etapa: 'qa1', aprobado: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('GIRO');
    // un rechazo sí se puede registrar
    const ok = await h.agent('QA-1').post('/qa', {
      prospecto_id,
      etapa: 'qa1',
      aprobado: false,
      devolver_a: 'Analista',
      motivos: ['falta giro'],
    });
    expect(ok.status).toBe(200);
  });

  it('con score bajo el mínimo: QA-2 no aprueba, finalizar descarta y no se envía correo', async () => {
    const h = harness();
    const { prospecto_id, empresa_id } = await expedienteListo(h);
    await h.agent('Calificador').post('/score', {
      prospecto_id,
      score: 55,
      score_desglose: { ajuste: 10, necesidad: 10, contacto: 15, cercania: 10, capacidad: 10 },
      justificacion: 'Ajuste débil.',
    });
    await h.agent('QA-1').post('/qa', { prospecto_id, etapa: 'qa1', aprobado: true });
    const qa2 = await h.agent('QA-2').post('/qa', { prospecto_id, etapa: 'qa2', aprobado: true });
    expect(qa2.status).toBe(409);
    const fin = await h.agent('QA-2').post('/finalizar', { prospecto_id });
    expect(fin.status).toBe(409);
    expect(h.mailer.enviados).toHaveLength(0);
    const e = h.db.prepare('SELECT etapa FROM empresas WHERE id = ?').get(empresa_id) as {
      etapa: string;
    };
    expect(e.etapa).toBe('descartada');
    const p = h.db.prepare('SELECT estado FROM prospectos WHERE id = ?').get(prospecto_id) as {
      estado: string;
    };
    expect(p.estado).toBe('Descartado');
  });

  it('el nivel A empieza en 80 y B en 60', async () => {
    const h = harness();
    const { prospecto_id } = await expedienteListo(h);
    const n = h.db.prepare('SELECT nivel FROM prospectos WHERE id = ?').get(prospecto_id) as {
      nivel: string;
    };
    expect(n.nivel).toBe('A');
  });

  it('resolverGiro: exacto, por palabras clave y creación de uno nuevo', () => {
    const h = harness();
    const id = (t: string, crear = false) => resolverGiro(h.db, t, crear);
    expect(id('manufactura')).toBe(id('Manufactura'));
    expect(id('Empresa de transporte de carga')).toBe(id('Logística y transporte'));
    expect(id('Giro raro inexistente')).toBeNull();
    const nuevo = id('Centros de datos', true);
    expect(nuevo).not.toBeNull();
    expect(id('centros de datos')).toBe(nuevo);
  });
});

describe('Precalificación por código', () => {
  const base = {
    nombre: 'Aceros del Valle SA de CV',
    scian: '331110',
    personal_est: 101,
    telefono: '5555123456',
    correo: 'ventas@acerosdelvalle.mx',
    sitio_web: 'https://acerosdelvalle.mx',
    estado_mx: 'CDMX',
    municipio_norm: 'azcapotzalco',
    fuente_id: 'denue_local',
  };
  it('empresa grande con contacto completo puntúa alto', () => {
    expect(preScore(base).score).toBeGreaterThanOrEqual(80);
  });
  it('descarta gobierno, giros no objetivo y registros sin ninguna vía de contacto', () => {
    expect(preScore({ ...base, nombre: 'Gobierno del Estado de México' }).descarte).toBe(
      'gobierno',
    );
    expect(preScore({ ...base, scian: '461110' }).descarte).toContain('giro');
    expect(preScore({ ...base, telefono: null, correo: null, sitio_web: null }).descarte).toContain(
      'contacto',
    );
  });
  it('un correo gratuito y una red social valen menos que uno corporativo y un sitio propio', () => {
    const flojo = preScore({ ...base, correo: 'x@gmail.com', sitio_web: 'https://facebook.com/x' });
    expect(flojo.score).toBeLessThan(preScore(base).score);
  });
});
