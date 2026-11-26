/**
 * Editor de plano básico: vista en planta con rejilla (SVG) + controles numéricos para mover y
 * redimensionar la sala elegida y fijar sus puestos. La validación es EN VIVO con el mismo código del
 * servidor (traslapes, límites, pasillo, puertas, puestos). Arrastrar/rotar queda como mejora.
 */
import type { Campos } from '../../shared/oficina3d/composicion';
import type { DefinicionOficina, SalaDef } from '../../shared/oficina3d/definicion';
import {
  DISTRIBUCIONES,
  ETQ_DISTRIBUCION,
  capacidadPuestos,
  type Distribucion,
} from '../../shared/oficina3d/plano';
import { CampoEd, type Ctx } from './campo';
import { Opciones } from './controles';
import type { Personalizador } from './usarApariencias';

function Numero({
  nombre,
  valor,
  min,
  max,
  onCambio,
}: {
  nombre: string;
  valor: number;
  min: number;
  max: number;
  onCambio: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="w-14 text-muted">{nombre}</span>
      <input
        type="number"
        aria-label={nombre}
        min={min}
        max={max}
        step={1}
        value={valor}
        onChange={(e) => {
          const n = Math.round(e.target.valueAsNumber);
          if (!Number.isNaN(n)) onCambio(Math.min(max, Math.max(min, n)));
        }}
        className="w-20 rounded-lg border border-line bg-white px-2 py-1 tabular-nums"
      />
    </label>
  );
}

export function PlanoSvg({
  def,
  selId,
  onSala,
  fantasma,
}: {
  def: DefinicionOficina;
  selId: string;
  onSala: (id: string) => void;
  fantasma?: { x: number; z: number; ancho: number; fondo: number } | null;
}) {
  const { ancho, fondo, pasilloZ } = def.planta;
  return (
    <svg
      viewBox={`-1 -1 ${ancho + 2} ${fondo + 2}`}
      className="w-full rounded-lg border border-line bg-white"
      role="group"
      aria-label={`Plano de la planta: ${def.salas.length} salas`}
    >
      <defs>
        <pattern id="rejilla" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0H0V1" fill="none" stroke="#dce6ea" strokeWidth="0.04" />
        </pattern>
      </defs>
      <rect width={ancho} height={fondo} fill="url(#rejilla)" stroke="#0F3D47" strokeWidth="0.12" />
      <rect x="0" y={pasilloZ - 0.5} width={ancho} height="1" fill="#F2B33D" opacity="0.25" />
      {def.salas.map((s: SalaDef) => (
        <g
          key={s.id}
          onClick={() => onSala(s.id)}
          role="button"
          tabIndex={0}
          aria-label={`Sala ${s.nombre}`}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSala(s.id)}
          className="cursor-pointer"
        >
          <rect
            x={s.x + 0.05}
            y={s.z + 0.05}
            width={s.apariencia.ancho - 0.1}
            height={s.apariencia.fondo - 0.1}
            fill={s.apariencia.colorPiso}
            stroke={s.id === selId ? '#007F7C' : s.apariencia.acento}
            strokeWidth={s.id === selId ? 0.28 : 0.12}
          />
          <text
            x={s.x + s.apariencia.ancho / 2}
            y={s.z + s.apariencia.fondo / 2}
            fontSize="0.9"
            textAnchor="middle"
            fill="#0F3D47"
            style={{ pointerEvents: 'none' }}
          >
            {s.nombre}
          </text>
        </g>
      ))}
      {def.puestos.map((p) => {
        const s = def.salas.find((x) => x.id === p.sala);
        return s ? (
          <circle key={p.id} cx={s.x + p.x} cy={s.z + p.z} r="0.28" fill="#0F3D47" />
        ) : null;
      })}
      {fantasma && (
        <rect
          x={fantasma.x}
          y={fantasma.z}
          width={fantasma.ancho}
          height={fantasma.fondo}
          fill="#D64545"
          fillOpacity="0.12"
          stroke="#D64545"
          strokeDasharray="0.4 0.3"
          strokeWidth="0.15"
        />
      )}
    </svg>
  );
}

export function PlanoSala({
  p,
  sala,
  baseDef,
  def,
  onSala,
}: {
  p: Personalizador;
  sala: SalaDef;
  baseDef: DefinicionOficina;
  def: DefinicionOficina;
  onSala: (id: string) => void;
}) {
  const { ancho, fondo } = sala.apariencia;
  const resumen = (d: DefinicionOficina, s: SalaDef, dist?: Distribucion) => {
    const ps = d.puestos.filter((x) => x.sala === s.id);
    const filas = new Set(ps.map((x) => Math.round(x.z))).size;
    const inferida: Distribucion = filas <= 1 ? 'fila' : filas === 2 ? 'doble_fila' : 'cuadricula';
    return { cantidad: ps.length, distribucion: dist ?? inferida };
  };
  const pedida = p.actual('sala', sala.id).overrides['puestos'] as
    { distribucion?: Distribucion } | undefined;
  const puestos = resumen(def, sala, pedida?.distribucion);
  const bs = baseDef.salas.find((x) => x.id === sala.id) ?? sala;
  const ctx: Ctx = {
    p,
    entidad: 'sala',
    id: sala.id,
    ef: { x: sala.x, z: sala.z, ancho, fondo, puestos } as unknown as Campos,
    base: {
      x: bs.x,
      z: bs.z,
      ancho: bs.apariencia.ancho,
      fondo: bs.apariencia.fondo,
      puestos: resumen(baseDef, bs),
    } as unknown as Campos,
  };
  const error = p.errores[`sala:${sala.id}`] ?? null;
  const pend = p.actual('sala', sala.id).overrides;
  const fantasma = error
    ? {
        x: (pend['x'] as number | undefined) ?? sala.x,
        z: (pend['z'] as number | undefined) ?? sala.z,
        ancho: (pend['ancho'] as number | undefined) ?? ancho,
        fondo: (pend['fondo'] as number | undefined) ?? fondo,
      }
    : null;
  const set = (c: Campos) => p.editar('sala', sala.id, c);
  const dist = puestos.distribucion;
  return (
    <div className="space-y-3">
      <PlanoSvg def={def} selId={sala.id} onSala={onSala} fantasma={fantasma} />
      {error && (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          No se puede aplicar este cambio: {error}. Ajusta los valores (el rectángulo rojo muestra
          lo pedido).
        </p>
      )}
      <div className="divide-y divide-line/70">
        <CampoEd
          ctx={ctx}
          campo="x"
          campos={['x', 'z']}
          etiqueta="Posición (celdas)"
          aleatorio={false}
        >
          <div className="flex flex-wrap gap-3">
            <Numero
              nombre="Este (x)"
              valor={sala.x}
              min={0}
              max={80}
              onCambio={(x) => set({ x })}
            />
            <Numero nombre="Sur (z)" valor={sala.z} min={0} max={80} onCambio={(z) => set({ z })} />
          </div>
        </CampoEd>
        <CampoEd
          ctx={ctx}
          campo="ancho"
          campos={['ancho', 'fondo']}
          etiqueta="Tamaño (celdas)"
          aleatorio={false}
        >
          <div className="flex flex-wrap gap-3">
            <Numero
              nombre="Ancho"
              valor={ancho}
              min={3}
              max={24}
              onCambio={(v) => set({ ancho: v })}
            />
            <Numero
              nombre="Fondo"
              valor={fondo}
              min={3}
              max={24}
              onCambio={(v) => set({ fondo: v })}
            />
          </div>
        </CampoEd>
        <CampoEd ctx={ctx} campo="puestos" etiqueta="Puestos de trabajo" aleatorio={false}>
          <div className="space-y-2">
            <Numero
              nombre="Cantidad"
              valor={puestos.cantidad}
              min={0}
              max={12}
              onCambio={(cantidad) => set({ puestos: { cantidad, distribucion: dist } })}
            />
            <Opciones
              nombre="Distribución de puestos"
              valor={dist}
              opciones={DISTRIBUCIONES.map((id) => ({ id, etiqueta: ETQ_DISTRIBUCION[id] }))}
              onCambio={(distribucion) =>
                set({ puestos: { cantidad: puestos.cantidad, distribucion } })
              }
            />
            <p className="text-xs text-muted">
              Caben hasta {capacidadPuestos(ancho, fondo, dist)} con esta distribución. Los puestos
              con agente no se pueden quitar.
            </p>
          </div>
        </CampoEd>
      </div>
    </div>
  );
}
