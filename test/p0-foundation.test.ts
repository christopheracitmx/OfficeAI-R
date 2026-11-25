import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { derivarZona, enZonaPiloto } from '../src/server/services/zona';
import { mencionaPrecio, nivelPorScore, puedeCambiarEstado } from '../src/shared/domain';
import { contactoInput, propuestasInput } from '../src/shared/schemas';

describe('DB: migraciones y semillas', () => {
  it('aplica la migración 001 y siembra config, giros y destinatario', () => {
    const db = openDb(':memory:');
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ['empresas', 'prospectos', 'destinatarios_internos', 'envios_email', 'paginas_cache'])
      expect(tablas).toContain(t);
    const dest = db.prepare('SELECT email FROM destinatarios_internos').all() as { email: string }[];
    expect(dest.map((d) => d.email)).toEqual(['christopher.rodriguez@acitmx.com']);
    const zonas = db.prepare("SELECT valor FROM configuracion WHERE clave='zonas_piloto'").get() as {
      valor: string;
    };
    expect(JSON.parse(zonas.valor)).toEqual(['CDMX', 'Estado de México']);
  });

  it('las semillas son idempotentes y no pisan cambios del dueño', () => {
    const db = openDb(':memory:');
    db.prepare("UPDATE configuracion SET valor='7' WHERE clave='max_empresas_por_corrida'").run();
    db.prepare('DELETE FROM destinatarios_internos').run();
    db.prepare("INSERT INTO destinatarios_internos (email) VALUES ('otro@acitmx.com')").run();
    // reabrir lógica de semillas
    return import('../src/server/db/seed').then(({ seed }) => {
      seed(db);
      const v = db.prepare("SELECT valor FROM configuracion WHERE clave='max_empresas_por_corrida'").get() as {
        valor: string;
      };
      expect(v.valor).toBe('7');
      expect(db.prepare('SELECT COUNT(*) n FROM destinatarios_internos').get()).toEqual({ n: 1 });
    });
  });

  it('exige fuente_url en contactos y respeta claves foráneas', () => {
    const db = openDb(':memory:');
    expect(() =>
      db.prepare("INSERT INTO contactos (empresa_id,tipo,valor,fuente_url) VALUES (999,'correo','a@b.mx','https://x.mx')").run(),
    ).toThrow();
  });
});

describe('Zona: derivación desde la dirección', () => {
  it('CDMX: alcaldía y zona', () => {
    const z = derivarZona('Av. Insurgentes Sur 1234, Col. Del Valle, Benito Juárez, 03100 Ciudad de México, CDMX');
    expect(z.estado_mx).toBe('CDMX');
    expect(z.municipio).toBe('Benito Juárez');
    expect(z.zona).toBe('CDMX Centro');
    expect(z.codigo_postal).toBe('03100');
  });
  it('Edomex: prefiere el alias más largo (Cuautitlán Izcalli)', () => {
    const z = derivarZona('Parque Industrial, Cuautitlán Izcalli, Méx., 54730');
    expect(z.estado_mx).toBe('Estado de México');
    expect(z.municipio).toBe('Cuautitlán Izcalli');
    expect(z.zona).toBe('Edomex - Cuautitlán Izcalli');
  });
  it('detecta Edomex por código postal aunque falte el estado', () => {
    const z = derivarZona('Calle 5 s/n, Naucalpan, 53370');
    expect(z.estado_mx).toBe('Estado de México');
    expect(z.municipio).toBe('Naucalpan de Juárez');
  });
  it('fuera del piloto: Querétaro no se clasifica', () => {
    const z = derivarZona('Av. Universidad 100, Querétaro, Qro., 76000');
    expect(z.estado_mx).toBeNull();
    expect(enZonaPiloto(z.estado_mx, ['CDMX', 'Estado de México'])).toBe(false);
  });
  it('dirección vacía no rompe', () => {
    expect(derivarZona(undefined).zona).toBeNull();
  });
});

describe('Dominio: permisos, niveles y precios', () => {
  it('un agente no puede poner estados del dueño', () => {
    for (const e of ['Canalizado', 'En contacto', 'Propuesta', 'Ganado', 'Perdido', 'Descartado'] as const)
      expect(puedeCambiarEstado('agent', e)).toBe(false);
    expect(puedeCambiarEstado('agent', 'Reportado')).toBe(true);
    expect(puedeCambiarEstado('owner', 'Ganado')).toBe(true);
  });
  it('niveles por score', () => {
    expect(nivelPorScore(75)).toBe('A');
    expect(nivelPorScore(74)).toBe('B');
    expect(nivelPorScore(50)).toBe('B');
    expect(nivelPorScore(49)).toBe('C');
  });
  it('detecta precios y costos', () => {
    expect(mencionaPrecio('Cuesta $12,000 por equipo')).toBe(true);
    expect(mencionaPrecio('Tiene un descuento del 10%')).toBe(true);
    expect(mencionaPrecio('Precio especial')).toBe(true);
    expect(mencionaPrecio('Renovación de estaciones de trabajo para planta')).toBe(false);
  });
});

describe('Schemas', () => {
  it('contacto sin fuente_url se rechaza', () => {
    expect(contactoInput.safeParse({ empresa_id: 1, tipo: 'correo', valor: 'a@b.mx' }).success).toBe(false);
    expect(
      contactoInput.safeParse({ empresa_id: 1, tipo: 'correo', valor: 'a@b.mx', fuente_url: 'https://b.mx/contacto' })
        .success,
    ).toBe(true);
  });
  it('propuestas con precio en un paquete se rechazan', () => {
    const base = {
      empresa_id: 1,
      productos: [],
      paquetes: [{ nombre: 'Paquete A', componentes: ['ThinkPad'], argumento: 'Excelente precio de $5000' }],
    };
    expect(propuestasInput.safeParse(base).success).toBe(false);
    base.paquetes[0]!.argumento = 'Renovación de equipos de cómputo para planta';
    expect(propuestasInput.safeParse(base).success).toBe(true);
  });
});
