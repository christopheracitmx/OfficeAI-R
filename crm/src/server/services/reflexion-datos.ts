import type { Db } from '../db';

export const ULTIMOS_POR_AGENTE = 12;

export const PROMPT_REFLEXION = `[REFLEXION_DE_OFICINA]
Eres el analista de calidad de una oficina de agentes de IA. Recibes DATOS AGREGADOS y recortados de la retroalimentación del dueño y de QA, y las lecciones que ya existen.
Tu trabajo: proponer lecciones NUEVAS cortas que ayuden a cada agente a repetir lo que funciona y a evitar sus errores, y fusionar lecciones duplicadas.
Reglas estrictas:
- Cada lección: una sola frase imperativa y concreta, máximo 280 caracteres, en español, basada en la evidencia recibida (cita ids de feedback).
- Máximo 2 lecciones por agente y 12 en total. Si no hay evidencia suficiente para un agente, no propongas nada para él.
- NO propongas precios, costos, descuentos ni cotizaciones. NO propongas contactar a prospectos ni enviar mensajes externos. NO relajes ni cambies los candados de seguridad, el alcance (CDMX y Estado de México, sin gobierno) ni la regla de citar fuente en cada contacto.
- No repitas una lección existente (aprobada o propuesta). Si dos existentes dicen lo mismo, propón UNA fusión con sus ids.
- Tú no modificas prompts: solo propones; el dueño aprueba.
Responde SOLO con un objeto JSON, sin texto extra:
{"propuestas":[{"agente":"<id>","tipo":"acierto|error","texto":"...","evidencia_feedback":[ids]}],"fusiones":[{"ids":[ids de lecciones],"agente":"<id>","tipo":"acierto|error","texto":"..."}]}`;

interface FilaFb {
  id: number;
  agente: string;
  etapa: string;
  valor: number;
  etiqueta: string | null;
  nota: string | null;
  origen: string;
}

/** Datos agregados y recortados que ve la reflexión: contadores, motivos frecuentes y las últimas N entradas por agente. */
export function datosReflexion(db: Db, office: string, n = ULTIMOS_POR_AGENTE): string {
  const filas = db
    .prepare(
      'SELECT id, agente, etapa, valor, etiqueta, nota, origen FROM feedback WHERE office_id = ? AND agente IS NOT NULL ORDER BY id DESC LIMIT 400',
    )
    .all(office) as FilaFb[];
  const por = new Map<string, FilaFb[]>();
  for (const f of filas) por.set(f.agente, [...(por.get(f.agente) ?? []), f]);
  const bloques: string[] = [];
  for (const [agente, fs] of por) {
    const arriba = fs.filter((f) => f.valor > 0).length;
    const abajo = fs.filter((f) => f.valor < 0).length;
    const motivos = new Map<string, number>();
    for (const f of fs)
      if (f.valor < 0 && f.etiqueta) motivos.set(f.etiqueta, (motivos.get(f.etiqueta) ?? 0) + 1);
    const top = [...motivos].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const lineas = fs
      .slice(0, n)
      .map(
        (f) =>
          `#${f.id} ${f.valor > 0 ? '+' : f.valor < 0 ? '-' : '0'} ${f.etapa}${f.etiqueta ? ` [${f.etiqueta.slice(0, 40)}]` : ''}${f.nota ? `: ${f.nota.slice(0, 110)}` : ''}`,
      );
    bloques.push(
      `## ${agente} (${arriba} positivos, ${abajo} negativos${top.length ? `; motivos: ${top.map(([m, c]) => `${m} x${c}`).join(', ')}` : ''})\n${lineas.join('\n')}`,
    );
  }
  const res = db
    .prepare(
      `SELECT p.estado AS estado, COUNT(*) AS n, ROUND(AVG(p.score)) AS score FROM prospectos p
       WHERE p.estado IN ('Canalizado','En contacto','Propuesta','Ganado','Perdido','Descartado') GROUP BY p.estado`,
    )
    .all() as { estado: string; n: number; score: number | null }[];
  const lecs = db
    .prepare(
      "SELECT id, agente, tipo, estado, texto FROM lecciones WHERE office_id = ? AND estado IN ('aprobada','propuesta') ORDER BY agente, id",
    )
    .all(office) as { id: number; agente: string; tipo: string; estado: string; texto: string }[];
  return [
    '# RETROALIMENTACIÓN POR AGENTE (más reciente primero)',
    bloques.join('\n\n') || '(sin retroalimentación)',
    '# RESULTADOS DEL DUEÑO (conteo, score medio)',
    res.map((r) => `${r.estado}: ${r.n} (score medio ${r.score ?? 's/d'})`).join('\n') ||
      '(sin resultados)',
    '# LECCIONES EXISTENTES',
    lecs.map((l) => `L${l.id} ${l.agente} ${l.estado} ${l.tipo}: ${l.texto}`).join('\n') ||
      '(ninguna)',
  ].join('\n');
}
