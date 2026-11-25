export interface LineaDiff {
  tipo: 'igual' | 'quitada' | 'agregada';
  texto: string;
}

/** Diferencia por líneas (LCS). Los textos de prompts son cortos, así que O(n·m) es suficiente. */
export function diffLineas(antes: string, despues: string): LineaDiff[] {
  const a = antes.split('\n');
  const b = despues.split('\n');
  const t: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  const out: LineaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ tipo: 'igual', texto: a[i]! });
      i++;
      j++;
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) out.push({ tipo: 'quitada', texto: a[i++]! });
    else out.push({ tipo: 'agregada', texto: b[j++]! });
  }
  while (i < a.length) out.push({ tipo: 'quitada', texto: a[i++]! });
  while (j < b.length) out.push({ tipo: 'agregada', texto: b[j++]! });
  return out;
}

export const estimarTokens = (t: string): number => Math.ceil(t.length / 3.6);
