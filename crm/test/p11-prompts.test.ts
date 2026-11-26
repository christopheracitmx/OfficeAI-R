import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actualizarPromptsFuentes } from '../src/server/offices/prompts-fuentes';
import { guardarPrompt, promptActivo, versionesPrompt } from '../src/server/services/prompts-db';
import { bd } from './p11-helpers';

const DIR = resolve('config/offices');

describe('P11 prompts sembrados: se actualizan sin romper versiones previas', () => {
  it('semilla sin editar: nueva versión con la semilla actualizada; la anterior se conserva', () => {
    const db = bd();
    guardarPrompt(
      db,
      'prospeccion',
      'cartografo',
      'Prompt viejo del Cartógrafo con places_search.',
      'Semilla inicial',
    );
    actualizarPromptsFuentes(db, DIR);
    const v = versionesPrompt(db, 'prospeccion', 'cartografo');
    expect(v.map((x) => x.version)).toEqual([2, 1]);
    expect(v[0]!.activo).toBe(1);
    expect(v[0]!.texto).toContain('fuente_buscar');
    expect(v[0]!.nota).toContain('P11');
    expect(v[1]!.texto).toBe('Prompt viejo del Cartógrafo con places_search.');
  });

  it('prompt editado por el dueño: se conserva su texto y solo se agrega un párrafo (nueva versión)', () => {
    const db = bd();
    guardarPrompt(
      db,
      'prospeccion',
      'explorador',
      'Texto personalizado por el dueño.',
      'Mi edición',
    );
    actualizarPromptsFuentes(db, DIR);
    const t = promptActivo(db, 'prospeccion', 'explorador')!;
    expect(t.startsWith('Texto personalizado por el dueño.')).toBe(true);
    expect(t).toContain('fuente_buscar');
    expect(t).toContain('directorio_importar_candidatos');
    expect(versionesPrompt(db, 'prospeccion', 'explorador')).toHaveLength(2);
  });

  it('es idempotente y no toca prompts que no existen ni los demás agentes', () => {
    const db = bd();
    guardarPrompt(db, 'prospeccion', 'guardian', 'Guardián original.', 'Semilla inicial');
    actualizarPromptsFuentes(db, DIR);
    actualizarPromptsFuentes(db, DIR);
    expect(promptActivo(db, 'prospeccion', 'guardian')).toBe('Guardián original.');
    expect(versionesPrompt(db, 'prospeccion', 'cartografo')).toHaveLength(0);
    guardarPrompt(db, 'prospeccion', 'cartografo', 'viejo', 'Semilla inicial');
    actualizarPromptsFuentes(db, DIR);
    actualizarPromptsFuentes(db, DIR);
    expect(versionesPrompt(db, 'prospeccion', 'cartografo')).toHaveLength(2);
  });

  it('las semillas de archivo ya mencionan las fuentes y siguen prohibiendo redes sociales', async () => {
    const { readFileSync } = await import('node:fs');
    const cart = readFileSync(resolve('config/offices/prospeccion/agents/cartografo.md'), 'utf8');
    const expl = readFileSync(resolve('config/offices/prospeccion/agents/explorador.md'), 'utf8');
    expect(cart).toContain('fuente_buscar');
    expect(expl).toContain('directorio_importar_candidatos');
    expect(expl).toMatch(/redes sociales/);
    expect(expl).toMatch(/Facebook\/Instagram/);
  });
});
