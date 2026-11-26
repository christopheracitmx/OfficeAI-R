import type { PaqueteOficina } from '../../shared/paquete';
import type { Db } from '../db';
import { crearDoc } from './kb';
import { KbError } from './kb';
import { registrarCambio } from './cambios';
import { guardarCapa } from './apariencias';
import { fijarCandados } from './candados';
import { crearColeccion } from './colecciones';
import { asignarHabilidad, crearHabilidad } from './habilidades';
import { guardarDefinicion, idDesdeNombre, insertarOficina, pisoDe } from './oficinas';
import { GLOBAL, guardarPrompt } from './prompts-db';
import { validarPaquete } from './paquete-validar';

export interface OpcionesCrear {
  /** Nombre distinto al del paquete. */
  nombre?: string | undefined;
  /** El dueño aceptó explícitamente relajar los candados que pide el paquete. */
  confirmarRelajar?: boolean | undefined;
  /** De dónde viene (se guarda en `plantilla_origen`). */
  origen: string;
}

/**
 * Crea un piso NUEVO a partir de un paquete validado, en UNA transacción (todo o nada). Nunca pisa una
 * oficina existente. Devuelve el id. Lanza KbError (400/409) si el paquete no es válido.
 */
export function crearOficinaDesdePaquete(
  db: Db,
  crudo: unknown,
  o: OpcionesCrear,
): { id: string; advertencias: string[] } {
  const nombre =
    o.nombre?.trim() || (crudo as { office?: { nombre?: string } })?.office?.nombre || 'Nuevo piso';
  const id = idDesdeNombre(db, nombre);
  const v = validarPaquete(db, crudo, id);
  if (!v.ok || !v.paquete || !v.workflow)
    throw new KbError(400, `Paquete inválido: ${v.errores.slice(0, 5).join(' | ')}`);
  const p: PaqueteOficina = v.paquete;
  if (p.candados.relajados.length > 0 && !o.confirmarRelajar)
    throw new KbError(409, 'El paquete relaja candados: exige confirmación explícita del dueño');
  const nombreFinal = o.nombre?.trim() || p.office.nombre;
  const wf = { ...v.workflow, titulo: nombreFinal };
  db.transaction(() => {
    insertarOficina(db, {
      id,
      nombre: nombreFinal,
      descripcion: p.office.descripcion,
      icono: p.office.icono,
      plantilla_origen: o.origen,
      workflow_json: JSON.stringify(wf),
    });
    const insAg = db.prepare(
      'INSERT INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES (?,?,?,?,?,?,?)',
    );
    for (const a of p.agentes) insAg.run(id, a.id, a.nombre_ui, a.persona, a.genero, a.rol, a.area);
    guardarPrompt(db, id, GLOBAL, p.prompts.global, `Paquete: ${o.origen}`);
    for (const [nombrePrompt, texto] of Object.entries(p.prompts.agentes))
      guardarPrompt(db, id, nombrePrompt, texto, `Paquete: ${o.origen}`);
    for (const h of p.habilidades) {
      const hab = crearHabilidad(db, {
        office_id: id,
        nombre: h.nombre,
        descripcion: h.descripcion,
        contenido_md: h.contenido_md,
      });
      if (h.agentes.length > 0) asignarHabilidad(db, hab.id, h.agentes);
    }
    for (const d of p.kb)
      crearDoc(db, {
        office_id: id,
        tipo: d.tipo,
        titulo: d.titulo,
        contenido_md: d.contenido_md,
        tags: d.tags,
        nota: `Paquete: ${o.origen}`,
      });
    for (const c of p.colecciones) crearColeccion(db, id, c);
    db.prepare('UPDATE oficinas SET herramientas_json = ? WHERE id = ?').run(
      JSON.stringify(p.herramientas),
      id,
    );
    guardarDefinicion(db, id, {
      ...p.planta,
      office: { ...p.planta.office, id, nombre: nombreFinal, piso: pisoDe(db, id) ?? 1 },
    });
    for (const c of p.apariencias)
      guardarCapa(
        db,
        id,
        c.entidad,
        c.entidad === 'oficina' ? id : c.entidad_id,
        { overrides: c.overrides },
        `paquete ${o.origen}`,
      );
    if (p.candados.relajados.length > 0) fijarCandados(db, id, p.candados.relajados, true);
    registrarCambio(db, id, 'oficina', id, `creó la oficina (${o.origen})`, nombreFinal);
  })();
  return { id, advertencias: v.advertencias };
}
