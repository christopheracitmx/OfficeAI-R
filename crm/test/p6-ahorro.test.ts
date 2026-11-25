import { describe, expect, it } from 'vitest';
import type { CrmApi } from '../src/mcp/api';
import { obscuraExtract, type WebDeps } from '../src/mcp/tools-web';
import { openDb } from '../src/server/db';
import { expedienteEmpresa } from '../src/server/services/expediente';
import { parsearEngineYaml } from '../src/server/runner/motor';

const apiCache = {
  get: async () => ({ texto_compacto: 'x'.repeat(9000), emails: '[]', telefonos: '[]' }),
  post: async () => ({}),
} as unknown as CrmApi;

describe('ahorro de plan: lecturas', () => {
  const deps = (): WebDeps => ({
    api: apiCache,
    obscura: { bin: 'no-existe' },
    placesKey: '',
    limites: { paginas: 2, texto: 3500, leidas: 0 },
  });
  it('recorta el texto devuelto y corta al llegar al tope de páginas', async () => {
    const d = deps();
    const a = await obscuraExtract('https://ejemplo.mx/a', d);
    expect('texto_compacto' in a && a.texto_compacto.length).toBe(3500);
    await obscuraExtract('https://ejemplo.mx/b', d);
    const c = await obscuraExtract('https://ejemplo.mx/c', d);
    expect(c).toMatchObject({ ok: false, siguiente: 'terminar' });
    expect('error' in c && c.error).toContain('Tope de 2 páginas');
  });
  it('sin límites configurados no recorta (compatibilidad)', async () => {
    const r = await obscuraExtract('https://ejemplo.mx/a', {
      api: apiCache,
      obscura: { bin: 'x' },
      placesKey: '',
    });
    expect('texto_compacto' in r && r.texto_compacto.length).toBe(9000);
  });
});

describe('ahorro de plan: expediente', () => {
  it('filtra secciones y recorta textos largos', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO empresas (nombre, metodo_descubrimiento, resumen) VALUES ('X','manual',?)",
    ).run('r'.repeat(2000));
    const full = expedienteEmpresa(db, 1)!;
    expect(Object.keys(full)).toContain('contactos');
    expect((full['empresa'] as { resumen: string }).resumen.length).toBeLessThan(760);
    const solo = expedienteEmpresa(db, 1, ['empresa', 'contactos'])!;
    expect(Object.keys(solo).sort()).toEqual(['contactos', 'empresa']);
    expect(expedienteEmpresa(db, 99)).toBeNull();
  });
});

describe('engine.yaml: prompt_modo', () => {
  it('reemplaza por defecto y acepta agregar', () => {
    expect(parsearEngineYaml('engine: claude-code\n').prompt_modo).toBe('reemplazar');
    expect(parsearEngineYaml('prompt_modo: agregar\n').prompt_modo).toBe('agregar');
  });
});
