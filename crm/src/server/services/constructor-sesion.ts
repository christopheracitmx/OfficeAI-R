import { z } from 'zod';
import { CATALOGO, HERRAMIENTAS_GENERICAS } from '../../shared/catalogo';
import {
  aplicarParche,
  borradorCompacto,
  faltantes,
  respuestaAsistente,
  TOTAL_FASES,
  type BorradorParcial,
  type MensajeChat,
} from '../../shared/constructor';
import { extraerJson } from '../../shared/criterios';
import { nowIso, type Db } from '../db';
import { motivoReserva } from '../runner/plan';
import { promptArquitecta } from './constructor-arquitecta';
import { compilarBorrador, estimarPrueba, type Compilado } from './constructor-compilar';
import { borradorDePlantilla } from './galeria';
import { KbError } from './kb';
import type { MotorLibre } from './reflexion';

export const MODELO_CONSTRUCTOR = 'claude-sonnet-5-5';
export const ESFUERZO_CONSTRUCTOR = 'low';
/** Tope duro de turnos de IA por sesión (protege el plan). */
export const MAX_TURNOS_IA = 40;
/** Referencia de consumo por turno (borrador compacto + respuesta corta). */
export const TOKENS_TURNO_REFERENCIA = 6_000;

export interface Sesion {
  id: number;
  estado: 'abierta' | 'creada' | 'descartada';
  modo: 'ia' | 'formulario';
  fase: number;
  borrador: BorradorParcial;
  mensajes: MensajeChat[];
  turnos: number;
  tokens: number;
  office_id: string | null;
  faltan: string[];
}

interface Fila {
  id: number;
  estado: Sesion['estado'];
  modo: Sesion['modo'];
  fase: number;
  borrador_json: string;
  mensajes_json: string;
  turnos: number;
  tokens: number;
  office_id: string | null;
}

const aSesion = (f: Fila): Sesion => {
  const borrador = JSON.parse(f.borrador_json) as BorradorParcial;
  return {
    id: f.id,
    estado: f.estado,
    modo: f.modo,
    fase: f.fase,
    borrador,
    mensajes: JSON.parse(f.mensajes_json) as MensajeChat[],
    turnos: f.turnos,
    tokens: f.tokens,
    office_id: f.office_id,
    faltan: faltantes(borrador),
  };
};

export function leerSesion(db: Db, id: number): Sesion {
  const f = db.prepare('SELECT * FROM constructor_sesiones WHERE id = ?').get(id) as
    Fila | undefined;
  if (!f) throw new KbError(404, 'Sesión del Constructor no encontrada');
  return aSesion(f);
}

export function listarSesiones(db: Db): Sesion[] {
  return (
    db
      .prepare(
        "SELECT * FROM constructor_sesiones WHERE estado = 'abierta' ORDER BY id DESC LIMIT 20",
      )
      .all() as Fila[]
  ).map(aSesion);
}

export function guardar(
  db: Db,
  s: Sesion,
  extra: { estado?: Sesion['estado']; office?: string } = {},
): Sesion {
  db.prepare(
    `UPDATE constructor_sesiones SET estado = ?, modo = ?, fase = ?, borrador_json = ?, mensajes_json = ?,
       turnos = ?, tokens = ?, office_id = ?, actualizado_en = ? WHERE id = ?`,
  ).run(
    extra.estado ?? s.estado,
    s.modo,
    s.fase,
    JSON.stringify(s.borrador),
    JSON.stringify(s.mensajes.slice(-40)),
    s.turnos,
    s.tokens,
    extra.office ?? s.office_id,
    nowIso(),
    s.id,
  );
  return leerSesion(db, s.id);
}

const SALUDO =
  'Hola, soy la Arquitecta de oficinas. Vamos a diseñar tu piso nuevo paso a paso. Para empezar: ¿qué quieres lograr con este piso y qué te debe entregar al final?';

export function crearSesion(
  db: Db,
  o: { modo: 'ia' | 'formulario'; plantilla?: string | undefined },
): Sesion {
  const borrador = o.plantilla ? borradorDePlantilla(o.plantilla) : {};
  const t = nowIso();
  const mensajes: MensajeChat[] =
    o.modo === 'ia' && !o.plantilla ? [{ de: 'asistente', texto: SALUDO, fase: 1 }] : [];
  const id = Number(
    db
      .prepare(
        `INSERT INTO constructor_sesiones (modo, fase, borrador_json, mensajes_json, creado_en, actualizado_en)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(o.modo, 1, JSON.stringify(borrador), JSON.stringify(mensajes), t, t).lastInsertRowid,
  );
  return leerSesion(db, id);
}

export function abierta(db: Db, id: number): Sesion {
  const s = leerSesion(db, id);
  if (s.estado !== 'abierta') throw new KbError(409, `La sesión está ${s.estado}`);
  return s;
}

/** Disponibilidad de la IA para el asistente (motor, reserva del plan, tope de turnos). */
export function disponibilidadIa(
  db: Db,
  motor: Pick<MotorLibre, 'motor'> | null,
  turnos = 0,
): { disponible: boolean; motivo: string | null } {
  if (!motor)
    return { disponible: false, motivo: 'El motor de IA no está activo en este servidor.' };
  if (motor.motor !== 'claude-code')
    return {
      disponible: false,
      motivo: 'El asistente conversacional requiere el motor claude-code.',
    };
  if (turnos >= MAX_TURNOS_IA)
    return { disponible: false, motivo: `Se alcanzó el tope de ${MAX_TURNOS_IA} turnos de IA.` };
  const reserva = motivoReserva(db);
  return reserva ? { disponible: false, motivo: reserva } : { disponible: true, motivo: null };
}

export function estimadoTurno(s: Sesion): number {
  return s.turnos > 0 ? Math.round(s.tokens / s.turnos) : TOKENS_TURNO_REFERENCIA;
}

const CATALOGO_CORTO = HERRAMIENTAS_GENERICAS.map((h) => ({
  nombre: h,
  descripcion: CATALOGO.find((c) => c.nombre === h)?.descripcion ?? '',
}));

/** Un turno conversacional: UNA llamada al motor con el borrador compacto + lo último que dijo el dueño. */
export async function turnoIa(
  db: Db,
  motor: MotorLibre,
  id: number,
  texto: string,
): Promise<{ sesion: Sesion; rechazos: string[] }> {
  const s = abierta(db, id);
  if (s.modo !== 'ia') throw new KbError(409, 'La sesión está en modo formulario');
  const txt = z.string().trim().min(1).max(2000).safeParse(texto);
  if (!txt.success) throw new KbError(400, 'El mensaje debe tener entre 1 y 2000 caracteres');
  const disp = disponibilidadIa(db, motor, s.turnos);
  if (!disp.disponible) throw new KbError(409, `Asistente en pausa. ${disp.motivo ?? ''}`);
  const ultima = [...s.mensajes].reverse().find((m) => m.de === 'asistente');
  const mensaje = JSON.stringify({
    fase_actual: s.fase,
    borrador: JSON.parse(borradorCompacto(s.borrador)) as unknown,
    faltan: s.faltan,
    catalogo: CATALOGO_CORTO,
    ultima_pregunta_tuya: ultima?.texto.slice(0, 500) ?? null,
    dueno_dice: txt.data,
  });
  const r = await motor.llamar({
    officeId: 'prospeccion',
    agente: 'Arquitecta',
    prompt: promptArquitecta(db),
    mensaje,
    modelo: MODELO_CONSTRUCTOR,
    esfuerzo: ESFUERZO_CONSTRUCTOR,
  });
  if (!r.ok)
    throw new KbError(
      r.limite_plan ? 429 : 502,
      r.limite_plan
        ? 'Límite del plan alcanzado: usa el modo formulario o reintenta más tarde'
        : `El asistente falló: ${r.error ?? 'sin detalle'}`,
    );
  const gastados = r.tokens_ponderados ?? r.tokens ?? 0;
  const parsed = respuestaAsistente.safeParse(extraerJson(r.salida));
  const chat: MensajeChat[] = [...s.mensajes, { de: 'dueno', texto: txt.data, fase: s.fase }];
  if (!parsed.success) {
    chat.push({
      de: 'sistema',
      texto:
        'El asistente no devolvió una respuesta válida; repite tu mensaje o usa el formulario.',
    });
    const g = guardar(db, {
      ...s,
      mensajes: chat,
      turnos: s.turnos + 1,
      tokens: s.tokens + gastados,
    });
    return { sesion: g, rechazos: ['Respuesta del asistente no válida'] };
  }
  const { borrador, rechazos } = aplicarParche(s.borrador, parsed.data.borrador);
  chat.push({ de: 'asistente', texto: parsed.data.mensaje, fase: parsed.data.fase });
  if (rechazos.length > 0)
    chat.push({ de: 'sistema', texto: `No se aplicó: ${rechazos.join('; ')}` });
  const g = guardar(db, {
    ...s,
    borrador,
    fase: Math.min(TOTAL_FASES, parsed.data.fase),
    mensajes: chat,
    turnos: s.turnos + 1,
    tokens: s.tokens + gastados,
  });
  return { sesion: g, rechazos };
}

/** Edición directa del borrador (formulario o JSON avanzado) y cambio de fase/modo. Sin IA. */
export function editarSesion(
  db: Db,
  id: number,
  o: {
    parche?: Record<string, unknown> | undefined;
    fase?: number | undefined;
    modo?: 'ia' | 'formulario' | undefined;
  },
): { sesion: Sesion; rechazos: string[] } {
  const s = abierta(db, id);
  const { borrador, rechazos } = o.parche
    ? aplicarParche(s.borrador, o.parche)
    : { borrador: s.borrador, rechazos: [] };
  const g = guardar(db, {
    ...s,
    borrador,
    fase: o.fase ? Math.min(TOTAL_FASES, Math.max(1, o.fase)) : s.fase,
    modo: o.modo ?? s.modo,
  });
  return { sesion: g, rechazos };
}

export interface VistaPrevia extends Compilado {
  estimado_prueba_tokens: number;
}

export function vistaPrevia(db: Db, id: number): VistaPrevia {
  const s = leerSesion(db, id);
  const c = compilarBorrador(db, s.borrador, s.borrador.relajar_candados ?? []);
  return { ...c, estimado_prueba_tokens: estimarPrueba(1, s.borrador.prueba_items ?? 1) };
}
