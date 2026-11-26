import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { fetchHtml } from '../src/mcp/extract';
import { diagnosticar } from '../src/server/services/diagnostico';
import { OBSCURA_POR_DEFECTO, rutaObscura } from '../src/shared/obscura';
import { harness } from './helpers';

describe('P12: instalación sin la carpeta tools', () => {
  it('rutaObscura: vacío usa el valor por defecto, relativa se resuelve desde crm y absoluta se respeta', () => {
    const raiz = resolve('/app/crm');
    expect(rutaObscura(raiz, {})).toBe(resolve(raiz, OBSCURA_POR_DEFECTO));
    expect(rutaObscura(raiz, { OBSCURA_BIN: '  ' })).toBe(resolve(raiz, OBSCURA_POR_DEFECTO));
    expect(rutaObscura(raiz, { OBSCURA_BIN: '../otra/obscura.exe' })).toBe(
      resolve('/app/otra/obscura.exe'),
    );
    expect(rutaObscura(raiz, { OBSCURA_BIN: resolve('/x/o.exe') })).toBe(resolve('/x/o.exe'));
  });

  it('fetchHtml avisa en claro si falta el binario de Obscura (no un spawn ENOENT críptico)', async () => {
    await expect(
      fetchHtml('https://ejemplo.test', { bin: join(tmpdir(), 'no-existe-obscura.exe') }),
    ).rejects.toThrow(/Obscura no está instalado.*OBSCURA_BIN/);
  });

  it('diagnóstico: sin Claude, sin Obscura y sin destinatarios devuelve avisos claros', async () => {
    const db = openDb(':memory:');
    const d = await diagnosticar(
      db,
      tmpdir(),
      { OBSCURA_BIN: join(tmpdir(), 'nada.exe') },
      async () => null,
    );
    expect(d.claude.disponible).toBe(false);
    expect(d.claude.aviso).toMatch(/claude/i);
    expect(d.obscura.disponible).toBe(false);
    expect(d.obscura.aviso).toMatch(/OBSCURA_BIN/);
    expect(d.destinatarios).toMatchObject({ activos: 0 });
    expect(d.destinatarios.aviso).toMatch(/Sin destinatarios/);
  });

  it('diagnóstico: con Obscura presente y destinatario activo no hay avisos de esas piezas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'p12-'));
    try {
      const bin = join(dir, 'obscura.exe');
      writeFileSync(bin, 'x');
      const db = openDb(':memory:', { destinatarioInicial: 'a@ejemplo.test' });
      const d = await diagnosticar(
        db,
        dir,
        { OBSCURA_BIN: bin },
        async () => '2.1.0 (Claude Code)',
      );
      expect(d.obscura).toMatchObject({ disponible: true, aviso: null });
      expect(d.destinatarios).toEqual({ activos: 1, aviso: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('/api/estado incluye el diagnóstico y la base sin destinatarios lo advierte', async () => {
    const h = harness();
    h.db.prepare('DELETE FROM destinatarios_internos').run();
    const r = await h.owner.get('/api/estado');
    expect(r.status).toBe(200);
    expect(r.body.diagnostico.destinatarios.aviso).toMatch(/Sin destinatarios/);
    expect(r.body.diagnostico.claude.aviso).toBeNull();
  });
});
