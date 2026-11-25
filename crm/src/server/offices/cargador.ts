import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db';
import { cargarWorkflow, validarWorkflow, type Workflow } from '../runner/workflow';
import { nowIso } from '../db';
import { siguienteOrden } from '../services/oficinas';

/**
 * Workflow de una oficina según la tabla `oficinas`: `archivo:<carpeta>` lee config/offices/<carpeta>/workflow.json;
 * `bd` lo toma de workflow_json (editable en la UI avanzada). Lanza si es inválido.
 */
export function cargarWorkflowOficina(db: Db, dirOficinas: string, id: string): Workflow | null {
  const r = db.prepare('SELECT workflow_ref, workflow_json FROM oficinas WHERE id = ?').get(id) as
    { workflow_ref: string; workflow_json: string | null } | undefined;
  if (!r) return null;
  if (r.workflow_ref.startsWith('archivo:'))
    return cargarWorkflow(dirOficinas, r.workflow_ref.slice('archivo:'.length));
  if (!r.workflow_json) throw new Error(`La oficina ${id} no tiene workflow guardado`);
  return validarWorkflow(JSON.parse(r.workflow_json), id);
}

/** Toda carpeta config/offices/<id>/ con workflow.json que aún no esté en la tabla entra como piso nuevo. */
export function sincronizarOficinasArchivo(db: Db, dirOficinas: string): void {
  if (!existsSync(dirOficinas)) return;
  const ins = db.prepare(
    `INSERT OR IGNORE INTO oficinas (id, nombre, descripcion, icono, orden, estado, workflow_ref, creado_en)
     VALUES (?,?,?,?,?,'activa',?,?)`,
  );
  for (const d of readdirSync(dirOficinas, { withFileTypes: true })) {
    if (!d.isDirectory() || !existsSync(join(dirOficinas, d.name, 'workflow.json'))) continue;
    if (db.prepare('SELECT 1 FROM oficinas WHERE id = ?').get(d.name)) continue;
    let nombre: string = d.name;
    let descripcion = '';
    try {
      const o = JSON.parse(readFileSync(join(dirOficinas, d.name, 'office.json'), 'utf8')) as {
        nombre?: string;
        descripcion?: string;
      };
      nombre = o.nombre ?? nombre;
      descripcion = o.descripcion ?? '';
    } catch {
      /* sin office.json: se usa el id */
    }
    ins.run(
      d.name,
      nombre,
      descripcion,
      'building',
      siguienteOrden(db),
      `archivo:${d.name}`,
      nowIso(),
    );
  }
}
