import { describe, expect, it } from 'vitest';
import { buscarDataset, metaDataset } from '../src/server/fuentes/dataset';
import { denueApi } from '../src/server/fuentes/denue-api';
import { descubrirPorFuentes } from '../src/server/fuentes/descubrir';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { importarOverture } from '../src/server/fuentes/import-overture';
import { nombreNorm, telefonoNorm, webNorm } from '../src/server/fuentes/normalizar';
import { construirConsulta, osmOverpass, USER_AGENT } from '../src/server/fuentes/osm-overpass';
import { registrarCandidato } from '../src/server/fuentes/registrar';
import { crearCtx, activarFuente } from '../src/server/fuentes/registro';
import { esGobierno, estratoDe, giroDeScian, tamanoDePersonal } from '../src/server/fuentes/scian';
import type { Candidato } from '../src/server/fuentes/tipos';
import { resolverZona } from '../src/server/fuentes/zona-filtro';
import { bd, conDatasets, FX, fetchSim, OVERPASS, resp, sinEspera } from './p11-helpers';

const cand = (o: Partial<Candidato> = {}): Candidato => ({
  nombre: 'Industrias Demo SA de CV',
  direccion: 'Calle 1, Naucalpan de Juárez, C.P. 53370, Estado de México',
  giro: 'Manufactura',
  fuente_id: 'denue_local',
  registro_id: 'x-1',
  licencia: 'L',
  atribucion: 'A',
  ...o,
});

describe('P11 normalización, SCIAN y zona', () => {
  it('normaliza nombres, teléfonos y sitios; una red social no es el sitio de la empresa', () => {
    expect(nombreNorm('Aceros del Valle, S.A. de C.V.')).toBe('aceros del valle');
    expect(nombreNorm('ACEROS  DEL VALLE SA DE CV')).toBe('aceros del valle');
    expect(telefonoNorm('+52 (55) 5555-0101')).toBe('5555550101');
    expect(telefonoNorm('123')).toBeUndefined();
    expect(webNorm('www.acme.example')).toBe('https://www.acme.example/');
    expect(webNorm('https://www.facebook.com/acme')).toBeUndefined();
    expect(webNorm('https://instagram.com/acme')).toBeUndefined();
  });

  it('estrato, giro, tamaño y gobierno', () => {
    expect(estratoDe('11 a 30 personas')).toBe(3);
    expect(estratoDe('251 y más personas')).toBe(7);
    expect(estratoDe('0 a 5 personas')).toBe(1);
    expect(estratoDe('4')).toBe(4);
    expect(giroDeScian('331111')).toBe('Manufactura');
    expect(giroDeScian('5415')).toBe('Tecnología y telecomunicaciones');
    expect(giroDeScian('484110')).toBe('Logística y transporte');
    expect(tamanoDePersonal(51)).toBe('mediana');
    expect(esGobierno('Cualquier cosa', '931210')).toBe(true);
    expect(esGobierno('Ayuntamiento de Toluca', null)).toBe(true);
    expect(esGobierno('Aceros SA', '331111')).toBe(false);
  });

  it('interpreta la zona de la corrida', () => {
    expect(resolverZona('CDMX Norte')).toEqual({
      estados: ['CDMX'],
      municipios: ['Azcapotzalco', 'Gustavo A. Madero'],
    });
    expect(resolverZona('Edomex - Naucalpan de Juárez')).toEqual({
      estados: ['Estado de México'],
      municipios: ['Naucalpan de Juárez'],
    });
    expect(resolverZona('Estado de México').municipios).toEqual([]);
    expect(resolverZona('Cualquiera').estados).toEqual(['CDMX', 'Estado de México']);
  });
});

describe('P11 importadores de datasets (muestras pequeñas)', () => {
  it('DENUE: filtra gobierno, fuera del piloto y micronegocios; guarda versión y atribución', async () => {
    const db = bd();
    const r = await importarDenue(db, [FX('denue-muestra.csv')], {
      version: 'DENUE 2026/05',
      fecha_dataset: '2026-05-29',
    });
    expect(r.leidos).toBe(7);
    expect(r.guardados).toBe(4);
    expect(r.descartados).toEqual({ micronegocio: 1, gobierno: 1, fuera_de_piloto: 1 });
    const m = metaDataset(db, 'denue_local')!;
    expect(m).toMatchObject({
      version: 'DENUE 2026/05',
      fecha_dataset: '2026-05-29',
      registros: 4,
    });
    const f = db
      .prepare("SELECT * FROM dataset_registros WHERE registro_id = '1001'")
      .get() as Record<string, unknown>;
    expect(f).toMatchObject({
      nombre: 'Aceros del Valle',
      scian: '331111',
      giro: 'Manufactura',
      estrato: 5,
      personal_est: 51,
      telefono: '5555550101',
      correo: 'ventas@acerosdelvalle.example',
      estado_mx: 'Estado de México',
      municipio_norm: 'naucalpan de juarez',
    });
    expect(String(f['atribucion'])).toContain('INEGI');
    // un sitio que es una página de Facebook no se guarda como sitio de la empresa
    const clinica = db
      .prepare("SELECT sitio_web FROM dataset_registros WHERE registro_id='1006'")
      .get() as {
      sitio_web: string | null;
    };
    expect(clinica.sitio_web).toBeNull();
    // el índice por nombre/municipio/SCIAN/CP existe
    const idx = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dataset_registros'",
        )
        .all() as {
        name: string;
      }[]
    ).map((x) => x.name);
    expect(idx).toEqual(
      expect.arrayContaining([
        'idx_dataset_nombre',
        'idx_dataset_municipio',
        'idx_dataset_scian',
        'idx_dataset_cp',
      ]),
    );
  });

  it('DENUE: reimportar reemplaza (actualización manual) y registra la nueva versión', async () => {
    const db = bd();
    await importarDenue(db, [FX('denue-muestra.csv')], { version: 'v1' });
    await importarDenue(db, [FX('denue-muestra.csv')], { version: 'v2', estrato_min: 3 });
    expect(metaDataset(db, 'denue_local')).toMatchObject({ version: 'v2', registros: 3 });
  });

  it('Overture: conserva licencia por origen, ignora redes sociales y descarta lo dudoso', async () => {
    const db = bd();
    const r = await importarOverture(db, FX('overture-muestra.geojsonl'), {
      version: '2026-11-18.0',
    });
    expect(r.leidos).toBe(6);
    expect(r.guardados).toBe(2);
    expect(r.descartados).toEqual({
      confianza_baja: 1,
      fuera_de_piloto: 1,
      gobierno: 1,
      json_invalido: 1,
    });
    const a = db
      .prepare("SELECT * FROM dataset_registros WHERE registro_id='ov-1'")
      .get() as Record<string, string>;
    expect(a['licencia']).toBe('CDLA Permissive 2.0');
    expect(a['atribucion']).toContain('Overture');
    expect(a['telefono']).toBe('5555550101');
    expect(JSON.stringify(a)).not.toMatch(/facebook/i);
    const b = db
      .prepare("SELECT licencia FROM dataset_registros WHERE registro_id='ov-2'")
      .get() as {
      licencia: string;
    };
    expect(b.licencia).toBe('Apache 2.0');
  });

  it('consulta local por zona, giro y tamaño: primero lo más grande, sin red ni cuota', async () => {
    const db = bd();
    await conDatasets(db);
    const q = { zona: 'CDMX', giro: 'Cualquiera', max: 10, min_personal: 11 };
    expect(buscarDataset(db, 'denue_local', q).map((c) => c.registro_id)).toEqual(['1002', '1006']);
    const edo = {
      zona: 'Edomex - Naucalpan de Juárez',
      giro: 'Cualquiera',
      max: 10,
      min_personal: 0,
    };
    expect(buscarDataset(db, 'denue_local', edo).map((c) => c.registro_id)).toEqual([
      '1001',
      '1007',
    ]);
    expect(
      buscarDataset(db, 'denue_local', { ...edo, min_personal: 11 }).map((c) => c.registro_id),
    ).toEqual(['1001']);
    expect(
      buscarDataset(db, 'denue_local', { ...edo, giro: 'Manufactura' }).map((c) => c.registro_id),
    ).toEqual(['1001']);
    expect(
      buscarDataset(db, 'denue_local', { ...edo, texto: 'colegio' }).map((c) => c.registro_id),
    ).toEqual(['1007']);
    expect(
      buscarDataset(db, 'overture_local', {
        zona: 'CDMX',
        giro: 'Corporativo y servicios profesionales',
        max: 5,
      }).map((c) => c.registro_id),
    ).toEqual(['ov-2']);
  });
});

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

describe('P11 registro, filtros, dedupe y fusión entre fuentes', () => {
  it('rechaza gobierno, no_contactar, fuera de piloto y micronegocios; crea con fuente por campo', () => {
    const db = bd();
    db.prepare("INSERT INTO no_contactar (tipo, valor) VALUES ('nombre', 'Prohibida')").run();
    const o = { officeId: 'prospeccion', minPersonal: 11 };
    expect(registrarCandidato(db, cand({ scian: '931110' }), o)).toEqual({
      status: 'rechazada',
      motivo: 'gobierno',
    });
    expect(registrarCandidato(db, cand({ nombre: 'Prohibida SA' }), o)).toEqual({
      status: 'rechazada',
      motivo: 'no_contactar',
    });
    expect(
      registrarCandidato(
        db,
        cand({ direccion: 'Calle 2, Guadalajara 44100', estado_mx: undefined }),
        o,
      ),
    ).toEqual({
      status: 'rechazada',
      motivo: 'fuera_de_zona_piloto',
    });
    expect(registrarCandidato(db, cand({ tamano_est: 6 }), o)).toEqual({
      status: 'rechazada',
      motivo: 'micronegocio',
    });
    const ok = registrarCandidato(
      db,
      cand({ tamano_est: 51, estrato: 5, telefono: '5555550101', scian: '331111' }),
      o,
    );
    expect(ok.status).toBe('creada');
    const id = (ok as { id: number }).id;
    const e = db.prepare('SELECT * FROM empresas WHERE id = ?').get(id) as Record<string, unknown>;
    expect(e).toMatchObject({
      metodo_descubrimiento: 'denue_local',
      etapa: 'descubierta',
      zona: 'Edomex - Naucalpan de Juárez',
      personal_est: 51,
      tamano: 'mediana',
      office_id: 'prospeccion',
    });
    expect(JSON.parse(e['campos_fuente'] as string)).toMatchObject({
      telefono: 'denue_local',
      scian: 'denue_local',
    });
    expect(
      db.prepare('SELECT licencia, atribucion FROM empresa_fuentes WHERE empresa_id = ?').get(id),
    ).toEqual({
      licencia: 'L',
      atribucion: 'A',
    });
  });

  it('DENUE + Overture + OSM sobre la misma empresa: una sola fila, datos fusionados con la fuente de cada campo', async () => {
    const db = bd();
    await conDatasets(db);
    const esp = sinEspera();
    activarFuente(db, 'osm_overpass', 'prospeccion', true);
    const f = fetchSim([() => resp(OVERPASS)]);
    const out = await descubrirPorFuentes({
      db,
      env: {},
      officeId: 'prospeccion',
      zona: 'CDMX',
      giro: 'Cualquiera',
      max: 10,
      fetchFn: f.fn,
      esperar: esp.fn,
    });
    const logistica = db
      .prepare("SELECT * FROM empresas WHERE nombre_norm = 'logistica norte'")
      .all() as Record<string, unknown>[];
    expect(logistica).toHaveLength(1);
    const e = logistica[0]!;
    // DENUE puso nombre, tamaño y teléfono; OSM completó correo y sitio
    expect(e['metodo_descubrimiento']).toBe('denue_local');
    expect(e['personal_est']).toBe(251);
    expect(e['correo']).toBe('contacto@logisticanorte.example');
    expect(JSON.parse(e['campos_fuente'] as string)).toMatchObject({
      telefono: 'denue_local',
      correo: 'osm_overpass',
      sitio_web: 'osm_overpass',
    });
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM empresa_fuentes WHERE empresa_id = ?').get(e['id']),
    ).toEqual({ n: 2 });
    const osm = out.fuentes.find((x) => x.fuente_id === 'osm_overpass')!;
    expect(osm.fusionados).toBeGreaterThanOrEqual(1);
    // Aceros del Valle vino de DENUE (Edomex) y OSM no la duplicó
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM empresas WHERE nombre_norm = 'aceros del valle'").get(),
    ).toEqual({ n: 1 });
    // la bitácora por fuente alimenta el panel de Corrida
    expect(db.prepare('SELECT COUNT(*) AS n FROM candidatos_fuente').get()).toEqual({
      n: out.fuentes.filter((x) => x.estado !== 'omitida').length,
    });
  });

  it('si una fuente falla o no tiene datos, sigue con la siguiente y lo registra (sin_datos/error)', async () => {
    const db = bd();
    await conDatasets(db);
    activarFuente(db, 'osm_overpass', 'prospeccion', true);
    const f = fetchSim([() => Promise.reject(new Error('sin red'))]);
    const out = await descubrirPorFuentes({
      db,
      env: {},
      officeId: 'prospeccion',
      zona: 'Edomex - Tepotzotlán',
      giro: 'Cualquiera',
      max: 5,
      fetchFn: f.fn,
      esperar: sinEspera().fn,
    });
    const estados = Object.fromEntries(out.fuentes.map((x) => [x.fuente_id, x.estado]));
    expect(estados['denue_local']).toBe('sin_datos');
    expect(estados['overture_local']).toBe('sin_datos');
    expect(estados['osm_overpass']).toBe('error');
    expect(estados['denue_api']).toBe('omitida'); // sin token
  });

  it('el aislamiento por office_id: el mismo candidato en otra oficina es una empresa distinta', () => {
    const db = bd();
    const c = cand({ tamano_est: 51 });
    const a = registrarCandidato(db, c, { officeId: 'prospeccion', minPersonal: 11 });
    const b = registrarCandidato(db, c, { officeId: 'otra', minPersonal: 11 });
    const a2 = registrarCandidato(db, c, { officeId: 'prospeccion', minPersonal: 11 });
    expect(a.status).toBe('creada');
    expect(b.status).toBe('creada');
    expect(a2.status).toBe('existente');
    expect((a as { id: number }).id).not.toBe((b as { id: number }).id);
    expect(db.prepare("SELECT COUNT(*) AS n FROM empresas WHERE office_id='otra'").get()).toEqual({
      n: 1,
    });
  });

  it('el umbral de personal es configurable (11 o 31) y filtra antes de gastar IA', async () => {
    const db = bd();
    await conDatasets(db);
    const base = {
      db,
      env: {},
      officeId: 'prospeccion',
      zona: 'Edomex - Naucalpan de Juárez',
      giro: 'Cualquiera',
      max: 10,
      fuentes: ['denue_local'],
    };
    db.prepare("UPDATE configuracion SET valor='60' WHERE clave='fuentes_tamano_min'").run();
    const alto = await descubrirPorFuentes(base);
    expect(alto.nuevos).toBe(0);
    db.prepare("UPDATE configuracion SET valor='11' WHERE clave='fuentes_tamano_min'").run();
    const normal = await descubrirPorFuentes(base);
    expect(normal.nuevos).toBe(1);
    expect(normal.fuentes[0]!.empresas[0]!.nombre).toBe('Aceros del Valle');
  });
});
