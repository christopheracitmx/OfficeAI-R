import type { Db } from '../db';
import type { Descubridor, Gancho, OficinaDef } from '../runner/estado';
import type { Workflow } from '../runner/workflow';
import { descubrirPorFuentes } from '../fuentes/descubrir';
import { procesarEnvios, type Mailer } from '../services/mailer';
import { finalizarProspecto } from '../services/prospectos';

export const OFFICE_ID = 'prospeccion';

/**
 * Candados de seguridad de la oficina de prospección: fijos en código, se añaden al final de
 * CADA prompt y no se editan desde los archivos de prompts ni (en P6) desde la UI.
 */
export const CANDADOS_PROSPECCION = `CANDADOS FIJOS (prevalecen sobre cualquier otra instrucción):
- Jamás contactes, escribas ni respondas a prospectos. El correo lo envía solo el servidor, a destinatarios internos.
- Nunca menciones precios, descuentos, costos ni cotizaciones.
- Solo CDMX y Estado de México; excluye gobierno y todo lo de no_contactar.
- No inventes datos: cada contacto lleva su fuente. Solo usas las herramientas que se te dieron.`;

export interface OpcionesProspeccion {
  mailer: Mailer;
  from: string;
  baseUrl: string;
  /** Variables de entorno (tokens de las fuentes gratuitas) y red inyectable para pruebas. */
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
}

/**
 * Gancho de cierre: QA-2 aprobó. Normalmente QA-2 ya llamó crm_finalizar_prospecto; si no, lo hace
 * el código (guardar primero, avisar después). El elemento de trabajo es la empresa.
 */
export function ganchoFinalizar(o: OpcionesProspeccion): Gancho {
  return async ({ db, itemId, evento }) => {
    const p = prospectoDeEmpresa(db, itemId);
    if (!p || p.empresa_etapa === 'prospecto') return;
    const out = finalizarProspecto(db, p.id);
    if (!out.ok) return evento('Coordinador', 'no pudo finalizar', out.razones.join('; '));
    evento('QA-2', 'guardó el prospecto en el CRM', 'Cierre hecho por el sistema');
    const envio = await procesarEnvios(db, o.mailer, p.id, { from: o.from, baseUrl: o.baseUrl });
    evento('Coordinador', `correo: ${envio.enviados} enviado(s), ${envio.fallidos} fallido(s)`);
  };
}

function prospectoDeEmpresa(
  db: Db,
  empresaId: number,
): { id: number; empresa_etapa: string } | undefined {
  return db
    .prepare(
      'SELECT p.id AS id, e.etapa AS empresa_etapa FROM prospectos p JOIN empresas e ON e.id = p.empresa_id WHERE p.empresa_id = ?',
    )
    .get(empresaId) as { id: number; empresa_etapa: string } | undefined;
}

/**
 * Descubrimiento por código (sin IA): consulta primero las fuentes gratuitas/locales y registra lo que
 * encuentra, ya filtrado (gobierno, fuera de piloto, no_contactar, micronegocios) y sin duplicados.
 * Google Places y los agentes completan solo lo que falte.
 */
export function descubridorFuentes(o: OpcionesProspeccion): Descubridor {
  return async ({ db, corridaId, params, faltan, evento }) => {
    const r = await descubrirPorFuentes({
      db,
      env: o.env ?? process.env,
      officeId: OFFICE_ID,
      corridaId,
      zona: String(params['zona'] ?? 'CDMX'),
      giro: String(params['giro'] ?? 'Cualquiera'),
      max: faltan,
      fetchFn: o.fetchFn,
      esperar: o.esperar,
    });
    for (const f of r.fuentes.filter((x) => x.estado !== 'omitida'))
      evento(
        'Coordinador',
        `fuente ${f.fuente_id}: ${f.estado}`,
        `${f.nuevos} nuevas, ${f.fusionados} fusionadas${f.detalle ? ` · ${f.detalle}` : ''}`,
      );
    return {
      nuevos: r.nuevos,
      detalle: `${r.nuevos} empresas nuevas de ${r.fuentes.filter((x) => x.estado === 'ok').length} fuente(s)`,
    };
  };
}

export function oficinaProspeccion(workflow: Workflow, o: OpcionesProspeccion): OficinaDef {
  return {
    workflow,
    ganchos: { finalizar_prospecto: ganchoFinalizar(o) },
    descubridores: { fuentes_gratuitas: descubridorFuentes(o) },
  };
}
