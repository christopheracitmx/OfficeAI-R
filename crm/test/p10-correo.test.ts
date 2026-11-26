import { describe, expect, it } from 'vitest';
import { harness } from './helpers';

const crear = async (h: ReturnType<typeof harness>, plantilla: string) => {
  const r = await h.owner.post(`/api/galeria/${plantilla}/crear`, {});
  expect(r.status).toBe(201);
  return r.body.id as string;
};

describe('P10 notificar_interno por correo (outbox + guardia)', () => {
  it('por defecto solo Actividad; con correo activo envía solo a internos activos y deja outbox', async () => {
    const h = harness();
    const id = await crear(h, 'vacia');
    h.db.prepare('UPDATE destinatarios_internos SET activo = 0').run();
    h.db
      .prepare(
        "INSERT INTO destinatarios_internos (email, activo) VALUES ('uno@acitmx.com',1),('dos@acitmx.com',0)",
      )
      .run();
    const ag = () => h.agent('Asistente');
    const aviso = (asunto: string) =>
      ag().post('/notificar', { asunto, texto: 'detalle' }).set('x-office-id', id);
    const a = await aviso('Primero');
    expect(a.status).toBe(201);
    expect(a.body.correo.activo).toBe(false);
    expect(h.mailer.enviados).toHaveLength(0);
    await h.ownerEn(id).put(`/api/oficinas/${id}/ajustes`, { correo_activo: true });
    const b = await aviso('Segundo');
    expect(b.body.correo).toMatchObject({ activo: true, enviados: 1, fallidos: 0 });
    expect(h.mailer.enviados.map((m) => m.to)).toEqual(['uno@acitmx.com']);
    expect(h.mailer.enviados[0]!.subject).toContain('Segundo');
    const filas = h.db.prepare('SELECT destinatario, estado FROM avisos_email').all();
    expect(filas).toEqual([{ destinatario: 'uno@acitmx.com', estado: 'enviado' }]);
    // un fallo del proveedor no pierde el aviso: queda fallido en el outbox y el aviso en Actividad
    h.mailer.fallar = true;
    const c = await aviso('Tercero');
    expect(c.status).toBe(201);
    expect(c.body.correo.fallidos).toBe(1);
    expect(
      h.db.prepare("SELECT COUNT(*) AS n FROM avisos_email WHERE estado = 'fallido'").get(),
    ).toEqual({ n: 1 });
    const act = (await h.ownerEn(id).get('/api/actividad')).body as { accion: string }[];
    expect(act.filter((x) => x.accion.startsWith('aviso interno')).length).toBe(3);
  });

  it('sin destinatarios activos no envía y tope por hora', async () => {
    const h = harness();
    const id = await crear(h, 'vacia');
    await h.ownerEn(id).put(`/api/oficinas/${id}/ajustes`, { correo_activo: true });
    h.db.prepare('UPDATE destinatarios_internos SET activo = 0').run();
    const r = await h
      .agent('A')
      .post('/notificar', { asunto: 'Hola', texto: 'x' })
      .set('x-office-id', id);
    expect(r.body.correo.omitido).toContain('destinatarios');
    h.db.prepare("INSERT INTO destinatarios_internos (email) VALUES ('tope@acitmx.com')").run();
    for (let i = 0; i < 12; i++)
      await h
        .agent('A')
        .post('/notificar', { asunto: `Aviso ${i}`, texto: 'x' })
        .set('x-office-id', id);
    expect(h.mailer.enviados.length).toBeLessThanOrEqual(10);
    const ultimo = await h
      .agent('A')
      .post('/notificar', { asunto: 'Último', texto: 'x' })
      .set('x-office-id', id);
    expect(ultimo.body.correo.omitido).toContain('Tope');
  });
});
