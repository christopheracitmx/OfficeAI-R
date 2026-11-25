import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { diffLineas, estimarTokens } from '../src/web/lib/diff';
import { Markdown } from '../src/web/lib/markdown';

describe('diff de prompts', () => {
  it('marca líneas agregadas y quitadas', () => {
    const d = diffLineas('a\nb\nc', 'a\nx\nc\nd');
    expect(d.filter((l) => l.tipo === 'quitada').map((l) => l.texto)).toEqual(['b']);
    expect(d.filter((l) => l.tipo === 'agregada').map((l) => l.texto)).toEqual(['x', 'd']);
    expect(d.filter((l) => l.tipo === 'igual')).toHaveLength(2);
    expect(diffLineas('igual', 'igual').every((l) => l.tipo === 'igual')).toBe(true);
  });
  it('estima tokens de forma monótona', () => {
    expect(estimarTokens('a'.repeat(360))).toBe(100);
    expect(estimarTokens('')).toBe(0);
  });
});

describe('Markdown seguro', () => {
  const html = (t: string) => renderToStaticMarkup(createElement(Markdown, { texto: t }));
  it('renderiza títulos, listas, negritas y código', () => {
    const h = html('# Título\n\n- uno\n- **dos**\n\n1. a\n2. b\n\nTexto `code` y *cursiva*');
    expect(h).toContain('Título');
    expect(h).toContain('<ul');
    expect(h).toContain('<strong>dos</strong>');
    expect(h).toContain('<ol');
    expect(h).toContain('<code');
    expect(h).toContain('<em>cursiva</em>');
  });
  it('no inyecta HTML ni crea enlaces activos', () => {
    const h = html(
      '<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>',
    );
    expect(h).not.toContain('<script');
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<a ');
    expect(h).toContain('&lt;script&gt;');
  });
});
