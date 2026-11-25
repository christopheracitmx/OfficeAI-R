import type { Db } from '../db';
import { registrarActividad } from '../services/events';
import { leerCorrida, type CorridaFila } from './datos';
import type { Ejecucion, RunnerDeps } from './estado';
import { FinCorrida } from './fin';
import { guardarLimites, motivoReserva } from './plan';
import type { ConfigRunner } from './motor';
import type { AgenteDef, Motor, ResultadoAgente } from './types';
import type { Workflow } from './workflow';

/** Base del runner: eventos, lanzamiento de un paso al motor, salidas por agente y circuit breaker. */
export class RunnerBase {
  protected ej: Ejecucion | null = null;
  private ultimaHerramienta = new Map<string, number>();

  constructor(protected readonly d: RunnerDeps) {}

  get db(): Db {
    return this.d.db;
  }
  get agrupar(): boolean {
    return this.d.cfg.agrupar_pasos;
  }
  get cfg(): ConfigRunner {
    return this.d.cfg;
  }
  get motor(): Motor {
    return this.d.cfg.engine;
  }
  get corrida(): CorridaFila {
    if (!this.ej) throw new Error('No hay corrida en ejecución');
    return this.ej.corrida;
  }
  get wf(): Workflow {
    if (!this.ej) throw new Error('No hay corrida en ejecución');
    return this.ej.oficina.workflow;
  }
  get activa(): number | null {
    return this.ej?.corrida.id ?? null;
  }

  capacidad(nombre?: string): boolean {
    return nombre === undefined || this.d.capacidades.has(nombre);
  }

  evento(agente: string, accion: string, detalle: string | undefined, itemId?: number): void {
    registrarActividad(this.d.db, this.d.bus, {
      agente,
      accion,
      detalle: detalle?.slice(0, 400),
      entidad: itemId ? this.wf.entidad_item : undefined,
      entidad_id: itemId,
      corrida_id: this.ej?.corrida.id,
      office_id: this.ej?.corrida.office_id,
    });
  }

  marcarCuota(): void {
    if (this.ej) this.ej.cuotaAgotada = true;
  }

  fase(nombre: string): void {
    if (this.ej) this.ej.fase = nombre;
  }

  protected pasosMax(e: Ejecucion): number {
    const t = e.oficina.workflow.topes;
    return (
      Number(e.corrida.params[e.oficina.workflow.tope_items] ?? 10) * t.pasos_por_item +
      t.pasos_extra
    );
  }

  chequear(): void {
    const e = this.ej!;
    if (e.abort.signal.aborted) throw new FinCorrida('detenida', 'Detenida por el dueño');
    if (leerCorrida(this.d.db, e.corrida.id)?.estado !== 'en_curso')
      throw new FinCorrida('detenida', 'Detenida por el dueño');
    if (Date.now() - e.inicio > this.d.cfg.max_minutos_corrida * 60_000)
      throw new FinCorrida(
        'error',
        `Tiempo máximo de la corrida (${this.d.cfg.max_minutos_corrida} min) excedido`,
      );
    if (!e.ignorarReserva) {
      const reserva = motivoReserva(this.d.db);
      if (reserva) throw new FinCorrida('pausada_reserva_plan', reserva);
    }
    if (e.pasos >= this.pasosMax(e))
      throw new FinCorrida(
        'error',
        `Circuit breaker: se superó el máximo de ${this.pasosMax(e)} pasos`,
      );
  }

  private definicion(pasoId: string): AgenteDef {
    const p = this.wf.pasos[pasoId]!;
    return {
      id: p.agente,
      roles: p.roles,
      prompts: p.prompts,
      herramientas: p.herramientas,
      webSearch: p.web,
      maxTurnos: p.max_turnos,
      maxLecturas: p.max_lecturas,
      modelo: p.modelo,
    };
  }

  /** Una llamada al motor. Traduce límites/abortos a FinCorrida, registra la salida y emite eventos. */
  async lanzar(pasoId: string, mensaje: string, itemId?: number): Promise<ResultadoAgente> {
    const e = this.ej!;
    this.chequear();
    const def = this.definicion(pasoId);
    const apagadas = Object.entries(this.wf.capacidades)
      .filter(([nombre]) => !this.capacidad(nombre))
      .map(([, c]) => [c.env, ''] as const);
    const mcpEnv: Record<string, string> = {
      ...this.d.mcpEnvBase,
      CRM_AGENT: def.id,
      CRM_OFFICE: e.corrida.office_id,
      CRM_TOOLS: def.herramientas.join(','),
      ...(def.maxLecturas ? { CRM_MAX_PAGINAS: String(def.maxLecturas) } : {}),
      ...Object.fromEntries(apagadas),
    };
    for (const rol of def.roles) this.evento(rol, 'recibió una tarea', mensaje, itemId);
    e.pasos++;
    e.paso = pasoId;
    const t0 = Date.now();
    const prompt = this.d.prompts.armar(def, e.corrida);
    const usadas: Record<string, number> = {};
    const r = await this.d.ejecutar({
      officeId: e.corrida.office_id,
      agente: def,
      prompt,
      mensaje,
      mcpEnv,
      timeout: this.d.cfg.timeout_paso_min * 60_000,
      signal: e.abort.signal,
      onProgreso: (p) => {
        usadas[p.nombre] = (usadas[p.nombre] ?? 0) + 1;
        this.alHerramienta(def.id, p.nombre, itemId);
      },
    });
    e.paso = null;
    if (r.plan) guardarLimites(this.d.db, r.plan, def.modelo ?? this.d.cfg.modelo);
    const resultado = r.abortado
      ? 'abortado'
      : r.limite_plan
        ? 'limite'
        : r.timeout
          ? 'timeout'
          : r.ok
            ? 'ok'
            : 'fallo';
    this.guardarSalida(def, pasoId, itemId, r, resultado, Date.now() - t0, {
      promptTokens: Math.ceil(prompt.length / 3.6),
      usadas,
    });
    if (r.abortado || e.abort.signal.aborted)
      throw new FinCorrida('detenida', 'Detenida por el dueño');
    if (r.limite_plan) {
      const cuando = r.reset_en
        ? ` Se libera aprox. ${new Date(r.reset_en * 1000).toLocaleString('es-MX')}.`
        : '';
      throw new FinCorrida('pausada_limite_plan', `Límite del plan de IA alcanzado.${cuando}`);
    }
    for (const rol of def.roles)
      this.evento(rol, r.ok ? 'terminó su tarea' : 'falló', r.ok ? r.salida : r.error, itemId);
    return r;
  }

  /** Alimenta salidas_agente (panel de cada agente): una fila por rol del paso, con el consumo repartido. */
  private guardarSalida(
    def: AgenteDef,
    paso: string,
    itemId: number | undefined,
    r: ResultadoAgente,
    resultado: string,
    ms: number,
    extra: { promptTokens: number; usadas: Record<string, number> },
  ): void {
    const e = this.ej!;
    const n = def.roles.length;
    const ins = this.d.db.prepare(
      `INSERT INTO salidas_agente (office_id, corrida_id, agente, rol, paso, item_id, tipo, resumen, contenido, tokens_estimados, tokens_brutos, duracion_ms, resultado, prompt_tokens, turnos, herramientas, modelo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const rol of def.roles)
      ins.run(
        e.corrida.office_id,
        e.corrida.id,
        rol,
        rol,
        paso,
        itemId ?? null,
        'paso',
        (r.ok ? r.salida : (r.error ?? r.salida)).slice(0, 300),
        (r.salida || r.error || '').slice(0, 8000),
        (r.tokens_ponderados ?? r.tokens) === undefined
          ? null
          : Math.ceil((r.tokens_ponderados ?? r.tokens ?? 0) / n),
        r.tokens === undefined ? null : Math.ceil(r.tokens / n),
        Math.round(ms / n),
        resultado,
        extra.promptTokens,
        r.turnos ?? null,
        JSON.stringify(extra.usadas),
        def.modelo ?? this.d.cfg.modelo ?? null,
      );
  }

  /** Paso hecho por código (no por un agente): también queda en las salidas. */
  guardarSalidaCodigo(nombre: string, itemId: number, ok: boolean, resumen: string): void {
    const e = this.ej!;
    this.d.db
      .prepare(
        `INSERT INTO salidas_agente (office_id, corrida_id, agente, rol, paso, item_id, tipo, resumen, resultado)
         VALUES (?,?,?,?,?,?,'codigo',?,?)`,
      )
      .run(
        e.corrida.office_id,
        e.corrida.id,
        this.wf.coordinador,
        this.wf.coordinador,
        nombre,
        itemId,
        resumen.slice(0, 300),
        ok ? 'ok' : 'fallo',
      );
  }

  private alHerramienta(agente: string, nombre: string, itemId?: number): void {
    const accion =
      nombre === 'WebSearch'
        ? 'buscó en la web'
        : nombre === 'obscura_extract'
          ? 'leyó una página'
          : null;
    if (!accion) return;
    const t = Date.now();
    if (t - (this.ultimaHerramienta.get(agente + accion) ?? 0) < 3000) return;
    this.ultimaHerramienta.set(agente + accion, t);
    this.evento(agente, accion, undefined, itemId);
  }

  registrarFallo(detalle: string): void {
    const e = this.ej!;
    e.fallos++;
    this.evento(this.wf.coordinador, 'registró un fallo', detalle);
    if (e.fallos >= this.d.cfg.max_fallos_seguidos)
      throw new FinCorrida(
        'error',
        `Circuit breaker: ${e.fallos} pasos fallidos seguidos (último: ${detalle})`,
      );
  }
}
