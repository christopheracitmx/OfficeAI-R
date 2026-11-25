import { cerrarCorrida } from '../services/admin';
import { RunnerBase } from './base';
import { leerCorrida, progresoDe } from './datos';
import type { Ejecucion, EstadoRunner, OficinaDef } from './estado';
import { FinCorrida, type EstadoFinal } from './fin';
import { ejecutarFases, type FlujoCtx, type ItemRef, type PasoSpec } from './flujo';
import { escalar, plantilla, validarConsultas, verdadero } from './workflow';

export { FinCorrida, type EstadoFinal };
export type { EstadoRunner, RunnerDeps, OficinaDef, Gancho } from './estado';

/**
 * Orquestador genérico dirigido por datos: ejecuta el workflow de la oficina de la corrida.
 * No sabe de prospectos ni de ningún negocio concreto. Un solo pipeline activo a la vez.
 */
export class Runner extends RunnerBase implements FlujoCtx {
  private fin: Promise<void> = Promise.resolve();

  /** Valida todas las consultas de los workflows (sintaxis y solo lectura) al arrancar. */
  validar(): void {
    for (const o of Object.values(this.d.oficinas)) validarConsultas(this.d.db, o.workflow);
  }

  estado(): EstadoRunner {
    const e = this.ej;
    return {
      activo: e !== null,
      office_id: e?.corrida.office_id ?? null,
      corrida_id: e?.corrida.id ?? null,
      motor: this.motor,
      fase: e?.fase ?? null,
      item_actual: e?.item ?? null,
      paso_actual: e?.paso ?? null,
      pasos_ejecutados: e?.pasos ?? 0,
      pasos_max: e ? this.pasosMax(e) : 0,
      fallos_seguidos: e?.fallos ?? 0,
      resumen: e ? { ...e.resumen } : {},
      progreso: e ? progresoDe(this.d.db, e.oficina.workflow, e.corrida) : [],
    };
  }

  oficinasIds(): string[] {
    return Object.keys(this.d.oficinas);
  }

  oficina(id: string): OficinaDef | undefined {
    return this.d.oficinas[id];
  }

  /** Pasos de una oficina con sus prompts (para la vista «prompt final» de la UI). */
  pasosDe(
    office: string,
  ): { paso: string; agente: string; roles: string[]; prompts: string[]; modelo: string | null }[] {
    const wf = this.d.oficinas[office]?.workflow;
    return Object.entries(wf?.pasos ?? {}).map(([paso, p]) => ({
      paso,
      agente: p.agente,
      roles: p.roles,
      prompts: p.prompts,
      modelo: p.modelo ?? this.d.cfg.modelo ?? null,
    }));
  }

  /** Prompt exacto que recibiría un paso (con contexto de ejemplo). No lanza nada. */
  promptFinal(office: string, paso: string, extras: string[] = []): string | null {
    const p = this.d.oficinas[office]?.workflow.pasos[paso];
    if (!p) return null;
    return this.d.prompts.armar(
      {
        id: p.agente,
        roles: p.roles,
        prompts: p.prompts,
        herramientas: p.herramientas,
        webSearch: p.web,
        maxTurnos: p.max_turnos,
        modelo: p.modelo,
      },
      { id: 0, office_id: office, params: { ejemplo: 'vista previa' } },
      extras,
    );
  }

  /** Arranca el pipeline de una corrida YA registrada y en curso. Nada corre sin esto. */
  iniciar(corridaId: number, opts: { ignorarReserva?: boolean } = {}): void {
    if (this.ej) throw new Error('Ya hay un pipeline activo; solo se permite uno a la vez');
    const c = leerCorrida(this.d.db, corridaId);
    if (!c || c.estado !== 'en_curso') throw new Error('La corrida no existe o no está en curso');
    const oficina = this.d.oficinas[c.office_id];
    if (!oficina) throw new Error(`Oficina desconocida: ${c.office_id}`);
    const ej: Ejecucion = {
      corrida: c,
      oficina,
      abort: new AbortController(),
      inicio: Date.now(),
      fallos: 0,
      pasos: 0,
      porClave: new Map(),
      fase: 'iniciando',
      item: null,
      paso: null,
      cuotaAgotada: false,
      resumen: Object.fromEntries(Object.keys(oficina.workflow.resultados).map((k) => [k, 0])),
      salidaPrevia: '',
      ignorarReserva: opts.ignorarReserva === true,
    };
    this.ej = ej;
    this.fin = this.correr(ej);
  }

  /** Aborta procesos hijos y cierra la corrida como detenida. */
  async detener(corridaId: number): Promise<boolean> {
    if (!this.ej || this.ej.corrida.id !== corridaId) return false;
    this.ej.abort.abort();
    await this.fin;
    return true;
  }

  esperarFin(): Promise<void> {
    return this.fin;
  }

  /** Al arrancar el servidor: una corrida "en curso" sin runner quedó huérfana. */
  recuperarHuerfanas(): number {
    return this.d.db
      .prepare(
        "UPDATE corridas SET estado='error', motivo_fin='El servidor se reinició durante la corrida', terminada_en=? WHERE estado='en_curso'",
      )
      .run(new Date().toISOString()).changes;
  }

  contar(resultado: string): void {
    const e = this.ej!;
    e.resumen[resultado] = (e.resumen[resultado] ?? 0) + 1;
    e.item = null;
  }

  lanzarLote(paso: string, mensaje: string) {
    return this.lanzar(paso, mensaje);
  }

  async gancho(nombre: string, itemId: number): Promise<void> {
    const e = this.ej!;
    const g = e.oficina.ganchos[nombre];
    if (!g) throw new Error(`Gancho desconocido en la oficina ${e.corrida.office_id}: ${nombre}`);
    try {
      await g({
        db: this.d.db,
        itemId,
        corridaId: e.corrida.id,
        evento: (agente, accion, detalle) => this.evento(agente, accion, detalle, itemId),
      });
      this.guardarSalidaCodigo(nombre, itemId, true, 'Ejecutado por el sistema');
    } catch (err) {
      this.guardarSalidaCodigo(
        nombre,
        itemId,
        false,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  /** Mensaje de trabajo: plantilla de la oficina con solo ids, tarea y variables SQL. */
  private mensaje(item: ItemRef, tarea: string, extra?: string): string {
    const e = this.ej!;
    const p = {
      corrida: e.corrida.id,
      meta: Number(e.corrida.params[this.wf.tope_items] ?? 0),
      item: item.id,
    };
    const vars: Record<string, unknown> = {
      ...e.corrida.params,
      item: item.id,
      nombre: item.nombre,
      corrida: e.corrida.id,
      tarea,
      extra,
      salida_previa: e.salidaPrevia.slice(0, 1500),
    };
    for (const [k, q] of Object.entries(this.wf.variables)) vars[k] = escalar(this.d.db, q, p);
    return plantilla(this.wf.mensajes.item, vars);
  }

  private verificar(spec: PasoSpec, item: ItemRef, antes: number): string | null {
    const p = { corrida: this.corrida.id, meta: 0, item: item.id };
    const falta = spec.falta ?? 'el resultado esperado no quedó guardado';
    if (spec.verifica) return verdadero(escalar(this.d.db, spec.verifica, p)) ? null : falta;
    if (spec.aumenta) return Number(escalar(this.d.db, spec.aumenta, p)) > antes ? null : falta;
    return null;
  }

  /** Lanza un paso para un elemento y lo verifica contra la base (no contra el texto del agente). */
  async paso(pasoId: string, item: ItemRef, spec: PasoSpec): Promise<boolean> {
    try {
      return await this.pasoInterno(pasoId, item, spec);
    } finally {
      // La salida previa solo alimenta al paso inmediato siguiente.
      if (!spec.pasa_salida && this.ej) this.ej.salidaPrevia = '';
    }
  }

  private async pasoInterno(pasoId: string, item: ItemRef, spec: PasoSpec): Promise<boolean> {
    const e = this.ej!;
    const def = this.wf.pasos[pasoId]!;
    const clave = `${item.id}:${pasoId}`;
    const veces = (e.porClave.get(clave) ?? 0) + 1;
    e.porClave.set(clave, veces);
    if (veces > this.wf.topes.max_repeticiones_paso) {
      this.evento(
        this.wf.coordinador,
        'cortó un bucle',
        `${def.agente} repetido en ${item.nombre ?? item.id}`,
        item.id,
      );
      return false;
    }
    e.item = item;
    const p = { corrida: e.corrida.id, meta: 0, item: item.id };
    const antes = spec.aumenta ? Number(escalar(this.d.db, spec.aumenta, p)) : 0;
    this.evento(this.wf.coordinador, `asignó a ${def.roles.join(' + ')}`, item.nombre, item.id);
    let faltante: string | null = null;
    for (let intento = 0; intento < 2; intento++) {
      const extra =
        intento === 0
          ? spec.extra
          : `${spec.extra ? `${spec.extra} — ` : ''}REINTENTO: ${faltante}. Guarda el resultado con la herramienta correspondiente.`;
      const r = await this.lanzar(pasoId, this.mensaje(item, spec.tarea, extra), item.id);
      if (!r.ok) {
        faltante = r.error ?? 'el paso anterior falló';
        if (r.timeout) break;
        continue;
      }
      faltante = this.verificar(spec, item, antes);
      if (faltante === null) {
        e.fallos = 0;
        if (spec.pasa_salida) e.salidaPrevia = r.salida;
        return true;
      }
      if (/needs_human/i.test(r.salida)) break;
    }
    this.registrarFallo(`${def.agente} · ${item.nombre ?? item.id}: ${faltante}`);
    return false;
  }

  private async correr(e: Ejecucion): Promise<void> {
    const coord = this.wf.coordinador;
    let fin: FinCorrida;
    try {
      this.evento(coord, 'inició la corrida', `#${e.corrida.id} · ${this.wf.titulo}`);
      await ejecutarFases(this);
      fin = e.cuotaAgotada
        ? new FinCorrida('pausada_cuota_places', 'Cuota agotada: se procesó lo descubierto')
        : new FinCorrida('terminada', this.resumenTexto(e));
    } catch (err) {
      if (err instanceof FinCorrida) fin = err;
      else {
        console.error('[runner]', err);
        fin = new FinCorrida(
          'error',
          `Error inesperado: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const motivo =
      fin.estado === 'terminada' || fin.estado === 'detenida'
        ? fin.motivo
        : `${fin.motivo} · ${this.resumenTexto(e)}`;
    cerrarCorrida(this.d.db, e.corrida.id, fin.estado, motivo.slice(0, 500));
    this.evento(coord, `corrida ${fin.estado.replace(/_/g, ' ')}`, motivo);
    this.ej = null;
  }

  private resumenTexto(e: Ejecucion): string {
    const etiquetas = e.oficina.workflow.resultados;
    const partes = Object.entries(e.resumen).map(([k, n]) => `${etiquetas[k] ?? k} ${n}`);
    return `${partes.join(', ')} (${e.pasos} pasos)`;
  }
}
