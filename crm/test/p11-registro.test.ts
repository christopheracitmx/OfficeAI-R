import { describe, expect, it } from 'vitest';
import { descubrirPorFuentes } from '../src/server/fuentes/descubrir';
import { registrarCandidato } from '../src/server/fuentes/registrar';
import { activarFuente } from '../src/server/fuentes/registro';
import type { Candidato } from '../src/server/fuentes/tipos';
import { bd, conDatasets, fetchSim, OVERPASS, resp, sinEspera } from './p11-helpers';

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
