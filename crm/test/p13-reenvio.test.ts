import { describe, expect, it } from 'vitest';
import { DESTINATARIO_PRUEBA, expedienteListo, harness } from './helpers';

async function finalizado() {
  const h = harness();
  const { prospecto_id } = await expedienteListo(h);
  await h.agent('QA-1').post('/qa', { prospecto_id, etapa: 'qa1', aprobado: true });
  await h.agent('QA-2').post('/qa', { prospecto_id, etapa: 'qa2', aprobado: true });
  await h.agent('QA-2').post('/finalizar', { prospecto_id });
  return { h, prospecto_id };
}

describe('Reenvío manual a destinatarios elegidos', () => {
  it('sin selección envía a quien aún no recibió (incluye destinatarios agregados después)', async () => {
    const { h, prospecto_id } = await finalizado();
    h.db
      .prepare(
        "INSERT INTO destinatarios_internos (email, nombre) VALUES ('nuevo@acitmx.com','Nuevo')",
      )
      .run();
    const r = await h.owner.post(`/api/prospectos/${prospecto_id}/reenviar`);
    expect(r.status).toBe(200);
    expect(r.body.enviados).toBe(1);
    expect(h.mailer.enviados.map((m) => m.to)).toEqual([DESTINATARIO_PRUEBA, 'nuevo@acitmx.com']);
  });

  it('con selección reenvía solo a los elegidos, aunque ya lo hubieran recibido', async () => {
    const { h, prospecto_id } = await finalizado();
    const principal = h.db
      .prepare('SELECT id FROM destinatarios_internos WHERE email = ?')
      .get(DESTINATARIO_PRUEBA) as { id: number };
    h.db.prepare("INSERT INTO destinatarios_internos (email) VALUES ('otro@acitmx.com')").run();
    const r = await h.owner
      .post(`/api/prospectos/${prospecto_id}/reenviar`)
      .send({ destinatario_ids: [principal.id] });
    expect(r.body.resultados).toEqual([
      { destinatario: DESTINATARIO_PRUEBA, estado: 'enviado', error: null },
    ]);
    expect(h.mailer.enviados).toHaveLength(2);
    expect(h.mailer.enviados[1]!.to).toBe(DESTINATARIO_PRUEBA);
  });

  it('un destinatario inactivo o inexistente no recibe nada', async () => {
    const { h, prospecto_id } = await finalizado();
    h.db
      .prepare("INSERT INTO destinatarios_internos (email, activo) VALUES ('baja@acitmx.com', 0)")
      .run();
    const baja = h.db
      .prepare("SELECT id FROM destinatarios_internos WHERE email='baja@acitmx.com'")
      .get() as { id: number };
    const r = await h.owner
      .post(`/api/prospectos/${prospecto_id}/reenviar`)
      .send({ destinatario_ids: [baja.id, 9999] });
    expect(r.body.resultados).toEqual([]);
    expect(h.mailer.enviados).toHaveLength(1);
  });
});
