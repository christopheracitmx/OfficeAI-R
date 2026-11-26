import type { OficinaCrearInput } from '../../shared/oficinas';
import { definicionOficina } from '../../shared/oficina3d/definicion';
import { definicionMinima } from '../../shared/oficina3d/minima';
import type { Db } from '../db';
import { nowIso } from '../db';
import { PROMPT_ASISTENTE_VACIO, PROMPT_COMUN_VACIO, workflowVacio } from '../offices/plantillas';
import type { Workflow } from '../runner/workflow';
import { validarWorkflow } from '../runner/workflow';
import { copiarApariencias } from './apariencias-equipo';
import { registrarCambio } from './cambios';
import { KbError } from './kb';
import {
  definicionDe,
  guardarDefinicion,
  idDesdeNombre,
  insertarOficina,
  obtenerOficina,
  oficinaActivaOError,
  pisoDe,
} from './oficinas';
import { GLOBAL, guardarPrompt, promptActivo } from './prompts-db';

/** Workflow de una oficina existente (de archivo o de la BD); lo inyecta el llamador. */
export type LeerWorkflow = (officeId: string) => Workflow | null;

/** Crea un piso nuevo (vacío o duplicado) dentro de UNA transacción. Devuelve el id. */
export function crearOficina(db: Db, i: OficinaCrearInput, leerWf: LeerWorkflow): string {
  const id = i.id ?? idDesdeNombre(db, i.nombre);
  if (obtenerOficina(db, id)) throw new KbError(409, `Ya existe una oficina con id ${id}`);
  db.transaction(() => {
    if (i.plantilla === 'duplicar') duplicar(db, i.origen!, id, i, leerWf);
    else vacia(db, id, i);
    registrarCambio(db, id, 'oficina', id, `creó la oficina (${i.plantilla})`, i.nombre);
  })();
  return id;
}

function vacia(db: Db, id: string, i: OficinaCrearInput): void {
  const wf = workflowVacio(id, i.nombre);
  insertarOficina(db, {
    id,
    nombre: i.nombre,
    descripcion: i.descripcion,
    icono: i.icono,
    plantilla_origen: 'vacia',
    workflow_json: JSON.stringify(wf),
  });
  db.prepare(
    "INSERT INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES (?, 'Asistente', 'Asistente', 'Asistente', 'f', 'Asistente', 'Trabajo')",
  ).run(id);
  guardarPrompt(db, id, GLOBAL, PROMPT_COMUN_VACIO, 'Plantilla vacía');
  guardarPrompt(db, id, 'asistente', PROMPT_ASISTENTE_VACIO, 'Plantilla vacía');
  guardarDefinicion(db, id, definicionMinima({ id, nombre: i.nombre, piso: pisoDe(db, id) ?? 1 }));
}

/** Copia agentes, workflow, prompts activos, habilidades, Biblioteca y lecciones aprobadas. NUNCA datos operativos. */
function duplicar(
  db: Db,
  origen: string,
  id: string,
  i: OficinaCrearInput,
  leerWf: LeerWorkflow,
): void {
  oficinaActivaOError(db, origen);
  const wf = leerWf(origen);
  if (!wf) throw new KbError(409, `La oficina ${origen} no tiene workflow`);
  const copia = validarWorkflow({ ...wf, office_id: id, titulo: i.nombre }, id);
  insertarOficina(db, {
    id,
    nombre: i.nombre,
    descripcion: i.descripcion,
    icono: i.icono,
    plantilla_origen: `duplicado:${origen}`,
    workflow_json: JSON.stringify(copia),
  });
  const t = nowIso();
  db.prepare(
    `INSERT INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area, activo)
     SELECT ?, id, nombre_ui, persona, genero, rol, area, activo FROM agentes WHERE office_id = ?`,
  ).run(id, origen);
  const nombres = db
    .prepare('SELECT DISTINCT prompt FROM prompts_agente WHERE office_id = ? AND activo = 1')
    .all(origen) as { prompt: string }[];
  for (const { prompt } of nombres)
    guardarPrompt(db, id, prompt, promptActivo(db, origen, prompt)!, `Duplicado de ${origen}`);
  const g = promptActivo(db, origen, GLOBAL);
  if (g) guardarPrompt(db, id, GLOBAL, g, `Duplicado de ${origen}`);
  copiarBiblioteca(db, origen, id, t);
  copiarHabilidades(db, origen, id, t);
  copiarLecciones(db, origen, id, t);
  // Planta 3D: misma distribución y personajes, con el id/nombre/piso del nuevo piso.
  const def = definicionDe(db, origen);
  if (def)
    guardarDefinicion(
      db,
      id,
      definicionOficina.parse({
        ...def,
        office: { ...def.office, id, nombre: i.nombre, piso: pisoDe(db, id) ?? 1 },
      }),
    );
  // Apariencias (personajes, salas, oficina y presets propios) viajan con el duplicado.
  copiarApariencias(db, origen, id);
}

function copiarBiblioteca(db: Db, origen: string, id: string, t: string): void {
  const docs = db
    .prepare(
      'SELECT tipo, titulo, contenido_md, tags FROM kb_documentos WHERE office_id = ? AND activo = 1',
    )
    .all(origen) as { tipo: string; titulo: string; contenido_md: string; tags: string }[];
  const insD = db.prepare(
    'INSERT INTO kb_documentos (office_id, tipo, titulo, contenido_md, tags, activo, version, creado_en, actualizado_en) VALUES (?,?,?,?,?,1,1,?,?)',
  );
  const insV = db.prepare(
    "INSERT INTO kb_versiones (documento_id, version, titulo, contenido_md, tags, nota, creado_en) VALUES (?,1,?,?,?,'Duplicado',?)",
  );
  for (const d of docs) {
    const r = insD.run(id, d.tipo, d.titulo, d.contenido_md, d.tags, t, t);
    insV.run(Number(r.lastInsertRowid), d.titulo, d.contenido_md, d.tags, t);
  }
  db.prepare(
    `INSERT INTO kb_productos (office_id, marca, familia, descripcion, casos_uso, giros_ideales, argumentos_valor, advertencias, activo, creado_en, actualizado_en)
     SELECT ?, marca, familia, descripcion, casos_uso, giros_ideales, argumentos_valor, advertencias, 1, ?, ? FROM kb_productos WHERE office_id = ? AND activo = 1`,
  ).run(id, t, t, origen);
}

function copiarHabilidades(db: Db, origen: string, id: string, t: string): void {
  const hs = db
    .prepare(
      'SELECT id, nombre, descripcion, contenido_md, activo, base FROM habilidades WHERE office_id = ?',
    )
    .all(origen) as {
    id: number;
    nombre: string;
    descripcion: string;
    contenido_md: string;
    activo: number;
    base: number;
  }[];
  const insH = db.prepare(
    'INSERT INTO habilidades (office_id, nombre, descripcion, contenido_md, activo, version, base, creado_en, actualizado_en) VALUES (?,?,?,?,?,1,?,?,?)',
  );
  const insV = db.prepare(
    'INSERT INTO habilidades_versiones (habilidad_id, version, nombre, contenido_md, creado_en) VALUES (?,1,?,?,?)',
  );
  const asigna = db.prepare('SELECT agente FROM agente_habilidades WHERE habilidad_id = ?');
  const insA = db.prepare(
    'INSERT INTO agente_habilidades (office_id, agente, habilidad_id) VALUES (?,?,?)',
  );
  for (const h of hs) {
    const nuevo = Number(
      insH.run(id, h.nombre, h.descripcion, h.contenido_md, h.activo, h.base, t, t).lastInsertRowid,
    );
    insV.run(nuevo, h.nombre, h.contenido_md, t);
    for (const a of asigna.all(h.id) as { agente: string }[]) insA.run(id, a.agente, nuevo);
  }
}

function copiarLecciones(db: Db, origen: string, id: string, t: string): void {
  const ls = db
    .prepare(
      "SELECT agente, tipo, texto FROM lecciones WHERE office_id = ? AND estado = 'aprobada'",
    )
    .all(origen) as { agente: string; tipo: string; texto: string }[];
  const ins = db.prepare(
    "INSERT INTO lecciones (office_id, agente, tipo, texto, evidencia, estado, origen, creado_en, version, actualizado_en) VALUES (?,?,?,?,NULL,'aprobada','duplicada',?,1,?)",
  );
  const his = db.prepare(
    "INSERT INTO lecciones_historial (leccion_id, version, texto, estado, accion, nota, creado_en) VALUES (?,1,?,'aprobada','creada','Duplicada',?)",
  );
  for (const l of ls) {
    const n = Number(ins.run(id, l.agente, l.tipo, l.texto, t, t).lastInsertRowid);
    his.run(n, l.texto, t);
  }
}
