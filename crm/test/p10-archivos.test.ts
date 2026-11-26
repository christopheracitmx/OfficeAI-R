import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  estaDentro,
  leerTexto,
  moverACuarentena,
  resolverDentro,
  validarCarpetaRaiz,
} from '../src/server/services/archivos-sandbox';
import { harness } from './helpers';

let base: string;
let raiz: string;
let fuera: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'p10-archivos-'));
  raiz = join(base, 'autorizada');
  fuera = join(base, 'secreto');
  mkdirSync(join(raiz, 'sub'), { recursive: true });
  mkdirSync(fuera, { recursive: true });
  writeFileSync(join(raiz, 'a.txt'), 'hola mundo');
  writeFileSync(join(raiz, 'sub', 'b.txt'), 'dentro');
  writeFileSync(join(raiz, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
  writeFileSync(join(raiz, 'grande.txt'), 'x'.repeat(200_000));
  writeFileSync(join(fuera, 'clave.txt'), 'NO DEBE LEERSE');
  // carpeta hermana con prefijo parecido: "autorizada-otra" NO está dentro de "autorizada"
  mkdirSync(join(base, 'autorizada-otra'));
  writeFileSync(join(base, 'autorizada-otra', 'x.txt'), 'x');
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('P10 sandbox de archivos (puro)', () => {
  it('estaDentro compara por segmentos, no por prefijo de texto', () => {
    expect(estaDentro(raiz, join(raiz, 'sub'))).toBe(true);
    expect(estaDentro(raiz, join(base, 'autorizada-otra'))).toBe(false);
    expect(estaDentro(raiz, resolve(raiz, '..'))).toBe(false);
  });

  it('rechaza traversal, rutas relativas, NUL y rutas fuera', () => {
    const r = [raiz];
    expect(() => resolverDentro(r, join(raiz, '..', 'secreto', 'clave.txt'))).toThrow(
      /autorizadas/,
    );
    expect(() => resolverDentro(r, `${raiz}\\..\\secreto\\clave.txt`)).toThrow();
    expect(() => resolverDentro(r, 'a.txt')).toThrow(/absoluta/);
    expect(() => resolverDentro(r, `${raiz}\0/x`)).toThrow();
    expect(() => resolverDentro(r, join(base, 'autorizada-otra', 'x.txt'))).toThrow(/autorizadas/);
    expect(() => resolverDentro(r, join(raiz, 'no-existe.txt'))).toThrow(/No existe/);
    expect(resolverDentro(r, join(raiz, 'a.txt')).real).toContain('a.txt');
  });

  it('un symlink que apunta fuera de la raíz se rechaza', () => {
    const enlace = join(raiz, 'enlace-fuera');
    try {
      symlinkSync(fuera, enlace, 'junction');
    } catch {
      return; // sin permisos para crear enlaces en este sistema: no se puede probar aquí
    }
    expect(() => resolverDentro([raiz], join(enlace, 'clave.txt'))).toThrow(/autorizadas/);
    expect(() => resolverDentro([raiz], enlace)).toThrow(/autorizadas/);
  });

  it('valida carpetas raíz: absoluta, existente, no unidad, no UNC', () => {
    expect(() => validarCarpetaRaiz('relativa/x')).toThrow(/absoluta/);
    expect(() => validarCarpetaRaiz(join(base, 'nada'))).toThrow(/no existe/);
    expect(() => validarCarpetaRaiz(join(raiz, 'a.txt'))).toThrow(/no es una carpeta/);
    expect(() => validarCarpetaRaiz('\\\\servidor\\compartida')).toThrow();
    expect(() => validarCarpetaRaiz(resolve('/'))).toThrow(/raíz de una unidad/);
    expect(() => validarCarpetaRaiz(raiz, [join(raiz, 'sub')])).toThrow(/datos del CRM/);
    expect(validarCarpetaRaiz(raiz)).toBeTruthy();
  });

  it('lee con tope, rechaza binarios y no sigue enlaces', () => {
    const t = leerTexto(join(raiz, 'grande.txt'));
    expect(t.truncado).toBe(true);
    expect(t.contenido.length).toBeLessThanOrEqual(64 * 1024);
    expect(() => leerTexto(join(raiz, 'bin.dat'))).toThrow(/binario/);
    expect(() => leerTexto(join(raiz, 'sub'))).toThrow(/No es un archivo/);
  });

  it('mover = cuarentena dentro de la misma raíz, conserva la ruta relativa y no borra', () => {
    const m = moverACuarentena(raiz, join(raiz, 'sub', 'b.txt'), new Date('2026-01-02T03:04:05Z'));
    expect(m.destino).toContain('_cuarentena');
    expect(estaDentro(raiz, m.destino)).toBe(true);
    expect(existsSync(m.destino)).toBe(true);
    expect(existsSync(join(raiz, 'sub', 'b.txt'))).toBe(false);
    expect(readFileSync(m.destino, 'utf8')).toBe('dentro');
    expect(() => moverACuarentena(raiz, m.destino)).toThrow(/ya está en la cuarentena/);
    expect(() => moverACuarentena(raiz, join(raiz, 'sub'))).toThrow(/Solo se mueven archivos/);
  });
});

async function oficina() {
  const h = harness();
  await h.owner.post('/api/oficinas', { nombre: 'Archivos' });
  return { h, o: h.ownerEn('archivos') };
}
const conOficina = (r: import('supertest').Test) => r.set('x-office-id', 'archivos');

describe('P10 archivos_* (API del dueño y del agente)', () => {
  it('desactivadas por defecto: las herramientas se rechazan y no están en la lista permitida', async () => {
    const { h, o } = await oficina();
    const r = await conOficina(h.agent('Asistente').get('/archivos/listar'));
    expect(r.status).toBe(403);
    const a = await o.get('/api/oficinas/archivos/ajustes');
    expect(a.body.herramientas_efectivas).not.toContain('archivos_listar');
    expect(a.body.archivos_activo).toBe(false);
    // no se puede activar sin carpetas
    expect((await o.put('/api/oficinas/archivos/archivos', { activo: true })).status).toBe(409);
  });

  it('flujo completo: autorizar, activar, listar, leer, mover a cuarentena y revertir', async () => {
    const { h, o } = await oficina();
    const mal = await o.post('/api/oficinas/archivos/archivos/carpetas', { ruta: 'relativa' });
    expect(mal.status).toBe(400);
    const ok = await o.post('/api/oficinas/archivos/archivos/carpetas', { ruta: raiz });
    expect(ok.status).toBe(201);
    expect((await o.put('/api/oficinas/archivos/archivos', { activo: true })).body.activo).toBe(
      true,
    );
    // las herramientas de archivos ahora existen, pero solo si están en la lista de la oficina
    await o.put('/api/oficinas/archivos/ajustes', {
      herramientas: ['kb_buscar', 'archivos_listar', 'archivos_leer', 'archivos_mover_cuarentena'],
    });
    const ag = h.agent('Clasificador');
    const lista = await conOficina(ag.get('/archivos/listar'));
    expect(lista.status).toBe(200);
    expect(lista.body.carpetas[0]).toContain('autorizada');
    const dir = await conOficina(ag.get(`/archivos/listar?ruta=${encodeURIComponent(raiz)}`));
    expect(dir.body.entradas.map((e: { nombre: string }) => e.nombre)).toContain('a.txt');
    const lee = await conOficina(
      ag.get(`/archivos/leer?ruta=${encodeURIComponent(join(raiz, 'a.txt'))}`),
    );
    expect(lee.body.contenido).toBe('hola mundo');
    // intentos de salir de la sandbox
    for (const ruta of [
      join(raiz, '..', 'secreto', 'clave.txt'),
      join(fuera, 'clave.txt'),
      'C:\\Windows\\win.ini',
    ]) {
      const r = await conOficina(ag.get(`/archivos/leer?ruta=${encodeURIComponent(ruta)}`));
      expect([403, 404, 400]).toContain(r.status);
      expect(JSON.stringify(r.body)).not.toContain('NO DEBE LEERSE');
    }
    const mover = await conOficina(
      ag.post('/archivos/mover-cuarentena', {
        ruta: join(raiz, 'a.txt'),
        motivo: 'duplicado de prueba',
      }),
    );
    expect(mover.status).toBe(201);
    expect(existsSync(join(raiz, 'a.txt'))).toBe(false);
    expect(existsSync(mover.body.destino)).toBe(true);
    const estado = await o.get('/api/oficinas/archivos/archivos');
    const entrada = estado.body.log.find(
      (l: { accion: string }) => l.accion === 'mover_cuarentena',
    );
    expect(entrada.detalle).toBe('duplicado de prueba');
    const rev = await o.post(`/api/oficinas/archivos/archivos/log/${entrada.id}/revertir`);
    expect(rev.status).toBe(200);
    expect(readFileSync(join(raiz, 'a.txt'), 'utf8')).toBe('hola mundo');
    // queda en el registro de cambios
    const cambios = h.db
      .prepare("SELECT accion FROM cambios_log WHERE entidad = 'archivos'")
      .all() as {
      accion: string;
    }[];
    expect(cambios.map((c) => c.accion)).toEqual(
      expect.arrayContaining([
        'autorizó una carpeta',
        'movió a cuarentena',
        'revirtió un movimiento',
      ]),
    );
  });

  it('otra oficina no puede usar las carpetas de esta', async () => {
    const { h, o } = await oficina();
    await h.owner.post('/api/oficinas', { nombre: 'Noticias' });
    await o.post('/api/oficinas/archivos/archivos/carpetas', { ruta: raiz });
    await o.put('/api/oficinas/archivos/archivos', { activo: true });
    await h
      .ownerEn('noticias')
      .put('/api/oficinas/noticias/ajustes', { herramientas: ['archivos_listar'] });
    const r = await h.agent('X').get('/archivos/listar').set('x-office-id', 'noticias');
    expect(r.status).toBe(403);
  });
});
