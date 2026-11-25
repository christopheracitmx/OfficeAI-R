import type { Db } from '../db';

/** Topes para cuidar el plan: los agentes reciben fragmentos, nunca documentos completos de golpe. */
export const TOPE_BUSQUEDA = 1500;
export const TOPE_FRAGMENTO = 420;
export const TOPE_LECTURA = 2500;

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const terminos = (t: string): string[] =>
  [
    ...new Set(
      norm(t)
        .split(/[^a-z0-9]+/)
        .filter((x) => x.length >= 3),
    ),
  ].slice(0, 8);

interface Fuente {
  ref: string;
  tipo: string;
  titulo: string;
  tags: string;
  cuerpo: string;
}

function fuentes(db: Db, office: string, tipo?: string): Fuente[] {
  const docs = db
    .prepare(
      `SELECT id, tipo, titulo, tags, contenido_md FROM kb_documentos WHERE office_id = ? AND activo = 1 ${tipo && tipo !== 'producto' ? 'AND tipo = ?' : tipo === 'producto' ? "AND tipo = 'producto'" : ''}`,
    )
    .all(...(tipo && tipo !== 'producto' ? [office, tipo] : [office])) as {
    id: number;
    tipo: string;
    titulo: string;
    tags: string;
    contenido_md: string;
  }[];
  const out: Fuente[] = docs.map((d) => ({
    ref: `doc:${d.id}`,
    tipo: d.tipo,
    titulo: d.titulo,
    tags: d.tags,
    cuerpo: d.contenido_md,
  }));
  if (!tipo || tipo === 'producto') {
    const ps = db
      .prepare('SELECT * FROM kb_productos WHERE office_id = ? AND activo = 1')
      .all(office) as Record<string, string | number>[];
    for (const p of ps)
      out.push({
        ref: `prod:${p['id']}`,
        tipo: 'producto',
        titulo: `${p['marca']} · ${p['familia']}`,
        tags: `${p['marca']} ${p['familia']}`,
        cuerpo: [
          p['descripcion'],
          p['casos_uso'] && `Casos de uso: ${p['casos_uso']}`,
          p['giros_ideales'] && `Giros ideales: ${p['giros_ideales']}`,
          p['argumentos_valor'] && `Valor: ${p['argumentos_valor']}`,
          p['advertencias'] && `Ojo: ${p['advertencias']}`,
        ]
          .filter(Boolean)
          .join('\n'),
      });
  }
  return out;
}

/** El mejor párrafo del cuerpo para los términos, recortado. */
function fragmento(cuerpo: string, ts: string[]): string {
  const partes = cuerpo.split(/\n{1,}/).filter((p) => p.trim());
  let mejor = partes[0] ?? '';
  let mejorN = -1;
  for (const p of partes) {
    const n = ts.reduce((a, t) => a + (norm(p).includes(t) ? 1 : 0), 0);
    if (n > mejorN) {
      mejor = p;
      mejorN = n;
    }
  }
  const t = mejor.trim();
  return t.length > TOPE_FRAGMENTO ? `${t.slice(0, TOPE_FRAGMENTO)}…` : t;
}

export interface Hallazgo {
  ref: string;
  tipo: string;
  titulo: string;
  fragmento: string;
}

export function buscarKb(
  db: Db,
  office: string,
  texto: string,
  tipo?: string,
  tope = TOPE_BUSQUEDA,
): { resultados: Hallazgo[]; nota?: string } {
  const ts = terminos(texto);
  if (ts.length === 0) return { resultados: [], nota: 'Escribe al menos una palabra de 3 letras' };
  const punt = fuentes(db, office, tipo)
    .map((f) => {
      const t = norm(f.titulo);
      const g = norm(f.tags);
      const c = norm(f.cuerpo);
      const s = ts.reduce(
        (a, x) => a + (t.includes(x) ? 3 : 0) + (g.includes(x) ? 2 : 0) + (c.includes(x) ? 1 : 0),
        0,
      );
      return { f, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  const resultados: Hallazgo[] = [];
  let usado = 0;
  for (const { f } of punt) {
    const frag = fragmento(f.cuerpo, ts);
    if (usado + frag.length > tope && resultados.length > 0) break;
    resultados.push({ ref: f.ref, tipo: f.tipo, titulo: f.titulo, fragmento: frag });
    usado += frag.length + f.titulo.length;
  }
  return { resultados, ...(resultados.length === 0 ? { nota: 'Sin coincidencias' } : {}) };
}

/** Lee un documento (`doc:N`) o producto (`prod:N`) por tramos. `desde` permite seguir leyendo. */
export function leerKb(
  db: Db,
  office: string,
  ref: string,
  desde = 0,
): { ref: string; titulo: string; tipo: string; texto: string; siguiente?: number } | null {
  const m = /^(doc|prod):(\d+)$/.exec(ref.trim());
  if (!m) return null;
  const f = fuentes(db, office).find((x) => x.ref === `${m[1]}:${m[2]}`);
  if (!f) return null;
  const texto = f.cuerpo.slice(desde, desde + TOPE_LECTURA);
  const fin = desde + TOPE_LECTURA;
  return {
    ref: f.ref,
    titulo: f.titulo,
    tipo: f.tipo,
    texto,
    ...(fin < f.cuerpo.length ? { siguiente: fin } : {}),
  };
}
