import type { Db } from '../db';
import { ColaIa, type EstadoCola } from './cola';
import { leerCorrida } from './datos';
import type { EstadoRunner, OficinaDef } from './estado';
import type { ConfigRunner } from './motor';
import type { Runner } from './runner';
import type { Motor } from './types';

export interface EstadoEdificio extends EstadoRunner {
  /** Oficinas con una corrida en curso ahora (puede haber varias; la IA corre de una en una). */
  activos: { office_id: string; corrida_id: number }[];
  cola: EstadoCola;
}

/**
 * Edificio: un Runner por oficina (una corrida activa por oficina) que comparten UNA cola global de
 * llamadas de IA y el estado del plan (global en la base). Expone la misma interfaz que el Runner
 * de una oficina para que las rutas no cambien.
 */
export class RunnerEdificio {
  readonly cola = new ColaIa();
  private runners = new Map<string, Runner>();
  /** Construye el Runner de una oficina (lo fija crearRunner; usa la cola global). */
  fabrica: ((officeId: string) => Runner) | null = null;
  /** Reglas extra antes de iniciar (oficina archivada, flujo no ejecutable...). Lanza si no procede. */
  validarInicio: ((officeId: string) => void) | null = null;

  constructor(
    readonly cfg: ConfigRunner,
    private readonly db: Db,
  ) {}

  get motor(): Motor {
    return this.cfg.engine;
  }

  /** Registra (o reemplaza si está inactiva) el runner de una oficina nueva o editada. */
  alta(officeId: string): void {
    if (!this.fabrica) throw new Error('Edificio sin fábrica de runners');
    const actual = this.runners.get(officeId);
    if (actual?.estado().activo) throw new Error('La oficina tiene una corrida en curso');
    this.runners.set(officeId, this.fabrica(officeId));
  }

  registrar(officeId: string, r: Runner): void {
    this.runners.set(officeId, r);
  }

  baja(officeId: string): void {
    this.runners.delete(officeId);
  }

  validar(): void {
    for (const r of this.runners.values()) r.validar();
  }

  oficinasIds(): string[] {
    return [...this.runners.keys()];
  }

  oficina(id: string): OficinaDef | undefined {
    return this.runners.get(id)?.oficina(id);
  }

  estaActiva(officeId: string): boolean {
    return this.runners.get(officeId)?.estado().activo ?? false;
  }

  /** Estado de una oficina, o (sin argumento) de la primera con corrida; si ninguna, el inactivo. */
  estado(officeId?: string): EstadoEdificio {
    const vivos = [...this.runners.entries()].filter(([, r]) => r.estado().activo);
    const activos = vivos.flatMap(([id, r]) => {
      const e = r.estado();
      return e.corrida_id === null ? [] : [{ office_id: id, corrida_id: e.corrida_id }];
    });
    const elegido = officeId
      ? this.runners.get(officeId)
      : (vivos[0]?.[1] ?? [...this.runners.values()][0]);
    const base: EstadoRunner = elegido?.estado() ?? {
      activo: false,
      office_id: null,
      corrida_id: null,
      motor: this.motor,
      fase: null,
      item_actual: null,
      paso_actual: null,
      pasos_ejecutados: 0,
      pasos_max: 0,
      fallos_seguidos: 0,
      resumen: {},
      progreso: [],
    };
    return { ...base, activos, cola: this.cola.estado() };
  }

  pasosDe(office: string) {
    return this.runners.get(office)?.pasosDe(office) ?? [];
  }

  promptFinal(office: string, paso: string, extras: string[] = []): string | null {
    return this.runners.get(office)?.promptFinal(office, paso, extras) ?? null;
  }

  /** Arranca la corrida YA registrada en la oficina que le corresponde (una por oficina). */
  iniciar(corridaId: number, opts: { ignorarReserva?: boolean } = {}): void {
    const c = leerCorrida(this.db, corridaId);
    if (!c || c.estado !== 'en_curso') throw new Error('La corrida no existe o no está en curso');
    const r = this.runners.get(c.office_id);
    if (!r) throw new Error(`Oficina desconocida: ${c.office_id}`);
    this.validarInicio?.(c.office_id);
    r.iniciar(corridaId, opts);
  }

  async detener(corridaId: number): Promise<boolean> {
    for (const r of this.runners.values()) if (await r.detener(corridaId)) return true;
    return false;
  }

  async esperarFin(): Promise<void> {
    await Promise.all([...this.runners.values()].map((r) => r.esperarFin()));
  }

  /** Al arrancar el servidor: una corrida "en curso" sin runner quedó huérfana (global). */
  recuperarHuerfanas(): number {
    return [...this.runners.values()][0]?.recuperarHuerfanas() ?? 0;
  }

  /** Llamada suelta (reflexión, evaluación): pasa por la misma cola global. */
  llamarLibre(i: Parameters<Runner['llamarLibre']>[0]): ReturnType<Runner['llamarLibre']> {
    const r = this.runners.get(i.officeId) ?? [...this.runners.values()][0];
    if (!r) throw new Error('Edificio sin oficinas');
    return r.llamarLibre(i);
  }
}
