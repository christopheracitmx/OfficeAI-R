import type { Db } from '../db';
import { conteoLecciones, type ConteoLecciones } from './lecciones';

export interface PuntoTendencia {
  corrida_id: number;
  llamadas: number;
  ok_pct: number;
  tokens_por_empresa: number | null;
}

export interface DesempenoAgente {
  agente: string;
  llamadas: number;
  ok_pct: number | null;
  tokens: number;
  empresas: number;
  tokens_por_empresa: number | null;
  tiempo_medio_s: number | null;
  /** Revisiones de QA donde este agente es el revisor. */
  qa_revisiones: number;
  qa_aprobacion_pct: number | null;
  /** Veces que QA devolvió trabajo a este agente. */
  devoluciones: number;
  /** 👍/👎 del dueño (manuales) atribuidos a este agente. */
  aciertos_dueno: number;
  errores_dueno: number;
  lecciones_aprobadas: number;
  lecciones_propuestas: number;
  tendencia: PuntoTendencia[];
}

export interface ResumenOficina {
  corridas: number;
  prospectos: number;
  llamadas: number;
  tokens: number;
  tokens_por_prospecto: number | null;
  qa_revisiones: number;
  qa_aprobacion_pct: number | null;
  devoluciones: number;
  resultados: Record<string, number>;
  aciertos_dueno: number;
  errores_dueno: number;
  lecciones: ConteoLecciones;
}

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const n = (v: unknown): number => (typeof v === 'number' ? v : 0);

export function desempeno(
  db: Db,
  office: string,
): { oficina: ResumenOficina; agentes: DesempenoAgente[] } {
  const rows = db
    .prepare(
      `SELECT agente, COUNT(*) AS llamadas, SUM(resultado='ok') AS ok, COALESCE(SUM(tokens_estimados),0) AS tokens,
              COUNT(DISTINCT item_id) AS empresas, AVG(duracion_ms) AS ms
       FROM salidas_agente WHERE office_id = ? AND tipo = 'paso' GROUP BY agente`,
    )
    .all(office) as Record<string, number | string | null>[];
  const qa = new Map<string, { rev: number; ok: number }>();
  for (const r of db
    .prepare(`SELECT etapa, COUNT(*) AS rev, SUM(aprobado) AS ok FROM revisiones_qa GROUP BY etapa`)
    .all() as { etapa: string; rev: number; ok: number }[])
    qa.set(r.etapa === 'qa1' ? 'QA-1' : 'QA-2', { rev: r.rev, ok: n(r.ok) });
  const dev = new Map(
    (
      db
        .prepare(
          'SELECT devolver_a AS a, COUNT(*) AS c FROM revisiones_qa WHERE aprobado = 0 AND devolver_a IS NOT NULL GROUP BY devolver_a',
        )
        .all() as { a: string; c: number }[]
    ).map((r) => [r.a, r.c]),
  );
  const fb = new Map<string, { up: number; down: number }>();
  for (const r of db
    .prepare(
      "SELECT agente, SUM(valor > 0) AS up, SUM(valor < 0) AS down FROM feedback WHERE office_id = ? AND origen = 'manual' AND agente IS NOT NULL GROUP BY agente",
    )
    .all(office) as { agente: string; up: number; down: number }[])
    fb.set(r.agente, { up: n(r.up), down: n(r.down) });
  const lecs = conteoLecciones(db, office);
  const tendencias = new Map<string, PuntoTendencia[]>();
  for (const r of db
    .prepare(
      `SELECT agente, corrida_id, COUNT(*) AS llamadas, SUM(resultado='ok') AS ok, SUM(tokens_estimados) AS tokens, COUNT(DISTINCT item_id) AS empresas
       FROM salidas_agente WHERE office_id = ? AND tipo = 'paso' AND corrida_id IS NOT NULL
         AND corrida_id IN (SELECT id FROM corridas WHERE office_id = ? ORDER BY id DESC LIMIT 8)
       GROUP BY agente, corrida_id ORDER BY corrida_id`,
    )
    .all(office, office) as Record<string, number | string | null>[]) {
    const empresas = n(r['empresas']);
    const punto: PuntoTendencia = {
      corrida_id: n(r['corrida_id']),
      llamadas: n(r['llamadas']),
      ok_pct: pct(n(r['ok']), n(r['llamadas'])) ?? 0,
      tokens_por_empresa: empresas > 0 ? Math.round(n(r['tokens']) / empresas) : null,
    };
    const a = String(r['agente']);
    tendencias.set(a, [...(tendencias.get(a) ?? []), punto]);
  }
  const nombres = new Set<string>([
    ...rows.map((r) => String(r['agente'])),
    ...qa.keys(),
    ...dev.keys(),
    ...fb.keys(),
    ...Object.keys(lecs.por_agente),
  ]);
  const agentes: DesempenoAgente[] = [...nombres].sort().map((agente) => {
    const r = rows.find((x) => x['agente'] === agente);
    const q = qa.get(agente);
    const f = fb.get(agente);
    const empresas = n(r?.['empresas']);
    return {
      agente,
      llamadas: n(r?.['llamadas']),
      ok_pct: r ? pct(n(r['ok']), n(r['llamadas'])) : null,
      tokens: n(r?.['tokens']),
      empresas,
      tokens_por_empresa: empresas > 0 ? Math.round(n(r?.['tokens']) / empresas) : null,
      tiempo_medio_s: r?.['ms'] == null ? null : Math.round(n(r['ms']) / 100) / 10,
      qa_revisiones: q?.rev ?? 0,
      qa_aprobacion_pct: q ? pct(q.ok, q.rev) : null,
      devoluciones: dev.get(agente) ?? 0,
      aciertos_dueno: f?.up ?? 0,
      errores_dueno: f?.down ?? 0,
      lecciones_aprobadas: lecs.por_agente[agente]?.aprobadas ?? 0,
      lecciones_propuestas: lecs.por_agente[agente]?.propuestas ?? 0,
      tendencia: tendencias.get(agente) ?? [],
    };
  });
  const c = (sql: string, ...p: unknown[]) =>
    n((db.prepare(sql).get(...p) as { v: number | null }).v);
  const qaTotal = [...qa.values()].reduce((a, x) => a + x.rev, 0);
  const qaOk = [...qa.values()].reduce((a, x) => a + x.ok, 0);
  const tokens = c(
    "SELECT COALESCE(SUM(tokens_estimados),0) AS v FROM salidas_agente WHERE office_id = ? AND tipo = 'paso'",
    office,
  );
  const prospectos = c('SELECT COUNT(*) AS v FROM prospectos');
  const resultados = Object.fromEntries(
    (
      db
        .prepare(
          "SELECT estado, COUNT(*) AS n FROM prospectos WHERE estado IN ('Canalizado','En contacto','Propuesta','Ganado','Perdido','Descartado') GROUP BY estado",
        )
        .all() as { estado: string; n: number }[]
    ).map((r) => [r.estado, r.n]),
  );
  return {
    oficina: {
      corridas: c('SELECT COUNT(*) AS v FROM corridas WHERE office_id = ?', office),
      prospectos,
      llamadas: c(
        "SELECT COUNT(*) AS v FROM salidas_agente WHERE office_id = ? AND tipo = 'paso'",
        office,
      ),
      tokens,
      tokens_por_prospecto: prospectos > 0 ? Math.round(tokens / prospectos) : null,
      qa_revisiones: qaTotal,
      qa_aprobacion_pct: pct(qaOk, qaTotal),
      devoluciones: c('SELECT COUNT(*) AS v FROM revisiones_qa WHERE aprobado = 0'),
      resultados,
      aciertos_dueno: c(
        "SELECT COUNT(*) AS v FROM feedback WHERE office_id = ? AND origen='manual' AND valor > 0",
        office,
      ),
      errores_dueno: c(
        "SELECT COUNT(*) AS v FROM feedback WHERE office_id = ? AND origen='manual' AND valor < 0",
        office,
      ),
      lecciones: lecs,
    },
    agentes,
  };
}
