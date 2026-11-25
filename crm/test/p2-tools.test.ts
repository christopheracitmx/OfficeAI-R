import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CrmApi } from '../src/mcp/api';
import {
  construirExtraccion,
  extraerCorreos,
  extraerTelefonos,
  htmlATexto,
} from '../src/mcp/extract';
import { placesSearch, FIELD_MASK } from '../src/mcp/places';
import { obscuraExtract, placesDescubrir } from '../src/mcp/tools-web';
import { createApp } from '../src/server/app';
import { openDb } from '../src/server/db';
import { EventBus } from '../src/server/services/events';
import { FakeMailer, TOKEN, UI } from './helpers';

const HTML = `<html><head><title>Contacto - Manufacturas Ejemplo</title>
<script>var x="spam@sentry.io"</script><style>.a{}</style></head><body>
<nav><a href="/nosotros">Nosotros</a><a href="/contacto">Contacto</a><a href="https://otro.mx/contacto">Externo</a></nav>
<p>Llámanos al (55) 5123 4567 o al +52 55 5987-6543.</p>
<a href="mailto:ventas@manufacturas-ejemplo.mx?subject=Hola">Escríbenos</a>
<a href="tel:+525512345678">Tel</a>
<p>Año 2019 2020 · imagen logo@2x.png · 0000000000 · 1111111111</p>
</body></html>`;

describe('extracción local (sin LLM)', () => {
  it('convierte HTML a texto compacto sin scripts ni estilos', () => {
    const t = htmlATexto(HTML);
    expect(t).toContain('Llámanos');
    expect(t).not.toContain('sentry');
    expect(t).not.toContain('.a{}');
  });
  it('extrae correos (mailto y sueltos) y descarta basura', () => {
    expect(extraerCorreos(HTML)).toEqual(['ventas@manufacturas-ejemplo.mx']);
  });
  it('extrae teléfonos mexicanos normalizados y descarta repetidos', () => {
    const tel = extraerTelefonos(htmlATexto(HTML), HTML);
    expect(extraerTelefonos('id 1742287220 y 9119231969 y 1088410571')).toEqual(['91 1923 1969']);
    expect(tel).toContain('55 5123 4567');
    expect(tel).toContain('55 5987 6543');
    expect(tel).toContain('55 1234 5678');
    expect(tel.some((t) => /0000|1111/.test(t))).toBe(false);
  });
  it('detecta enlaces de contacto internos y excluye externos', () => {
    const e = construirExtraccion('https://manufacturas-ejemplo.mx/', HTML);
    expect(e.enlaces_contacto).toEqual([
      'https://manufacturas-ejemplo.mx/nosotros',
      'https://manufacturas-ejemplo.mx/contacto',
    ]);
    expect(e.titulo).toBe('Contacto - Manufacturas Ejemplo');
  });
});

describe('Places: solo descubrimiento y tope duro', () => {
  it('usa field mask mínimo (sin sitio web, teléfono ni coordenadas)', () => {
    expect(FIELD_MASK).not.toMatch(/website|phone|location|rating/i);
  });
  it('no llama a Google si la cuota se agotó', async () => {
    let llamado = false;
    await expect(
      placesSearch('fábricas', 5, {
        apiKey: 'k',
        consumir: async () => {
          throw new Error('quota_exceeded');
        },
        fetchFn: (async () => {
          llamado = true;
          return new Response('{}');
        }) as typeof fetch,
      }),
    ).rejects.toThrow('quota_exceeded');
    expect(llamado).toBe(false);
  });
});

describe('Herramientas contra el CRM real (servidor en puerto efímero)', () => {
  const db = openDb(':memory:');
  const app = createApp({
    db,
    bus: new EventBus(),
    mailer: new FakeMailer(),
    from: 'info@mail.acitmx.net',
    baseUrl: 'http://127.0.0.1:5174',
    agentToken: TOKEN,
    uiOrigins: [UI],
    env: { NODE_ENV: 'test' },
  });
  let srv: Server;
  let api: CrmApi;
  beforeAll(async () => {
    srv = app.listen(0, '127.0.0.1');
    await new Promise<void>((ok) => srv.once('listening', () => ok()));
    api = new CrmApi(
      `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
      TOKEN,
      'Cartografo',
    );
  });
  afterAll(() => void srv.close());

  const placesFake = (async () =>
    new Response(
      JSON.stringify({
        places: [
          {
            id: 'P1',
            displayName: { text: 'Industrias Norte SA' },
            formattedAddress: 'Av. Industrial 10, Tlalnepantla de Baz, Méx., 54030',
          },
          {
            id: 'P2',
            displayName: { text: 'Aceros Querétaro' },
            formattedAddress: 'Calle 1, Querétaro, Qro., 76000',
          },
          {
            id: 'P3',
            displayName: { text: 'Ayuntamiento de Naucalpan' },
            formattedAddress: 'Naucalpan, Méx., 53000',
          },
        ],
      }),
    )) as unknown as typeof fetch;

  it('places_search registra nuevas, rechaza fuera de piloto/gobierno y cuenta la cuota', async () => {
    const r = await placesDescubrir('fábricas en Tlalnepantla', 10, {
      api,
      obscura: { bin: 'x' },
      placesKey: 'k',
      fetchFn: placesFake,
    });
    expect(r.nuevas).toBe(1);
    expect(r.registradas[0]!.zona).toBe('Edomex - Tlalnepantla de Baz');
    expect(r.rechazadas.map((x) => x.motivo).sort()).toEqual(['fuera_de_zona_piloto', 'gobierno']);
    const uso = db.prepare("SELECT contador FROM places_uso WHERE sku='pro'").get() as {
      contador: number;
    };
    expect(uso.contador).toBe(1);
    const rep = await placesDescubrir('fábricas en Tlalnepantla', 10, {
      api,
      obscura: { bin: 'x' },
      placesKey: 'k',
      fetchFn: placesFake,
    });
    expect(rep.nuevas).toBe(0);
    expect(rep.existentes).toBe(1);
    const dir = (await api.get(
      '/directorio/buscar?metodo=places&consulta=f%C3%A1bricas%20en%20Tlalnepantla',
    )) as { consulta_repetida: boolean };
    expect(dir.consulta_repetida).toBe(true);
  });

  it('obscura_extract: lee, cachea y la segunda vez no vuelve a ejecutar Obscura', async () => {
    let ejecuciones = 0;
    const deps = {
      api,
      placesKey: '',
      obscura: {
        bin: 'fake',
        runner: async () => {
          ejecuciones++;
          return HTML;
        },
      },
    };
    const a = await obscuraExtract('https://manufacturas-ejemplo.mx/contacto', deps);
    const b = await obscuraExtract('https://manufacturas-ejemplo.mx/contacto', deps);
    expect('origen' in a && a.origen).toBe('obscura');
    expect('origen' in b && b.origen).toBe('cache');
    expect(ejecuciones).toBe(1);
    expect('correos' in b && b.correos).toEqual(['ventas@manufacturas-ejemplo.mx']);
  });

  it('obscura_extract: si falla dos veces, sugiere web_search y no se atasca', async () => {
    let n = 0;
    const r = await obscuraExtract('https://caido.example.mx/', {
      api,
      placesKey: '',
      obscura: {
        bin: 'fake',
        runner: async () => {
          n++;
          throw new Error('timeout');
        },
      },
    });
    expect(n).toBe(2);
    expect(r).toMatchObject({ ok: false, siguiente: 'web_search' });
  });
});

describe.skipIf(!process.env['LIVE'])('LIVE: Obscura real contra acitmx.net', () => {
  it('lee la página de contacto con obscura fetch', async () => {
    const { fetchHtml } = await import('../src/mcp/extract');
    const html = await fetchHtml('https://acitmx.net/contacto/', {
      bin: resolve(process.cwd(), '../tools/obscura/obscura.exe'),
    });
    const e = construirExtraccion('https://acitmx.net/contacto/', html);
    console.info(
      JSON.stringify({
        titulo: e.titulo,
        correos: e.correos,
        telefonos: e.telefonos,
        chars: e.texto_compacto.length,
      }),
    );
    expect(e.texto_compacto.length).toBeGreaterThan(100);
  });
});
