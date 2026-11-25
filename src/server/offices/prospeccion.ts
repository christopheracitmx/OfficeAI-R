import type { Db } from '../db';
import type { Gancho, OficinaDef } from '../runner/estado';
import type { Workflow } from '../runner/workflow';
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

export function oficinaProspeccion(workflow: Workflow, o: OpcionesProspeccion): OficinaDef {
  return { workflow, ganchos: { finalizar_prospecto: ganchoFinalizar(o) } };
}
