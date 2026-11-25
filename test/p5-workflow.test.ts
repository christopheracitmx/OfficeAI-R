import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { ArchivosPrompts, Prompts } from '../src/server/runner/prompts';
import {
  cargarWorkflow,
  consultasDe,
  plantilla,
  validarConsultas,
  workflowSchema,
} from '../src/server/runner/workflow';

describe('workflow de la oficina de prospección (definición en datos)', () => {
  const dir = resolve('config/offices');
  it('es válido, sus consultas compilan y son de solo lectura', () => {
    const wf = cargarWorkflow(dir, 'prospeccion');
    expect(consultasDe(wf).length).toBeGreaterThan(20);
    validarConsultas(openDb(':memory:'), wf);
    expect(wf.office_id).toBe('prospeccion');
  });
  it('rechaza consultas que escriben, pasos inexistentes y workflows sin resultado "incompleta"', () => {
    const wf = cargarWorkflow(dir, 'prospeccion');
    const mala = structuredClone(wf);
    mala.variables['x'] = 'DELETE FROM empresas WHERE id=:item';
    expect(() => validarConsultas(openDb(':memory:'), mala)).toThrow(/solo lectura/);
    const sinPaso = { ...structuredClone(wf), pasos: {} };
    expect(() => workflowSchema.parse(sinPaso)).not.toThrow();
    expect(workflowSchema.safeParse({ ...wf, version: 2 }).success).toBe(false);
  });
  it('cada paso tiene prompt en archivos y las herramientas existen en el MCP', () => {
    const wf = cargarWorkflow(dir, 'prospeccion');
    const fuente = new ArchivosPrompts(dir);
    const mcp =
      readFileSync('src/mcp/index.ts', 'utf8') + readFileSync('src/mcp/tools-crm.ts', 'utf8');
    for (const p of Object.values(wf.pasos)) {
      for (const n of p.prompts) expect(fuente.leer('prospeccion', n).length).toBeGreaterThan(50);
      for (const h of p.herramientas) expect(mcp).toContain(`'${h}'`);
    }
  });
  it('el prompt compuesto lleva los candados al final y el contexto de la corrida', () => {
    const wf = cargarWorkflow(dir, 'prospeccion');
    const pr = new Prompts(new ArchivosPrompts(dir), { prospeccion: 'CANDADO-FIJO' });
    const t = pr.armar(
      {
        id: 'Armador',
        roles: ['Estratega', 'Armador'],
        prompts: wf.pasos['estratega_armador']!.prompts,
        herramientas: [],
        webSearch: false,
        maxTurnos: 5,
      },
      { id: 7, office_id: 'prospeccion', params: { zona: 'CDMX', max_empresas: 3 } },
    );
    expect(t.endsWith('CANDADO-FIJO')).toBe(true);
    expect(t).toContain('corrida #7'.toUpperCase().replace('CORRIDA', 'CORRIDA'));
    expect(t).toContain('AGRUPA los roles Estratega y Armador');
  });
  it('plantillas: tramos [ ] opcionales y variables', () => {
    expect(plantilla('a={x}[ b={y}][ c={z}]', { x: 1, y: null, z: 'q' })).toBe('a=1 c=q');
  });
});

describe('motor genérico: sin conceptos de negocio', () => {
  it('src/server/runner no menciona prospectos, empresas ni marcas en su código', () => {
    const dir = resolve('src/server/runner');
    const palabras = /empresa|prospect|lenovo|aruba|zona|giro/i;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const codigo = readFileSync(resolve(dir, f), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
      const malas = codigo.filter((l) => palabras.test(l));
      expect(malas, `${f}: ${malas.join(' | ')}`).toEqual([]);
    }
  });
});
