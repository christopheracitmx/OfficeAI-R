import { FORMATO_PAQUETE, type PaqueteOficina } from '../../shared/paquete';
import { HERRAMIENTAS_GENERICAS } from '../../shared/catalogo';
import type { Db } from '../db';
import { herramientasPermitidas } from '../offices/herramientas';
import { capasGuardadas, capasResueltas } from './apariencias';
import { candadosRelajados } from './candados';
import { listarColecciones } from './colecciones';
import { KbError } from './kb';
import { definicionDe, obtenerOficina } from './oficinas';
import { GLOBAL, promptActivo } from './prompts-db';
import type { LeerWorkflow } from './oficina-crear';

/**
 * Exporta una oficina como paquete: configuración y conocimiento, NUNCA datos operativos (corridas,
 * salidas, registros de colecciones, correos, archivos) ni secretos (llaves, token, rutas).
 */
export function exportarPaquete(db: Db, id: string, leerWf: LeerWorkflow): PaqueteOficina {
  const o = obtenerOficina(db, id);
  if (!o) throw new KbError(404, `Oficina desconocida: ${id}`);
  const wf = leerWf(id);
  if (!wf) throw new KbError(409, 'La oficina no tiene workflow');
  const planta = definicionDe(db, id);
  if (!planta) throw new KbError(409, 'La oficina no tiene planta 3D');
  const agentes = db
    .prepare(
      'SELECT id, nombre_ui, persona, genero, rol, area FROM agentes WHERE office_id = ? AND activo = 1 ORDER BY rowid',
    )
    .all(id) as PaqueteOficina['agentes'];

  const prompts: Record<string, string> = {};
  const nombres = db
    .prepare('SELECT DISTINCT prompt FROM prompts_agente WHERE office_id = ? AND activo = 1')
    .all(id) as { prompt: string }[];
  for (const { prompt } of nombres) {
    const t = promptActivo(db, id, prompt);
    if (t) prompts[prompt] = t;
  }

  const habs = db
    .prepare(
      'SELECT id, nombre, descripcion, contenido_md FROM habilidades WHERE office_id = ? AND activo = 1 ORDER BY id',
    )
    .all(id) as { id: number; nombre: string; descripcion: string; contenido_md: string }[];
  const asig = db.prepare('SELECT agente FROM agente_habilidades WHERE habilidad_id = ?');
  const idsAg = new Set(agentes.map((a) => a.id));

  const kb = db
    .prepare(
      'SELECT tipo, titulo, contenido_md, tags FROM kb_documentos WHERE office_id = ? AND activo = 1 ORDER BY id',
    )
    .all(id) as PaqueteOficina['kb'];

  const guardadas = capasGuardadas(db, id);
  const resueltas = capasResueltas(db, id, guardadas);
  const apariencias = Object.entries(resueltas).flatMap(([k, c]) => {
    const [entidad, ...resto] = k.split(':');
    const entidadId = resto.join(':');
    const overrides = { ...(c?.preset ?? {}), ...(c?.overrides ?? {}) };
    if (Object.keys(overrides).length === 0) return [];
    return [
      {
        entidad: entidad as 'personaje' | 'sala' | 'oficina',
        entidad_id: entidad === 'oficina' ? '*' : entidadId,
        overrides,
      },
    ];
  });

  const permitidas = herramientasPermitidas(db, id);
  const usadas = new Set(Object.values(wf.pasos).flatMap((p) => p.herramientas));
  const herramientas = (permitidas ?? [...usadas]).filter((h) =>
    HERRAMIENTAS_GENERICAS.includes(h),
  );

  return {
    formato: FORMATO_PAQUETE,
    version: 1,
    office: { nombre: o.nombre, descripcion: o.descripcion, icono: o.icono },
    agentes,
    workflow: wf as unknown as Record<string, unknown>,
    prompts: { global: promptActivo(db, id, GLOBAL) ?? '', agentes: prompts },
    habilidades: habs.map((h) => ({
      nombre: h.nombre,
      descripcion: h.descripcion,
      contenido_md: h.contenido_md,
      agentes: (asig.all(h.id) as { agente: string }[])
        .map((a) => a.agente)
        .filter((a) => idsAg.has(a)),
    })),
    kb,
    colecciones: listarColecciones(db, id).map((c) => ({
      nombre: c.nombre,
      descripcion: c.descripcion,
      campos: c.campos,
      clave: c.clave,
    })),
    planta,
    apariencias,
    herramientas,
    candados: { relajados: candadosRelajados(db, id) },
    integraciones: [],
  };
}
