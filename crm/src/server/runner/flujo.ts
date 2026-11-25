import type { Db } from '../db';
import type { CorridaFila } from './datos';
import type { ResultadoAgente } from './types';
import {
  escalar,
  plantilla,
  verdadero,
  type NodoCiclo,
  type Params,
  type Variante,
  type Workflow,
} from './workflow';

export interface ItemRef {
  id: number;
  nombre?: string | undefined;
}

export interface PasoSpec {
  tarea: string;
  verifica?: string | undefined;
  aumenta?: string | undefined;
  falta?: string | undefined;
  extra?: string | undefined;
  pasa_salida?: boolean | undefined;
}

type NodoEjecutable = PasoSpec & {
  paso: string;
  si?: string | undefined;
  sin_agrupar?: (PasoSpec & { paso: string; si?: string | undefined })[] | undefined;
};

type FaseDe<T extends string> = Extract<Workflow['fases'][number], { tipo: T }>;

/** Lo que el intérprete de workflows necesita del runner. */
export interface FlujoCtx {
  db: Db;
  wf: Workflow;
  corrida: CorridaFila;
  agrupar: boolean;
  capacidad(nombre?: string): boolean;
  fase(nombre: string): void;
  evento(agente: string, accion: string, detalle: string | undefined, itemId?: number): void;
  chequear(): void;
  lanzarLote(paso: string, mensaje: string): Promise<ResultadoAgente>;
  paso(paso: string, item: ItemRef, spec: PasoSpec): Promise<boolean>;
  registrarFallo(detalle: string): void;
  marcarCuota(): void;
  gancho(nombre: string, itemId: number): Promise<void>;
  contar(resultado: string): void;
}

const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function parametros(c: FlujoCtx, item?: ItemRef): Params {
  return {
    corrida: c.corrida.id,
    meta: Number(c.corrida.params[c.wf.tope_items] ?? 0),
    item: item?.id ?? null,
  };
}

const rolPrincipal = (c: FlujoCtx, paso: string): string => c.wf.pasos[paso]!.roles[0]!;

/** Descubrimiento hasta el tope: cada fuente se intenta en orden y completa lo que falte. */
async function descubrir(c: FlujoCtx, f: FaseDe<'descubrir'>): Promise<void> {
  c.fase(f.id);
  const p = parametros(c);
  const meta = Number(p['meta']);
  const cuenta = (): number => Number(escalar(c.db, f.cuenta, p) ?? 0);
  const vars = (faltan: number): Record<string, unknown> => ({
    ...c.corrida.params,
    corrida: c.corrida.id,
    faltan,
  });
  let n = cuenta();
  let sinCuota = false;
  for (const fuente of f.fuentes) {
    if (n >= meta) break;
    if (!c.capacidad(fuente.requiere)) {
      c.evento(
        rolPrincipal(c, fuente.paso),
        'omitido',
        `${fuente.requiere} desactivado o sin llave`,
      );
      continue;
    }
    if (fuente.agotado && verdadero(escalar(c.db, fuente.agotado, p))) {
      sinCuota = true;
      c.evento(rolPrincipal(c, fuente.paso), 'omitido', 'Cuota mensual agotada');
      continue;
    }
    for (let ronda = 0; ronda < fuente.rondas && n < meta; ronda++) {
      const antes = n;
      const r = await c.lanzarLote(fuente.paso, plantilla(fuente.mensaje, vars(meta - n)));
      if (!r.ok) c.registrarFallo(`${fuente.paso}: ${r.error ?? 'falló'}`);
      if (r.cuota_agotada || (fuente.agotado && verdadero(escalar(c.db, fuente.agotado, p))))
        sinCuota = true;
      n = cuenta();
      if (n === antes) break;
    }
  }
  if (sinCuota && n < meta) c.marcarCuota();
  c.evento(c.wf.coordinador, 'cerró el descubrimiento', `${Math.min(n, meta)} de ${meta}`);
}

async function lote(c: FlujoCtx, f: FaseDe<'lote'>): Promise<void> {
  if (f.solo_agrupado && !c.agrupar) return;
  c.fase(f.id);
  const filas = c.db.prepare(f.items).raw().all(parametros(c)) as unknown[][];
  if (filas.length === 0) return;
  const ids = filas.map((x) => String(x[0])).join(',');
  const r = await c.lanzarLote(
    f.paso,
    plantilla(f.mensaje, { ...c.corrida.params, corrida: c.corrida.id, ids }),
  );
  if (!r.ok) c.registrarFallo(`${f.paso}: ${r.error ?? 'falló'}`);
}

function destino(
  d: NodoCiclo['devolucion'],
  texto: string | null,
  origen: string | null,
  agrupar: boolean,
): string {
  const t = sinAcentos((texto ?? '').toLowerCase());
  const elegir = (v: Variante): string =>
    typeof v === 'string' ? v : agrupar ? v.agrupado : v.separado;
  for (const [clave, v] of Object.entries(d.mapa)) if (t.includes(clave)) return elegir(v);
  const porDefecto = d.defecto[origen ?? ''] ?? Object.values(d.defecto)[0];
  if (!porDefecto) throw new Error('workflow: devolución sin destino ni valor por defecto');
  return elegir(porDefecto);
}

/** Ejecuta un nodo (o su variante sin agrupar). Devuelve false si el paso no se logró. */
async function ejecutarNodo(
  c: FlujoCtx,
  item: ItemRef,
  n: NodoEjecutable,
  extra?: string,
): Promise<boolean> {
  const p = parametros(c, item);
  const lista = !c.agrupar && n.sin_agrupar ? n.sin_agrupar : [n];
  for (const s of lista) {
    if (s !== n && s.si && !verdadero(escalar(c.db, s.si, p))) continue;
    const ok = await c.paso(s.paso, item, { ...s, ...(extra ? { extra } : {}) });
    if (!ok) return false;
  }
  return true;
}

interface Devolucion {
  id: number;
  pendiente: number;
  origen: string | null;
  destino: string | null;
  motivos: string | null;
}

async function ciclo(
  c: FlujoCtx,
  item: ItemRef,
  n: NodoCiclo,
  terminal: () => string | null,
): Promise<string> {
  const p = parametros(c, item);
  let atendida = 0;
  for (let vuelta = 0; vuelta < n.max_vueltas; vuelta++) {
    c.chequear();
    const t = terminal();
    if (t) return t;
    const dev = c.db.prepare(n.devolucion.consulta).get(p) as Devolucion | undefined;
    if (dev && verdadero(dev.pendiente) && dev.id !== atendida) {
      const paso = destino(n.devolucion, dev.destino, dev.origen, c.agrupar);
      let motivos: string[] = [];
      try {
        motivos = dev.motivos ? (JSON.parse(dev.motivos) as string[]) : [];
      } catch {
        /* motivos mal formados */
      }
      c.evento(
        c.wf.coordinador,
        'devolvió el elemento',
        `${dev.destino ?? paso}: ${motivos[0] ?? ''}`,
        item.id,
      );
      const extra = `DEVOLUCIÓN de ${(dev.origen ?? 'revisión').toUpperCase()}: ${motivos.join(' | ') || 'sin motivo detallado'}`;
      const ok = await ejecutarNodo(
        c,
        item,
        { paso, tarea: 'Corrige lo señalado en la devolución.' },
        extra,
      );
      atendida = dev.id;
      if (!ok) return 'incompleta';
      continue;
    }
    const etapa = n.etapas.find((e) => verdadero(escalar(c.db, e.si, p)));
    if (etapa) {
      if (!(await ejecutarNodo(c, item, etapa))) return 'incompleta';
      continue;
    }
    if (n.cierre.gancho) await c.gancho(n.cierre.gancho, item.id);
    return terminal() ?? 'incompleta';
  }
  return 'incompleta';
}

async function porItem(c: FlujoCtx, f: FaseDe<'por_item'>): Promise<void> {
  c.fase(f.id);
  const items = c.db.prepare(f.items).all(parametros(c)) as ItemRef[];
  for (const item of items) {
    c.chequear();
    const p = parametros(c, item);
    const terminal = (): string | null => {
      for (const t of f.terminales) if (verdadero(escalar(c.db, t.si, p))) return t.resultado;
      return null;
    };
    let resultado: string | null = null;
    for (const nodo of f.flujo) {
      resultado = terminal();
      if (resultado) break;
      if (nodo.tipo === 'ciclo') {
        resultado = await ciclo(c, item, nodo, terminal);
        break;
      }
      if (nodo.si && !verdadero(escalar(c.db, nodo.si, p))) continue;
      if (!(await ejecutarNodo(c, item, nodo))) {
        resultado = 'incompleta';
        break;
      }
    }
    c.contar(resultado ?? terminal() ?? 'incompleta');
  }
}

export async function ejecutarFases(c: FlujoCtx): Promise<void> {
  for (const f of c.wf.fases) {
    c.chequear();
    if (f.tipo === 'descubrir') await descubrir(c, f);
    else if (f.tipo === 'lote') await lote(c, f);
    else await porItem(c, f);
  }
}
