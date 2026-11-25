// Evaluación con casos dorados: corre cada caso con el prompt real del paso (+ el cambio a probar) usando el CLI,
// sin herramientas, y verifica los criterios POR CÓDIGO. El resultado queda guardado y es comparable entre versiones.
import type { Db } from '../db';
import { nowIso } from '../db';
import { evaluarCriterios, type ResultadoCriterio } from '../../shared/criterios';
import { motivoLeccionInvalida } from '../../shared/leccion-reglas';
import { getConfig } from './admin';
import { listarCasos, type CasoDorado } from './casos-dorados';
import { KbError } from './kb';
import { estimarTokens } from './prompts-db';
import type { MotorLibre } from './reflexion';
import { motivoReserva } from '../runner/plan';

export interface MotorEvaluacion extends MotorLibre {
  /** Prompt final compuesto de un paso (global + rol + lecciones + habilidades + candados), con bloques extra. */
  promptDe(office: string, paso: string, extras: string[]): string | null;
}

const TOKENS_SALIDA_CASO = 700;

const mensajeCaso = (c: CasoDorado): string =>
  `EJEMPLO DE EXPEDIENTE (evaluación, no es un prospecto real):\n${c.entrada}\n\nTAREA: eres ${c.agente}. Produce SOLO el resultado final que guardarías con tus herramientas (en JSON si el rol lo pide), SIN usar herramientas y sin texto adicional.`;

const bloqueCambio = (cambio: string | undefined): string[] =>
  cambio
    ? [`CAMBIO EN EVALUACIÓN (aplícalo como si fuera una lección aprobada):\n- ${cambio}`]
    : [];

export interface EstimadoEvaluacion {
  casos: number;
  tokens: number;
  modelo: string;
  umbral: number;
  requiere_confirmacion: boolean;
  pct_presupuesto: number | null;
}

export function estimarEvaluacion(
  db: Db,
  motor: MotorEvaluacion,
  office: string,
  modelo: string,
): EstimadoEvaluacion {
  const casos = listarCasos(db, office, true);
  let tokens = 0;
  for (const c of casos)
    tokens +=
      estimarTokens(motor.promptDe(office, c.paso, []) ?? '') +
      estimarTokens(mensajeCaso(c)) +
      TOKENS_SALIDA_CASO;
  const cfg = getConfig(db);
  return {
    casos: casos.length,
    tokens,
    modelo,
    umbral: cfg.umbral_confirmacion_tokens,
    requiere_confirmacion: true,
    pct_presupuesto:
      cfg.presupuesto_5h_tokens > 0 ? Math.round((tokens / cfg.presupuesto_5h_tokens) * 100) : null,
  };
}

export interface ResumenEvaluacion {
  id: number;
  office_id: string;
  etiqueta: string;
  cambio: string | null;
  modo: string;
  modelo: string | null;
  casos: number;
  aprobados: number;
  criterios_total: number;
  criterios_ok: number;
  tokens: number;
  estado: string;
  nota: string | null;
  creado_en: string;
}

export interface CasoEvaluado {
  caso_id: number;
  caso_nombre: string;
  salida: string;
  resultados: ResultadoCriterio[];
  ok: boolean;
}

export async function ejecutarEvaluacion(
  db: Db,
  motor: MotorEvaluacion,
  office: string,
  o: {
    etiqueta: string;
    cambio?: string | undefined;
    modelo?: string | undefined;
    confirmado?: boolean | undefined;
  },
): Promise<ResumenEvaluacion> {
  if (motor.motor !== 'claude-code')
    throw new KbError(409, 'La evaluación solo está disponible con el motor claude-code');
  const modelo = o.modelo ?? motor.modeloBase ?? 'claude-sonnet-5-5';
  if (o.cambio) {
    const m = motivoLeccionInvalida(o.cambio);
    if (m) throw new KbError(422, `Cambio rechazado: ${m}`);
  }
  const casos = listarCasos(db, office, true);
  if (casos.length === 0) throw new KbError(422, 'No hay casos dorados activos');
  const est = estimarEvaluacion(db, motor, office, modelo);
  if (!o.confirmado)
    throw new KbError(
      409,
      `Consumo estimado ≈ ${est.tokens.toLocaleString('es-MX')} tokens (${casos.length} casos). Confirma para evaluar.`,
    );
  const evaluados: CasoEvaluado[] = [];
  let tokens = 0;
  let detenida: string | null = null;
  for (const c of casos) {
    const reserva = motivoReserva(db);
    if (reserva) {
      detenida = reserva;
      break;
    }
    const prompt = motor.promptDe(office, c.paso, bloqueCambio(o.cambio));
    if (!prompt)
      throw new KbError(422, `El caso «${c.nombre}» apunta a un paso inexistente: ${c.paso}`);
    const t0 = Date.now();
    const r = await motor.llamar({
      officeId: office,
      agente: c.agente,
      prompt,
      mensaje: mensajeCaso(c),
      modelo,
      esfuerzo: 'low',
    });
    tokens += r.tokens_ponderados ?? r.tokens ?? 0;
    db.prepare(
      `INSERT INTO salidas_agente (office_id, agente, rol, paso, tipo, resumen, contenido, tokens_estimados, duracion_ms, resultado, modelo)
       VALUES (?,?,?,?,'evaluacion',?,?,?,?,?,?)`,
    ).run(
      office,
      c.agente,
      c.agente,
      `caso:${c.nombre}`.slice(0, 80),
      `Evaluación «${o.etiqueta}»: ${c.nombre}`.slice(0, 300),
      (r.salida || r.error || '').slice(0, 8000),
      r.tokens_ponderados ?? r.tokens ?? null,
      Date.now() - t0,
      r.limite_plan ? 'limite' : r.ok ? 'ok' : 'fallo',
      modelo,
    );
    if (r.limite_plan) {
      detenida = 'Límite del plan alcanzado durante la evaluación';
      break;
    }
    const salida = r.ok ? r.salida : '';
    const resultados = r.ok
      ? evaluarCriterios(salida, c.criterios)
      : [{ criterio: 'ejecución', ok: false, detalle: r.error ?? 'el CLI falló' }];
    evaluados.push({
      caso_id: c.id,
      caso_nombre: c.nombre,
      salida,
      resultados,
      ok: resultados.every((x) => x.ok),
    });
  }
  const total = evaluados.reduce((a, e) => a + e.resultados.length, 0);
  const ok = evaluados.reduce((a, e) => a + e.resultados.filter((x) => x.ok).length, 0);
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO evaluaciones (office_id, etiqueta, cambio, modo, modelo, casos, aprobados, criterios_total, criterios_ok, tokens, estado, nota, creado_en)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          office,
          o.etiqueta,
          o.cambio ?? null,
          'real',
          modelo,
          evaluados.length,
          evaluados.filter((e) => e.ok).length,
          total,
          ok,
          tokens,
          detenida ? 'incompleta' : 'terminada',
          detenida,
          nowIso(),
        ).lastInsertRowid,
    );
    const ins = db.prepare(
      'INSERT INTO evaluaciones_casos (evaluacion_id, caso_id, caso_nombre, salida, resultados, ok) VALUES (?,?,?,?,?,?)',
    );
    for (const e of evaluados)
      ins.run(
        id,
        e.caso_id,
        e.caso_nombre,
        e.salida.slice(0, 6000),
        JSON.stringify(e.resultados),
        e.ok ? 1 : 0,
      );
    return leerEvaluacion(db, id).resumen;
  })();
}

export function leerEvaluacion(
  db: Db,
  id: number,
): { resumen: ResumenEvaluacion; casos: CasoEvaluado[] } {
  const resumen = db.prepare('SELECT * FROM evaluaciones WHERE id = ?').get(id) as
    ResumenEvaluacion | undefined;
  if (!resumen) throw new KbError(404, 'Evaluación no encontrada');
  const casos = (
    db
      .prepare(
        'SELECT caso_id, caso_nombre, salida, resultados, ok FROM evaluaciones_casos WHERE evaluacion_id = ? ORDER BY id',
      )
      .all(id) as {
      caso_id: number;
      caso_nombre: string;
      salida: string;
      resultados: string;
      ok: number;
    }[]
  ).map((c) => ({
    ...c,
    resultados: JSON.parse(c.resultados) as ResultadoCriterio[],
    ok: c.ok === 1,
  }));
  return { resumen, casos };
}

export const listarEvaluaciones = (db: Db, office: string): ResumenEvaluacion[] =>
  db
    .prepare('SELECT * FROM evaluaciones WHERE office_id = ? ORDER BY id DESC LIMIT 50')
    .all(office) as ResumenEvaluacion[];
