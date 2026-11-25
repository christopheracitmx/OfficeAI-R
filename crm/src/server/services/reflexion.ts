// «Reflexión»: UNA llamada por oficina (agrupa a todos los agentes) con datos agregados y recortados.
// Decisión de consumo: una sola llamada paga el prompt base una vez (~11 llamadas separadas pagarían 11).
// Nunca es automática, nunca toca los prompts base: solo crea lecciones en estado «propuesta».
import { z } from 'zod';
import type { Db } from '../db';
import { extraerJson } from '../../shared/criterios';
import { motivoLeccionInvalida, normalizarLeccion } from '../../shared/leccion-reglas';
import { getConfig } from './admin';
import { PROMPT_REFLEXION, datosReflexion } from './reflexion-datos';
import { KbError } from './kb';
import { crearLeccion } from './lecciones';
import { estimarTokens } from './prompts-db';
import { motivoReserva } from '../runner/plan';
import type { ResultadoAgente } from '../runner/types';

const TOKENS_SALIDA = 1200;

/** Lo único que la reflexión necesita del runner (inyectable en pruebas). */
export interface MotorLibre {
  motor: string;
  modeloBase: string | undefined;
  llamar(i: {
    officeId: string;
    agente: string;
    prompt: string;
    mensaje: string;
    modelo?: string | undefined;
    esfuerzo?: string | undefined;
  }): Promise<ResultadoAgente>;
}

const respuestaSchema = z.object({
  propuestas: z
    .array(
      z.object({
        agente: z.string(),
        tipo: z.enum(['acierto', 'error']),
        texto: z.string(),
        evidencia_feedback: z.array(z.number().int()).optional(),
      }),
    )
    .default([]),
  fusiones: z
    .array(
      z.object({
        ids: z.array(z.number().int()).min(2),
        agente: z.string(),
        tipo: z.enum(['acierto', 'error']),
        texto: z.string(),
      }),
    )
    .default([]),
});

export interface EstimadoReflexion {
  tokens: number;
  prompt_tokens: number;
  datos_tokens: number;
  modelo: string;
  esfuerzo: string;
  feedback_total: number;
  umbral: number;
  requiere_confirmacion: boolean;
  pct_presupuesto: number | null;
}

export function estimarReflexion(
  db: Db,
  office: string,
  modelo: string,
  esfuerzo: string,
): EstimadoReflexion {
  const datos = datosReflexion(db, office);
  const p = estimarTokens(PROMPT_REFLEXION);
  const d = estimarTokens(datos);
  const tokens = p + d + TOKENS_SALIDA;
  const cfg = getConfig(db);
  const total = (
    db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE office_id = ?').get(office) as {
      n: number;
    }
  ).n;
  return {
    tokens,
    prompt_tokens: p,
    datos_tokens: d,
    modelo,
    esfuerzo,
    feedback_total: total,
    umbral: cfg.umbral_confirmacion_tokens,
    requiere_confirmacion: true, // la reflexión siempre pide confirmación (gasta plan)
    pct_presupuesto:
      cfg.presupuesto_5h_tokens > 0 ? Math.round((tokens / cfg.presupuesto_5h_tokens) * 100) : null,
  };
}

export interface ResultadoReflexion {
  creadas: number;
  fusiones: number;
  rechazadas: { texto: string; motivo: string }[];
  tokens: number;
  salida_id: number;
}

function guardarSalida(
  db: Db,
  office: string,
  r: ResultadoAgente,
  modelo: string,
  ms: number,
  resumen: string,
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO salidas_agente (office_id, agente, rol, paso, tipo, resumen, contenido, tokens_estimados, tokens_brutos, duracion_ms, resultado, turnos, modelo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        office,
        'Reflexion',
        'Reflexion',
        'reflexion',
        'reflexion',
        resumen.slice(0, 300),
        (r.salida || r.error || '').slice(0, 8000),
        r.tokens_ponderados ?? r.tokens ?? null,
        r.tokens ?? null,
        ms,
        r.limite_plan ? 'limite' : r.timeout ? 'timeout' : r.ok ? 'ok' : 'fallo',
        r.turnos ?? null,
        modelo,
      ).lastInsertRowid,
  );
}

export async function ejecutarReflexion(
  db: Db,
  motor: MotorLibre,
  office: string,
  o: {
    modelo?: string | undefined;
    esfuerzo?: string | undefined;
    confirmado?: boolean | undefined;
  },
): Promise<ResultadoReflexion> {
  const modelo = o.modelo ?? motor.modeloBase ?? 'claude-sonnet-5-5';
  const esfuerzo = o.esfuerzo ?? 'low';
  if (motor.motor !== 'claude-code')
    throw new KbError(409, 'La reflexión solo está disponible con el motor claude-code');
  const est = estimarReflexion(db, office, modelo, esfuerzo);
  if (est.feedback_total === 0)
    throw new KbError(422, 'Aún no hay retroalimentación: nada que reflexionar');
  if (!o.confirmado)
    throw new KbError(
      409,
      `Consumo estimado ≈ ${est.tokens.toLocaleString('es-MX')} tokens. Confirma para ejecutar la reflexión.`,
    );
  const reserva = motivoReserva(db);
  if (reserva) throw new KbError(409, `Reflexión no ejecutada. ${reserva}`);
  const t0 = Date.now();
  const r = await motor.llamar({
    officeId: office,
    agente: 'Reflexion',
    prompt: PROMPT_REFLEXION,
    mensaje: datosReflexion(db, office),
    modelo,
    esfuerzo,
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    guardarSalida(db, office, r, modelo, ms, `Reflexión fallida: ${r.error ?? 'sin detalle'}`);
    throw new KbError(
      r.limite_plan ? 429 : 502,
      r.limite_plan
        ? 'Límite del plan alcanzado: reintenta cuando se libere'
        : `La reflexión falló: ${r.error ?? 'sin detalle'}`,
    );
  }
  const parsed = respuestaSchema.safeParse(extraerJson(r.salida));
  if (!parsed.success) {
    guardarSalida(db, office, r, modelo, ms, 'Reflexión sin JSON válido');
    throw new KbError(502, 'La reflexión no devolvió un JSON válido; no se creó ninguna lección');
  }
  const feedbackIds = new Set(
    (db.prepare('SELECT id FROM feedback WHERE office_id = ?').all(office) as { id: number }[]).map(
      (f) => f.id,
    ),
  );
  const existentes = new Set(
    (
      db
        .prepare("SELECT texto FROM lecciones WHERE office_id = ? AND estado != 'archivada'")
        .all(office) as { texto: string }[]
    ).map((l) => normalizarLeccion(l.texto).toLowerCase()),
  );
  const aprobadasIds = new Set(
    (
      db
        .prepare("SELECT id FROM lecciones WHERE office_id = ? AND estado = 'aprobada'")
        .all(office) as { id: number }[]
    ).map((l) => l.id),
  );
  const out: ResultadoReflexion = {
    creadas: 0,
    fusiones: 0,
    rechazadas: [],
    tokens: r.tokens_ponderados ?? r.tokens ?? 0,
    salida_id: 0,
  };
  const crear = (
    agente: string,
    tipo: 'acierto' | 'error',
    texto: string,
    evidencia: { feedback?: number[]; fusiona?: number[]; salidas?: number[] },
  ): boolean => {
    const t = normalizarLeccion(texto);
    const motivo = motivoLeccionInvalida(t);
    if (motivo) return (out.rechazadas.push({ texto: t.slice(0, 120), motivo }), false);
    if (existentes.has(t.toLowerCase()))
      return (out.rechazadas.push({ texto: t.slice(0, 120), motivo: 'Duplicada' }), false);
    try {
      crearLeccion(db, { office_id: office, agente, tipo, texto: t, evidencia }, 'reflexion');
      existentes.add(t.toLowerCase());
      return true;
    } catch (e) {
      return (
        out.rechazadas.push({
          texto: t.slice(0, 120),
          motivo: e instanceof Error ? e.message : 'Inválida',
        }),
        false
      );
    }
  };
  for (const p of parsed.data.propuestas.slice(0, 12))
    if (
      crear(p.agente, p.tipo, p.texto, {
        feedback: (p.evidencia_feedback ?? []).filter((x) => feedbackIds.has(x)).slice(0, 20),
        salidas: [],
      })
    )
      out.creadas++;
  for (const f of parsed.data.fusiones.slice(0, 6)) {
    const ids = f.ids.filter((x) => aprobadasIds.has(x));
    if (ids.length >= 2 && crear(f.agente, f.tipo, f.texto, { fusiona: ids })) out.fusiones++;
  }
  out.salida_id = guardarSalida(
    db,
    office,
    r,
    modelo,
    ms,
    `Reflexión: ${out.creadas} propuesta(s), ${out.fusiones} fusión(es), ${out.rechazadas.length} rechazada(s)`,
  );
  return out;
}
