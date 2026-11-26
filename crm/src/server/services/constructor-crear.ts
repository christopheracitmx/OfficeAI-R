import type { Db } from '../db';
import { registrarCambio } from './cambios';
import { compilarBorrador, estimarPrueba } from './constructor-compilar';
import {
  abierta,
  disponibilidadIa,
  ESFUERZO_CONSTRUCTOR,
  guardar,
  MODELO_CONSTRUCTOR,
  type Sesion,
} from './constructor-sesion';
import { KbError } from './kb';
import { crearOficinaDesdePaquete } from './paquete-crear';
import type { MotorLibre } from './reflexion';

/**
 * Prueba controlada (fase 8): UNA llamada de IA, sin herramientas ni efectos, en la que el primer agente
 * productor responde a una tarea de ejemplo con su prompt real. Requiere confirmación explícita.
 */
export async function pruebaControlada(
  db: Db,
  motor: MotorLibre,
  id: number,
  confirmado: boolean,
): Promise<{ sesion: Sesion; respuesta: string; tokens: number }> {
  const s = abierta(db, id);
  const c = compilarBorrador(db, s.borrador, s.borrador.relajar_candados ?? []);
  if (!c.paquete)
    throw new KbError(422, `El borrador aún no compila: ${c.errores.slice(0, 3).join(' | ')}`);
  const b = s.borrador;
  const items = b.prueba_items ?? 1;
  const estimado = estimarPrueba(1, items);
  if (!confirmado)
    throw new KbError(
      409,
      `Consumo estimado ≈ ${estimado.toLocaleString('es-MX')} tokens. Confirma para ejecutar la prueba.`,
    );
  const disp = disponibilidadIa(db, motor);
  if (!disp.disponible) throw new KbError(409, `Prueba no ejecutada. ${disp.motivo ?? ''}`);
  const agente =
    c.paquete.agentes.find((a) => b.agentes?.find((x) => x.rol === a.rol && !x.es_qa)) ??
    c.paquete.agentes[0]!;
  const promptAgente =
    c.paquete.prompts.agentes[agente.id.toLowerCase().replace(/[^a-z0-9_]+/g, '_')] ?? '';
  const r = await motor.llamar({
    officeId: 'prospeccion',
    agente: 'PruebaPiso',
    prompt: `${c.paquete.prompts.global}\n\n${promptAgente}\n\nEs una PRUEBA sin herramientas: describe en pocas líneas qué harías con ${items} elemento(s) de ejemplo y qué guardarías.`,
    mensaje: `Tarea de ejemplo para la prueba: ${b.entrada || b.objetivo}`,
    modelo: MODELO_CONSTRUCTOR,
    esfuerzo: ESFUERZO_CONSTRUCTOR,
  });
  if (!r.ok)
    throw new KbError(r.limite_plan ? 429 : 502, `La prueba falló: ${r.error ?? 'sin detalle'}`);
  const tokens = r.tokens_ponderados ?? r.tokens ?? 0;
  const g = guardar(db, {
    ...s,
    tokens: s.tokens + tokens,
    mensajes: [
      ...s.mensajes,
      { de: 'sistema', texto: `Prueba (${agente.nombre_ui}): ${r.salida.slice(0, 1500)}`, fase: 8 },
    ],
  });
  return { sesion: g, respuesta: r.salida, tokens };
}

/** Crea el piso (solo con aprobación explícita). Relajar candados exige confirmación y queda en cambios_log. */
export function crearPiso(
  db: Db,
  id: number,
  o: { aprobado: boolean; confirmarRelajar: boolean },
): { sesion: Sesion; office_id: string; advertencias: string[] } {
  const s = abierta(db, id);
  if (!o.aprobado) throw new KbError(409, 'El dueño debe aprobar el borrador para crear el piso');
  const c = compilarBorrador(db, s.borrador, s.borrador.relajar_candados ?? []);
  if (!c.paquete) throw new KbError(422, `No se puede crear: ${c.errores.slice(0, 4).join(' | ')}`);
  const out = crearOficinaDesdePaquete(db, c.paquete, {
    confirmarRelajar: o.confirmarRelajar,
    origen: 'constructor',
  });
  registrarCambio(db, out.id, 'constructor', null, 'creó el piso con el asistente', `sesión ${id}`);
  const g = guardar(db, s, { estado: 'creada', office: out.id });
  return { sesion: g, office_id: out.id, advertencias: [...c.advertencias, ...out.advertencias] };
}

export function descartarSesion(db: Db, id: number): Sesion {
  const s = abierta(db, id);
  return guardar(db, s, { estado: 'descartada' });
}
