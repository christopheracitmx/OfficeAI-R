import {
  ACCESORIOS,
  CALZADOS,
  COLORES_OJOS,
  COLORES_PELO,
  EXPRESIONES,
  PEINADOS,
  PIELES,
  type AparienciaPersonaje,
} from '../../shared/oficina3d/apariencia';
import { ACCENTOS_ACC, CAMISAS, PANTALONES, ZAPATOS } from '../../shared/oficina3d/aleatorio';
import type { Campos } from '../../shared/oficina3d/composicion';
import type { AgenteDef3d } from '../../shared/oficina3d/definicion';
import { CampoEd, type Ctx } from './campo';
import { Deslizador, Opciones, SelectorColor } from './controles';
import { MiniaturaPeinado } from './Miniatura';
import type { Personalizador } from './usarApariencias';

const ETQ = {
  peinado: {
    corto: 'Corto',
    largo: 'Largo',
    rizado: 'Rizado',
    chongo: 'Chongo',
    coleta: 'Coleta',
    calvo: 'Calvo',
  },
  calzado: { tenis: 'Tenis', zapatos: 'Zapatos', botas: 'Botas' },
  accesorio: {
    ninguno: 'Ninguno',
    lentes: 'Lentes',
    gorra: 'Gorra',
    audifonos: 'Audífonos',
    corbata: 'Corbata',
  },
  expresion: { sonrisa: 'Sonrisa', seria: 'Seria', feliz: 'Feliz' },
} as const;

/** Aviso (no bloqueante) si el equipo deja de ser 50/50. */
export function AvisoParidad({ agentes }: { agentes: AgenteDef3d[] }) {
  const f = agentes.filter((a) => a.apariencia.cuerpo === 'f').length;
  const m = agentes.length - f;
  if (Math.abs(f - m) <= 1) return null;
  return (
    <p role="status" className="mt-2 rounded-lg bg-warn/15 px-3 py-2 text-xs text-deep">
      El equipo queda con {f} mujeres y {m} hombres: se recomienda 50/50. Es solo un aviso, puedes
      continuar.
    </p>
  );
}

export function PanelPersonaje({
  p,
  agente,
  base,
  agentes,
}: {
  p: Personalizador;
  agente: AgenteDef3d;
  base: AgenteDef3d;
  agentes: AgenteDef3d[];
}) {
  const a = agente.apariencia;
  const ctx: Ctx = {
    p,
    entidad: 'personaje',
    id: agente.id,
    ef: { ...a, nombre: agente.persona } as unknown as Campos,
    base: { ...base.apariencia, nombre: base.persona } as unknown as Campos,
  };
  const set = (c: Partial<AparienciaPersonaje>) => p.editar('personaje', agente.id, c as Campos);
  return (
    <div className="divide-y divide-line/70">
      <CampoEd ctx={ctx} campo="nombre" etiqueta="Nombre" aleatorio={false}>
        <input
          aria-label="Nombre del personaje"
          value={agente.persona}
          maxLength={40}
          onChange={(e) => e.target.value.trim() && set({ nombre: e.target.value })}
          className="w-full rounded-lg border border-line bg-white px-3 py-1.5"
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="cuerpo" etiqueta="Género (cuerpo base)" aleatorio={false}>
        <Opciones
          nombre="Género"
          valor={a.cuerpo}
          opciones={[
            { id: 'f', etiqueta: 'Mujer' },
            { id: 'm', etiqueta: 'Hombre' },
          ]}
          onCambio={(cuerpo) => set({ cuerpo })}
        />
        <AvisoParidad agentes={agentes} />
      </CampoEd>
      <CampoEd ctx={ctx} campo="piel" etiqueta="Tono de piel">
        <SelectorColor
          nombre="Piel"
          valor={a.piel}
          paleta={PIELES}
          onCambio={(piel) => set({ piel })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="peinado" etiqueta="Peinado">
        <Opciones
          nombre="Peinado"
          valor={a.peinado}
          opciones={PEINADOS.map((id) => ({
            id,
            etiqueta: ETQ.peinado[id],
            extra: <MiniaturaPeinado peinado={id} piel={a.piel} pelo={a.pelo} />,
          }))}
          onCambio={(peinado) => set({ peinado })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="pelo" etiqueta="Color de cabello">
        <SelectorColor
          nombre="Cabello"
          valor={a.pelo}
          paleta={COLORES_PELO}
          onCambio={(pelo) => set({ pelo })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="ojos" etiqueta="Color de ojos">
        <SelectorColor
          nombre="Ojos"
          valor={a.ojos}
          paleta={COLORES_OJOS}
          onCambio={(ojos) => set({ ojos })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="camisa" etiqueta="Camisa">
        <SelectorColor
          nombre="Camisa"
          valor={a.camisa}
          paleta={CAMISAS}
          onCambio={(camisa) => set({ camisa })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="pantalon" etiqueta="Pantalón">
        <SelectorColor
          nombre="Pantalón"
          valor={a.pantalon}
          paleta={PANTALONES}
          onCambio={(pantalon) => set({ pantalon })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="calzado" etiqueta="Calzado">
        <Opciones
          nombre="Calzado"
          valor={a.calzado}
          opciones={CALZADOS.map((id) => ({ id, etiqueta: ETQ.calzado[id] }))}
          onCambio={(calzado) => set({ calzado })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="colorCalzado" etiqueta="Color del calzado">
        <SelectorColor
          nombre="Calzado"
          valor={a.colorCalzado}
          paleta={ZAPATOS}
          onCambio={(colorCalzado) => set({ colorCalzado })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="accesorio" etiqueta="Accesorio (opcional)">
        <Opciones
          nombre="Accesorio"
          valor={a.accesorio}
          opciones={ACCESORIOS.map((id) => ({ id, etiqueta: ETQ.accesorio[id] }))}
          onCambio={(accesorio) => set({ accesorio })}
        />
      </CampoEd>
      {a.accesorio !== 'ninguno' && (
        <CampoEd ctx={ctx} campo="colorAccesorio" etiqueta="Color del accesorio">
          <SelectorColor
            nombre="Accesorio"
            valor={a.colorAccesorio}
            paleta={ACCENTOS_ACC}
            onCambio={(colorAccesorio) => set({ colorAccesorio })}
          />
        </CampoEd>
      )}
      <CampoEd ctx={ctx} campo="expresion" etiqueta="Expresión base">
        <Opciones
          nombre="Expresión"
          valor={a.expresion}
          opciones={EXPRESIONES.map((id) => ({ id, etiqueta: ETQ.expresion[id] }))}
          onCambio={(expresion) => set({ expresion })}
        />
      </CampoEd>
      <CampoEd ctx={ctx} campo="altura" etiqueta="Altura (±10 %)">
        <Deslizador
          nombre="Altura"
          valor={a.altura}
          min={0.9}
          max={1.1}
          paso={0.01}
          formato={(n) => `${n >= 1 ? '+' : ''}${Math.round((n - 1) * 100)} %`}
          onCambio={(altura) => set({ altura })}
        />
      </CampoEd>
    </div>
  );
}
