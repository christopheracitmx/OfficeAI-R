import { describe, expect, it } from 'vitest';
import { denueApi } from '../src/server/fuentes/denue-api';
import { descubrirPorFuentes } from '../src/server/fuentes/descubrir';
import { construirConsulta, osmOverpass, USER_AGENT } from '../src/server/fuentes/osm-overpass';
import { crearCtx } from '../src/server/fuentes/registro';
import { bd, fetchSim, OVERPASS, resp, sinEspera } from './p11-helpers';

describe('P11 adaptadores de API con respuestas simuladas', () => {
  const env = { DENUE_TOKEN: 'tok-secreto-123' };
  const registroApi = {
    Id: '9001',
    Nombre: 'Metal Mecánica SA',
    Razon_social: 'Metal Mecanica SA de CV',
    Clase_actividad: 'Fabricación',
    Estrato: '31 a 50 personas',
    Tipo_vialidad: 'AVENIDA',
    Calle: 'Industria',
    Num_Exterior: '5',
    Colonia: 'Industrial',
    CP: '54030',
    Ubicacion: 'Tlalnepantla de Baz, MÉXICO',
    Telefono: '5555550808',
    Correo_e: 'info@metalmecanica.example',
    Sitio_internet: 'www.metalmecanica.example',
    Latitud: '19.5',
    Longitud: '-99.2',
    CLASE_ACTIVIDAD_ID: '332710',
  };

  it('DENUE API: arma la URL oficial, normaliza y cuenta una solicitud por consulta', async () => {
    const db = bd();
    const f = fetchSim([() => resp([registroApi])]);
    const ctx = crearCtx(db, env, denueApi, { fetchFn: f.fn, esperar: sinEspera().fn });
    const r = await denueApi.buscar({ zona: 'Estado de México', giro: 'Manufactura', max: 1 }, ctx);
    expect(f.llamadas).toHaveLength(3); // sectores 31, 32 y 33
    expect(f.llamadas[0]!.url).toContain('/consulta/BuscarAreaAct/15/0/0/0/0/31/0/0/0/0/1/');
    expect(r[0]).toMatchObject({
      nombre: 'Metal Mecánica SA',
      tamano_est: 31,
      estrato: 4,
      scian: '332710',
      telefono: '5555550808',
      fuente_id: 'denue_api',
      sitio_web: 'https://www.metalmecanica.example/',
    });
    expect(
      db.prepare("SELECT contador FROM fuentes_uso WHERE fuente_id='denue_api'").get(),
    ).toEqual({ contador: 3 });
  });

  it('DENUE API: tope duro por fuente, quota_exceeded y el token nunca aparece en errores', async () => {
    const db = bd();
    db.prepare("UPDATE configuracion SET valor='2' WHERE clave='fuente_tope_denue_api'").run();
    const f = fetchSim([() => resp([registroApi])]);
    const esp = sinEspera();
    const out = await descubrirPorFuentes({
      db,
      env,
      officeId: 'prospeccion',
      zona: 'Estado de México',
      giro: 'Manufactura',
      max: 5,
      fuentes: ['denue_api'],
      fetchFn: f.fn,
      esperar: esp.fn,
    });
    expect(out.cuota_agotada).toBe(true);
    expect(out.fuentes[0]!.estado).toBe('quota_exceeded');
    expect(f.llamadas).toHaveLength(2); // se detuvo antes de gastar la tercera
    expect(
      db.prepare("SELECT contador FROM fuentes_uso WHERE fuente_id='denue_api'").get(),
    ).toEqual({ contador: 2 });

    const mal = fetchSim([
      () => Promise.reject(new Error(`fetch failed https://x/${env.DENUE_TOKEN}`)),
    ]);
    db.prepare("UPDATE configuracion SET valor='50' WHERE clave='fuente_tope_denue_api'").run();
    const o2 = await descubrirPorFuentes({
      db,
      env,
      officeId: 'prospeccion',
      zona: 'CDMX',
      giro: 'Manufactura',
      max: 2,
      fuentes: ['denue_api'],
      fetchFn: mal.fn,
      esperar: esp.fn,
    });
    expect(o2.fuentes[0]!.estado).toBe('error');
    expect(JSON.stringify(o2)).not.toContain('tok-secreto-123');
    expect(mal.llamadas.length).toBe(2); // reintentos acotados
  });

  it('DENUE API: sin token no consulta; respuesta con formato inesperado se rechaza (Zod)', async () => {
    const db = bd();
    const f = fetchSim([() => resp({ no: 'es lista' })]);
    const ctx = crearCtx(db, {}, denueApi, { fetchFn: f.fn });
    await expect(
      denueApi.buscar({ zona: 'CDMX', giro: 'Manufactura', max: 1 }, ctx),
    ).rejects.toThrow(/DENUE_TOKEN/);
    expect(f.llamadas).toHaveLength(0);
    const ctx2 = crearCtx(db, env, denueApi, { fetchFn: f.fn, esperar: sinEspera().fn });
    await expect(
      denueApi.buscar({ zona: 'CDMX', giro: 'Manufactura', max: 1 }, ctx2),
    ).rejects.toThrow(/formato/);
    const p = await denueApi.probar(crearCtx(db, {}, denueApi));
    expect(p.ok).toBe(false);
  });

  it('Overpass: User-Agent genérico, una consulta a la vez, espera 30 s ante 429 y atribución ODbL', async () => {
    const db = bd();
    const esp = sinEspera();
    const f = fetchSim([() => resp({}, 429), () => resp(OVERPASS), () => resp(OVERPASS)], 20);
    const ctx = crearCtx(db, {}, osmOverpass, { fetchFn: f.fn, esperar: esp.fn });
    const [a, b] = await Promise.all([
      osmOverpass.buscar({ zona: 'CDMX', giro: 'Cualquiera', max: 5 }, ctx),
      osmOverpass.buscar({ zona: 'CDMX', giro: 'Cualquiera', max: 5 }, ctx),
    ]);
    expect(f.maxSimultaneas()).toBe(1);
    expect(esp.esperas).toContain(30000);
    const ua = (f.llamadas[0]!.init!.headers as Record<string, string>)['User-Agent']!;
    expect(ua).toBe(USER_AGENT);
    expect(ua).not.toMatch(/@|christopher|acitmx\.com/i);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(a.length);
    expect(a.map((c) => c.nombre)).toEqual(
      expect.arrayContaining(['Aceros del Valle', 'Bodegas Tepotzotlán']),
    );
    expect(a.map((c) => c.nombre).join()).not.toMatch(/Delegaci/); // gobierno
    expect(a[0]!.atribucion).toContain('OpenStreetMap');
    expect(a[0]!.licencia).toContain('ODbL');
    expect(JSON.stringify(a)).not.toMatch(/facebook/i);
    expect(construirConsulta({ zona: 'CDMX', giro: 'Manufactura', max: 5 }, 'CDMX')).toContain(
      'MX-CMX',
    );
  });
});
