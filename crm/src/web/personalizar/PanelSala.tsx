import {
  ILUMINACION,
  MOBILIARIO,
  PISOS,
  UTILERIA,
  type AparienciaSala,
} from '../../shared/oficina3d/apariencia';
import { ACENTOS, COLORES_PARED, COLORES_PISO } from '../../shared/oficina3d/aleatorio-lugares';
import type { Campos } from '../../shared/oficina3d/composicion';
import type { DefinicionOficina, SalaDef } from '../../shared/oficina3d/definicion';
import { CampoEd, type Ctx } from './campo';
import { Deslizador, MuestraRotulo, Opciones, SelectorColor } from './controles';
import { PlanoSala } from './PlanoEditor';
import type { Personalizador } from './usarApariencias';

const ETQ_PISO = {
  madera: 'Madera',
  alfombra: 'Alfombra',
  concreto: 'Concreto',
  cuadros: 'Cuadros',
};
const ETQ_MOB = { cubiculos: 'Cubículos', mini_oficina: 'Mini oficina', abierto: 'Abierto' };
const ETQ_LUZ = { calida: 'Cálida', neutra: 'Neutra', fria: 'Fría' };
const ETQ_UTIL: Record<(typeof UTILERIA)[number], string> = {
  mapa: 'Mapa',
  pared_monitores: 'Pared de monitores',
  mesa_maquetas: 'Mesa de maquetas',
  sellos: 'Sellos',
  medidor: 'Medidor',
  impresora: 'Impresora',
  pantalla_progreso: 'Pantalla de progreso',
  mesa_juntas: 'Mesa de juntas',
  estantes: 'Estantes',
  pizarron: 'Pizarrón',
  buzon: 'Buzón',
  barra_cafe: 'Barra de café',
  sofa: 'Sofá',
  plantas: 'Plantas',
  mostrador: 'Mostrador',
  alfombra: 'Alfombra',
};

export function PanelSala({
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
  const a = sala.apariencia;
  const bs = baseDef.salas.find((x) => x.id === sala.id) ?? sala;
  const ctx: Ctx = {
    p,
    entidad: 'sala',
    id: sala.id,
    ef: a as unknown as Campos,
    base: bs.apariencia as unknown as Campos,
  };
  const set = (c: Partial<AparienciaSala>) => p.editar('sala', sala.id, c as Campos);
  const toggle = (u: (typeof UTILERIA)[number]) =>
    set({
      utileria: a.utileria.includes(u)
        ? a.utileria.filter((x) => x !== u)
        : [...a.utileria, u].slice(0, 12),
    });
  return (
    <div className="divide-y divide-line/70">
      <CampoEd ctx={ctx} campo="rotulo" etiqueta="Rótulo" aleatorio={false}>
        <input
          aria-label="Texto del rótulo"
          value={a.rotulo.texto}
          maxLength={40}
          onChange={(e) =>
            e.target.value && set({ rotulo: { ...a.rotulo, texto: e.target.value } })
          }
          className="mb-2 w-full rounded-lg border border-line bg-white px-3 py-1.5"
        />
        <SelectorColor
          nombre="Color del rótulo"
          valor={a.rotulo.color}
          paleta={ACENTOS}
          onCambio={(color) => set({ rotulo: { ...a.rotulo, color } })}
        />
        <MuestraRotulo texto={a.rotulo.texto} fondo={a.rotulo.color} />
        <p className="mt-1 text-xs text-muted">
          El color del texto se ajusta solo para que siempre se lea.
        </p>
      </CampoEd>
      <CampoEd ctx={ctx} campo="piso" etiqueta="Material del piso">
        <Opciones
          nombre="Material del piso"
          valor={a.piso}
          opciones={PISOS.map((id) => ({ id, etiqueta: ETQ_PISO[id] }))}
          onCambio={(piso) => set({ piso })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="colorPiso" etiqueta="Color del piso">
        <SelectorColor
          nombre="Piso"
          valor={a.colorPiso}
          paleta={COLORES_PISO}
          onCambio={(colorPiso) => set({ colorPiso })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="colorPared" etiqueta="Color de las paredes">
        <SelectorColor
          nombre="Paredes"
          valor={a.colorPared}
          paleta={COLORES_PARED}
          onCambio={(colorPared) => set({ colorPared })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="alturaPared" etiqueta="Altura de las paredes">
        <Deslizador
          nombre="Altura de paredes"
          valor={a.alturaPared}
          min={0.3}
          max={2.5}
          paso={0.1}
          formato={(n) => `${n.toFixed(1)} m`}
          onCambio={(alturaPared) => set({ alturaPared })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="acento" etiqueta="Color de acento (remate y mamparas)">
        <SelectorColor
          nombre="Acento"
          valor={a.acento}
          paleta={ACENTOS}
          onCambio={(acento) => set({ acento })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="mobiliario" etiqueta="Mobiliario de puestos">
        <Opciones
          nombre="Mobiliario"
          valor={a.mobiliario}
          opciones={MOBILIARIO.map((id) => ({ id, etiqueta: ETQ_MOB[id] }))}
          onCambio={(mobiliario) => set({ mobiliario })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="utileria" etiqueta="Objetos de la sala (máx. 12)" aleatorio={false}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {UTILERIA.map((u) => (
            <label key={u} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={a.utileria.includes(u)} onChange={() => toggle(u)} />
              {ETQ_UTIL[u]}
            </label>
          ))}
        </div>
      </CampoEd>
      <CampoEd ctx={ctx} campo="iluminacion" etiqueta="Iluminación">
        <Opciones
          nombre="Iluminación"
          valor={a.iluminacion}
          opciones={ILUMINACION.map((id) => ({ id, etiqueta: ETQ_LUZ[id] }))}
          onCambio={(iluminacion) => set({ iluminacion })}
        />
      </CampoEd>
      <div className="pt-3">
        <h3 className="mb-2 text-sm font-semibold">Plano de la sala</h3>
        <PlanoSala p={p} sala={sala} baseDef={baseDef} def={def} onSala={onSala} />
      </div>
    </div>
  );
}
