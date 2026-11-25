import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db';
import { kbDocInput, kbProductoInput } from '../../shared/cerebro';
import type { PromptSource } from '../runner/prompts';
import type { AgenteDef } from '../runner/types';
import type { Workflow } from '../runner/workflow';
import { crearHabilidad, asignarHabilidad, habilidadesParaPrompt } from '../services/habilidades';
import { crearDoc } from '../services/kb';
import { guardarProducto } from '../services/kb-productos';
import { GLOBAL, guardarPrompt, leccionesAprobadas, promptActivo } from '../services/prompts-db';
import { HABILIDADES_BASE } from './habilidades-base';
import { DOCS_SEMILLA, PRODUCTOS_SEMILLA } from './semilla-prospeccion';

/** Prompts desde las tablas (editables en la UI); si falta alguno, cae al archivo semilla. */
export class PromptsBd implements PromptSource {
  constructor(
    private readonly db: Db,
    private readonly respaldo: PromptSource,
  ) {}

  leer(officeId: string, nombre: string): string {
    return promptActivo(this.db, officeId, nombre) ?? this.respaldo.leer(officeId, nombre);
  }

  extras(officeId: string, a: AgenteDef): string[] {
    const quienes = [...new Set([a.id, ...a.roles])];
    const lecciones = quienes.map((q) => leccionesAprobadas(this.db, officeId, q)).filter(Boolean);
    const hab = habilidadesParaPrompt(this.db, officeId, quienes);
    return [...lecciones, ...(hab ? [hab] : [])];
  }
}

const PERSONAS: Record<string, [string, 'f' | 'm', string]> = {
  Cartografo: ['Camila', 'f', 'Descubrimiento'],
  Explorador: ['Mateo', 'm', 'Descubrimiento'],
  Guardian: ['Gabriela', 'f', 'Investigación'],
  Rastreador: ['Rodrigo', 'm', 'Investigación'],
  Analista: ['Ana', 'f', 'Investigación'],
  Estratega: ['Esteban', 'm', 'Estrategia'],
  Armador: ['Alejandra', 'f', 'Estrategia'],
  'QA-1': ['Iván', 'm', 'Calidad'],
  'QA-2': ['Valeria', 'f', 'Calidad'],
  Calificador: ['Carla', 'f', 'Reporte'],
  Redactor: ['Hugo', 'm', 'Reporte'],
};

/** Siembra idempotente de lo que una oficina trae de fábrica: prompts (de archivos), agentes, y para prospección Biblioteca y habilidades. */
export function sembrarOficina(db: Db, dirOficinas: string, wf: Workflow): void {
  const o = wf.office_id;
  const dir = join(dirOficinas, o, 'agents');
  const tiene = (t: string, c: string, v: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${c} = ?`).get(v) as { n: number }).n > 0;
  const tx = db.transaction(() => {
    if (existsSync(dir)) {
      const nombres = readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''));
      for (const n of nombres) {
        const tabla = n === GLOBAL ? 'prompt_global' : 'prompts_agente';
        const hay =
          n === GLOBAL
            ? tiene(tabla, 'office_id', o)
            : (
                db
                  .prepare(
                    'SELECT COUNT(*) AS n FROM prompts_agente WHERE office_id = ? AND prompt = ?',
                  )
                  .get(o, n) as { n: number }
              ).n > 0;
        if (!hay)
          guardarPrompt(
            db,
            o,
            n,
            readFileSync(join(dir, `${n}.md`), 'utf8').trim(),
            'Semilla inicial',
          );
      }
    }
    const roles = new Set<string>(['Coordinador']);
    for (const p of Object.values(wf.pasos)) {
      roles.add(p.agente);
      p.roles.forEach((r) => roles.add(r));
    }
    const ins = db.prepare(
      'INSERT OR IGNORE INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES (?,?,?,?,?,?,?)',
    );
    for (const r of roles) {
      const [persona, genero, area] = PERSONAS[r] ?? [
        r === 'Coordinador' ? 'Michael' : r,
        'm',
        'Dirección',
      ];
      ins.run(o, r, r, persona, genero, r, area);
    }
    if (o === 'prospeccion') sembrarProspeccion(db);
  });
  tx();
}

function sembrarProspeccion(db: Db): void {
  const o = 'prospeccion';
  const hay = (t: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE office_id = ?`).get(o) as { n: number }).n >
    0;
  if (!hay('kb_documentos'))
    for (const d of DOCS_SEMILLA)
      crearDoc(db, kbDocInput.parse({ ...d, office_id: o, nota: 'Semilla inicial' }));
  if (!hay('kb_productos'))
    for (const p of PRODUCTOS_SEMILLA)
      guardarProducto(db, kbProductoInput.parse({ ...p, office_id: o }));
  if (!hay('habilidades'))
    for (const h of HABILIDADES_BASE) {
      const x = crearHabilidad(
        db,
        {
          office_id: o,
          nombre: h.nombre,
          descripcion: h.descripcion,
          contenido_md: h.contenido_md,
        },
        true,
      );
      asignarHabilidad(db, x.id, h.agentes);
    }
}
