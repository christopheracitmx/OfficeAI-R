import { expect } from 'vitest';
import { corridaBody, type Montaje } from './runner-helpers';

export const estadoCorrida = (mm: Montaje, id: number) =>
  mm.db.prepare('SELECT estado, motivo_fin FROM corridas WHERE id = ?').get(id) as {
    estado: string;
    motivo_fin: string | null;
  };
export const prospectos = (mm: Montaje) =>
  mm.db.prepare('SELECT estado FROM prospectos ORDER BY id').all() as { estado: string }[];
export const agentes = (mm: Montaje) => mm.llamadas().map((l) => l.agente);

export async function correr(mm: Montaje, max = 2): Promise<number> {
  const r = await mm.post('/api/corridas', corridaBody(max));
  expect(r.status).toBe(201);
  await mm.runner.esperarFin();
  return r.body.id as number;
}
