import type { ReactNode } from 'react';

/** Renderizador mínimo y seguro de Markdown (sin HTML crudo ni enlaces activos): títulos, listas, negritas, cursivas y código. */
function enLinea(t: string, clave: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let ultimo = 0;
  let n = 0;
  for (const m of t.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) out.push(t.slice(ultimo, i));
    const x = m[0];
    const k = `${clave}-${n++}`;
    if (x.startsWith('**')) out.push(<strong key={k}>{x.slice(2, -2)}</strong>);
    else if (x.startsWith('`'))
      out.push(
        <code key={k} className="rounded bg-ice px-1 text-[0.9em]">
          {x.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={k}>{x.slice(1, -1)}</em>);
    ultimo = i + x.length;
  }
  if (ultimo < t.length) out.push(t.slice(ultimo));
  return out;
}

export function Markdown({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: string[] = [];
  let ordenada = false;
  const cerrar = (k: string) => {
    if (lista.length === 0) return;
    const items = lista.map((x, i) => <li key={`${k}-${i}`}>{enLinea(x, `${k}-${i}`)}</li>);
    bloques.push(
      ordenada ? (
        <ol key={k} className="ml-5 list-decimal space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={k} className="ml-5 list-disc space-y-0.5">
          {items}
        </ul>
      ),
    );
    lista = [];
  };
  texto.split('\n').forEach((raw, i) => {
    const l = raw.trimEnd();
    const k = `b${i}`;
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l);
    if (li) {
      const num = /^\s*\d+\./.test(l);
      if (lista.length > 0 && num !== ordenada) cerrar(`${k}c`);
      ordenada = num;
      lista.push(li[1] ?? '');
      return;
    }
    cerrar(`${k}c`);
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const nivel = (h[1] ?? '#').length;
      bloques.push(
        <p key={k} className={nivel <= 2 ? 'mt-3 text-lg font-semibold' : 'mt-2 font-semibold'}>
          {enLinea(h[2] ?? '', k)}
        </p>,
      );
    } else if (l.trim()) bloques.push(<p key={k}>{enLinea(l, k)}</p>);
  });
  cerrar('fin');
  return <div className="space-y-1.5 leading-relaxed">{bloques}</div>;
}
