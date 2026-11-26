import {
  CALIDADES,
  FACHADAS,
  LOGOS,
  PALETAS,
  PALETA_IDS,
  type AparienciaOficina,
  type PaletaId,
} from '../../shared/oficina3d/apariencia';
import { camposDePaleta } from '../../shared/oficina3d/aleatorio-lugares';
import type { Campos } from '../../shared/oficina3d/composicion';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { CampoEd, type Ctx } from './campo';
import { Deslizador, Opciones, SelectorColor } from './controles';
import type { Personalizador } from './usarApariencias';

const ETQ_CICLO = { dia: 'Día', noche: 'Noche', auto: 'Según el reloj', hora: 'Hora fija' };
const ETQ_CALIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja (bajo consumo)' };
const ETQ_FACHADA = { vidrio: 'Vidrio', ladrillo: 'Ladrillo', moderno: 'Moderno' };
const ETQ_LOGO = { base: 'El de la plantilla', ninguno: 'Sin logo', url: 'Ruta o URL' };
const COLORES: [keyof AparienciaOficina['colores'], string][] = [
  ['primario', 'Color primario (muros y marca)'],
  ['secundario', 'Color secundario (base y pasillo)'],
  ['acento', 'Color de acento'],
  ['fondo', 'Fondo de la escena'],
  ['piso', 'Piso general'],
];

export function PanelOficina({
  p,
  def,
  baseDef,
  pisos,
}: {
  p: Personalizador;
  def: DefinicionOficina;
  baseDef: DefinicionOficina;
  pisos: number;
}) {
  const a = def.office.apariencia;
  const ctx: Ctx = {
    p,
    entidad: 'oficina',
    id: def.office.id,
    ef: a as unknown as Campos,
    base: baseDef.office.apariencia as unknown as Campos,
  };
  const set = (c: Partial<AparienciaOficina>) => p.editar('oficina', def.office.id, c as Campos);
  const planta = a.planta ?? { ancho: def.planta.ancho, fondo: def.planta.fondo };
  const error = p.errores[`oficina:${def.office.id}`];
  return (
    <div className="divide-y divide-line/70">
      <CampoEd
        ctx={ctx}
        campo="paleta"
        campos={['paleta', 'colores', 'fachada']}
        etiqueta="Paleta de la oficina"
      >
        <div className="flex flex-wrap gap-2">
          {PALETA_IDS.map((id: PaletaId) => (
            <button
              key={id}
              type="button"
              aria-pressed={a.paleta === id}
              onClick={() => set(camposDePaleta(id) as Partial<AparienciaOficina>)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${a.paleta === id ? 'border-brand-strong bg-brand-soft font-medium' : 'border-line bg-white hover:bg-brand-soft/60'}`}
            >
              <span className="flex">
                {[PALETAS[id].primario, PALETAS[id].secundario, PALETAS[id].acento].map((c) => (
                  <span
                    key={c}
                    className="h-4 w-4 first:rounded-l last:rounded-r"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              {PALETAS[id].nombre}
            </button>
          ))}
          <span
            className={`rounded-lg border px-2.5 py-1.5 text-sm ${a.paleta === 'personalizada' ? 'border-brand-strong bg-brand-soft font-medium' : 'border-dashed border-line text-muted'}`}
          >
            Personalizada{a.paleta === 'personalizada' ? ' (activa)' : ': edita un color'}
          </span>
        </div>
      </CampoEd>
      {COLORES.map(([k, etiqueta]) => (
        <CampoEd
          key={k}
          ctx={{
            ...ctx,
            ef: a.colores as unknown as Campos,
            base: baseDef.office.apariencia.colores as unknown as Campos,
          }}
          campo={k}
          etiqueta={etiqueta}
          aleatorio={false}
        >
          <SelectorColor
            nombre={etiqueta}
            valor={a.colores[k]}
            onCambio={(c) => set({ paleta: 'personalizada', colores: { ...a.colores, [k]: c } })}
          />
        </CampoEd>
      ))}
      <CampoEd
        ctx={ctx}
        campo="marca"
        etiqueta="Nombre de la marca (marca blanca)"
        aleatorio={false}
        ayuda="Aparece en el tótem de la entrada y en el modo presentación."
      >
        <input
          aria-label="Nombre de la marca"
          value={a.marca}
          maxLength={60}
          placeholder={def.office.nombre}
          onChange={(e) => set({ marca: e.target.value })}
          className="w-full rounded-lg border border-line bg-white px-3 py-1.5"
        />
      </CampoEd>
      <CampoEd
        ctx={ctx}
        campo="logo"
        campos={['logo', 'logoUrl']}
        etiqueta="Logo"
        aleatorio={false}
      >
        <Opciones
          nombre="Logo"
          valor={a.logo}
          opciones={LOGOS.map((id) => ({ id, etiqueta: ETQ_LOGO[id] }))}
          onCambio={(logo) => set({ logo })}
        />
        {a.logo === 'url' && (
          <input
            aria-label="Ruta o URL del logo"
            value={a.logoUrl}
            maxLength={200}
            placeholder="/logo-acit.png o https://…"
            onChange={(e) => set({ logoUrl: e.target.value })}
            className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-1.5 font-mono text-xs"
          />
        )}
      </CampoEd>
      <CampoEd ctx={ctx} campo="ciclo" campos={['ciclo', 'hora']} etiqueta="Ciclo día/noche">
        <Opciones
          nombre="Ciclo"
          valor={a.ciclo}
          opciones={(['dia', 'noche', 'auto', 'hora'] as const).map((id) => ({
            id,
            etiqueta: ETQ_CICLO[id],
          }))}
          onCambio={(ciclo) => set({ ciclo })}
        />
        {a.ciclo === 'hora' && (
          <Deslizador
            nombre="Hora fija"
            valor={a.hora}
            min={0}
            max={24}
            paso={1}
            formato={(n) => `${n}:00`}
            onCambio={(hora) => set({ hora })}
          />
        )}
      </CampoEd>
      <CampoEd ctx={ctx} campo="calidad" etiqueta="Calidad gráfica">
        <Opciones
          nombre="Calidad gráfica"
          valor={a.calidad}
          opciones={CALIDADES.map((id) => ({ id, etiqueta: ETQ_CALIDAD[id] }))}
          onCambio={(calidad) => set({ calidad })}
        />
      </CampoEd>
      <CampoEd
        ctx={{
          ...ctx,
          ef: { planta } as unknown as Campos,
          base: {
            planta: { ancho: baseDef.planta.ancho, fondo: baseDef.planta.fondo },
          } as unknown as Campos,
        }}
        campo="planta"
        etiqueta="Tamaño de la planta (celdas)"
        aleatorio={false}
      >
        <div className="flex flex-wrap gap-3">
          {(['ancho', 'fondo'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <span className="w-14 text-muted">{k === 'ancho' ? 'Ancho' : 'Fondo'}</span>
              <input
                type="number"
                aria-label={`Planta: ${k}`}
                min={8}
                max={80}
                value={planta[k]}
                onChange={(e) => {
                  const n = Math.round(e.target.valueAsNumber);
                  if (!Number.isNaN(n))
                    set({ planta: { ...planta, [k]: Math.min(80, Math.max(8, n)) } });
                }}
                className="w-20 rounded-lg border border-line bg-white px-2 py-1 tabular-nums"
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
            No se puede aplicar: {error}
          </p>
        )}
      </CampoEd>
      <CampoEd
        ctx={ctx}
        campo="fachada"
        etiqueta="Fachada del edificio"
        aleatorio={false}
        ayuda={`El edificio tiene ${pisos} piso(s); se agregan o archivan en la pantalla Edificio.`}
      >
        <Opciones
          nombre="Estilo de fachada"
          valor={a.fachada.estilo}
          opciones={FACHADAS.map((id) => ({ id, etiqueta: ETQ_FACHADA[id] }))}
          onCambio={(estilo) => set({ fachada: { ...a.fachada, estilo } })}
        />
        <div className="mt-2">
          <SelectorColor
            nombre="Color de la fachada"
            valor={a.fachada.color}
            onCambio={(color) => set({ fachada: { ...a.fachada, color } })}
          />
        </div>
      </CampoEd>
    </div>
  );
}
