/**
 * Composición de apariencias: definición base (la «plantilla») + preset + cambios del usuario
 * (overrides), capa por capa, validando campo por campo (lo inválido se descarta). Los cambios de
 * distribución (tamaño, posición, puestos, planta) solo se aceptan si el plano sigue siendo válido.
 * Puro y compartido: el servidor compone al servir/guardar y la UI compone al instante para la
 * vista previa con el MISMO código.
 */
import { z } from 'zod';
import {
  aparienciaOficina,
  aparienciaPersonaje,
  aparienciaSala,
  type AparienciaOficina,
  type AparienciaPersonaje,
} from './apariencia';
import { definicionOficina, type DefinicionOficina, type SalaDef } from './definicion';
import { ajustePuestos, distribuirPuestos, erroresNuevos, type Distribucion } from './plano';

export const ENTIDADES = ['personaje', 'sala', 'oficina'] as const;
export type Entidad = (typeof ENTIDADES)[number];
export const clave = (e: Entidad, id: string): string => `${e}:${id}`;

const celda = z.number().int().min(0).max(80);
/** Campos de distribución de una sala (viven junto a la apariencia pero afectan al plano). */
export const CAMPOS_PLANO = ['ancho', 'fondo', 'x', 'z', 'puestos'] as const;
type Forma = Record<string, z.ZodType>;
export const FORMAS: Record<Entidad, Forma> = {
  personaje: aparienciaPersonaje.shape,
  sala: { ...aparienciaSala.shape, x: celda, z: celda, puestos: ajustePuestos },
  oficina: aparienciaOficina.shape,
};

export type Campos = Record<string, unknown>;
export interface CapaResuelta {
  /** JSON del preset aplicado (ya resuelto), si lo hay. */
  preset?: Campos | null | undefined;
  overrides?: Campos | undefined;
}
export type Capas = Readonly<Record<string, CapaResuelta | undefined>>;

export class ErrorComposicion extends Error {}

/** Valida un objeto de campos contra la forma de la entidad. Devuelve lo válido y los errores. */
export function validarCampos(
  entidad: Entidad,
  entrada: unknown,
): { ok: Campos; errores: string[] } {
  const ok: Campos = {};
  const errores: string[] = [];
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada))
    return { ok, errores: ['La apariencia debe ser un objeto'] };
  const forma = FORMAS[entidad];
  for (const [k, v] of Object.entries(entrada)) {
    const esquema = forma[k];
    if (!esquema) {
      errores.push(`Campo desconocido: ${k}`);
      continue;
    }
    const r = esquema.safeParse(v);
    if (r.success) ok[k] = r.data;
    else errores.push(`${k}: ${r.error.issues[0]?.message ?? 'valor inválido'}`);
  }
  return { ok, errores };
}

type Aviso = (mensaje: string) => void;

/** Capas en orden (preset, luego overrides): el último valor válido de cada campo gana. */
function fusionar(entidad: Entidad, capa: CapaResuelta | undefined, aviso: Aviso, que: string) {
  const r: Campos = {};
  for (const fuente of [capa?.preset, capa?.overrides]) {
    if (!fuente) continue;
    const { ok, errores } = validarCampos(entidad, fuente);
    Object.assign(r, ok);
    errores.forEach((e) => aviso(`${que}: ${e}`));
  }
  return r;
}

const sinPlano = (c: Campos): Campos =>
  Object.fromEntries(
    Object.entries(c).filter(([k]) => !(CAMPOS_PLANO as readonly string[]).includes(k)),
  );

function distInferida(s: SalaDef, d: DefinicionOficina): Distribucion {
  const filas = new Set(d.puestos.filter((p) => p.sala === s.id).map((p) => Math.round(p.z)));
  return filas.size <= 1 ? 'fila' : filas.size === 2 ? 'doble_fila' : 'cuadricula';
}

/** Intenta un cambio de plano sobre la sala; devuelve el candidato o el motivo del rechazo. */
function probarSala(
  d: DefinicionOficina,
  id: string,
  p: Campos,
): { def: DefinicionOficina } | { error: string } {
  const c: DefinicionOficina = structuredClone(d);
  const s = c.salas.find((x) => x.id === id)!;
  const cambioTamano = p['ancho'] !== undefined || p['fondo'] !== undefined;
  if (p['ancho'] !== undefined) s.apariencia.ancho = p['ancho'] as number;
  if (p['fondo'] !== undefined) s.apariencia.fondo = p['fondo'] as number;
  if (p['x'] !== undefined) s.x = p['x'] as number;
  if (p['z'] !== undefined) s.z = p['z'] as number;
  const largo =
    s.puerta.lado === 'n' || s.puerta.lado === 's' ? s.apariencia.ancho : s.apariencia.fondo;
  if (s.puerta.pos > largo - 0.5) s.puerta.pos = Math.max(0.5, largo - 0.5);
  const ocupados = new Set(c.agentes.map((a) => a.puesto));
  const propios = c.puestos.filter((x) => x.sala === id);
  let ajuste = p['puestos'] as z.infer<typeof ajustePuestos> | undefined;
  if (!ajuste && cambioTamano && erroresNuevos(d, c).length > 0)
    ajuste = { cantidad: propios.length, distribucion: distInferida(s, d) };
  if (ajuste) {
    const nuevos = distribuirPuestos(s, c.puestos, ocupados, ajuste);
    if (!nuevos)
      return { error: `no caben ${ajuste.cantidad} puestos (o hay agentes que los usan)` };
    c.puestos = [...c.puestos.filter((x) => x.sala !== id), ...nuevos];
  }
  const e = erroresNuevos(d, c);
  return e.length === 0 ? { def: c } : { error: e.join('; ') };
}

/**
 * Compone la definición efectiva. `estricto` lanza ErrorComposicion ante cualquier campo inválido
 * o cambio de plano imposible (lo usa el servidor al guardar); si no, descarta y lo reporta.
 */
export function componerDefinicion(
  base: DefinicionOficina,
  capas: Capas,
  estricto = false,
): { def: DefinicionOficina; descartes: string[] } {
  const descartes: string[] = [];
  const aviso: Aviso = (m) => {
    if (estricto) throw new ErrorComposicion(m);
    descartes.push(m);
  };
  let d: DefinicionOficina = structuredClone(base);

  // Oficina (paleta, marca, logo, ciclo, calidad, fachada); la planta se prueba aparte.
  const mo = fusionar('oficina', capas[clave('oficina', d.office.id)], aviso, 'Oficina');
  const ap = { ...d.office.apariencia, ...mo } as AparienciaOficina;
  d.office.apariencia = ap;
  if (ap.logo === 'ninguno') d.office.logo = null;
  else if (ap.logo === 'url' && ap.logoUrl) d.office.logo = ap.logoUrl;

  // Personajes
  for (const a of d.agentes) {
    const m = fusionar('personaje', capas[clave('personaje', a.id)], aviso, `Personaje ${a.id}`);
    a.apariencia = { ...a.apariencia, ...m } as AparienciaPersonaje;
    a.genero = a.apariencia.cuerpo;
    a.persona = a.apariencia.nombre ?? a.persona;
  }

  const plantaPedida = ap.planta;
  const aplicarPlanta = () => {
    if (!plantaPedida) return;
    const cand = { ...d, planta: { ...d.planta, ...plantaPedida } };
    const e = erroresNuevos(d, cand);
    if (e.length === 0) d = cand;
    else aviso(`Planta: ${e.join('; ')}`);
  };
  const crece =
    !!plantaPedida && plantaPedida.ancho >= d.planta.ancho && plantaPedida.fondo >= d.planta.fondo;
  if (crece) aplicarPlanta();

  // Salas: lo visual se aplica siempre; el plano solo si sigue siendo válido.
  for (const id of d.salas.map((x) => x.id)) {
    const m = fusionar('sala', capas[clave('sala', id)], aviso, `Sala ${id}`);
    const sala = d.salas.find((x) => x.id === id)!;
    sala.apariencia = { ...sala.apariencia, ...sinPlano(m) } as SalaDef['apariencia'];
    const plano = Object.fromEntries(
      Object.entries(m).filter(([k]) => (CAMPOS_PLANO as readonly string[]).includes(k)),
    );
    if (Object.keys(plano).length === 0) continue;
    const r = probarSala(d, id, plano);
    if ('def' in r) d = r.def;
    else aviso(`Sala ${id}: ${r.error}`);
  }
  if (!crece) aplicarPlanta();

  const final = definicionOficina.safeParse(d);
  if (!final.success) {
    aviso(`La definición resultante no es válida: ${final.error.issues[0]?.message ?? ''}`);
    return { def: base, descartes };
  }
  return { def: final.data, descartes };
}
