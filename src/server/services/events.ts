import { EventEmitter } from 'node:events';
import type { Db } from '../db';
import { nowIso } from '../db';

export interface ActividadEvento {
  id: number;
  corrida_id: number | null;
  agente: string;
  accion: string;
  entidad: string | null;
  entidad_id: number | null;
  detalle: string | null;
  creado_en: string;
}

export interface ActividadInput {
  agente: string;
  accion: string;
  entidad?: string | undefined;
  entidad_id?: number | undefined;
  detalle?: string | undefined;
  corrida_id?: number | undefined;
}

/** Bus en memoria: la pantalla "Ver oficina" y la bitácora se alimentan por SSE. */
export class EventBus extends EventEmitter {
  publish(e: ActividadEvento): void {
    this.emit('actividad', e);
  }
}

export function registrarActividad(db: Db, bus: EventBus, input: ActividadInput): ActividadEvento {
  const creado = nowIso();
  const r = db
    .prepare(
      `INSERT INTO actividad_agentes (corrida_id, agente, accion, entidad, entidad_id, detalle, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.corrida_id ?? null,
      input.agente,
      input.accion,
      input.entidad ?? null,
      input.entidad_id ?? null,
      input.detalle ?? null,
      creado,
    );
  const evento: ActividadEvento = {
    id: Number(r.lastInsertRowid),
    corrida_id: input.corrida_id ?? null,
    agente: input.agente,
    accion: input.accion,
    entidad: input.entidad ?? null,
    entidad_id: input.entidad_id ?? null,
    detalle: input.detalle ?? null,
    creado_en: creado,
  };
  bus.publish(evento);
  return evento;
}
