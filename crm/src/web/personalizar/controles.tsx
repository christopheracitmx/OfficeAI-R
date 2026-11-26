/** Controles del Personalizador: campo con «aleatorio» y «restablecer», color accesible (paleta + hex), deslizador y opciones. */
import { useState, type ReactNode } from 'react';
import { contraste, textoLegible } from '../../shared/oficina3d/apariencia';
import { cx } from '../components/ui';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Marco de un parámetro: etiqueta + 🎲 aleatorio + ↺ restablecer a la plantilla. */
export function Campo({
  etiqueta,
  cambiado,
  onAleatorio,
  onRestablecer,
  ayuda,
  children,
}: {
  etiqueta: string;
  cambiado?: boolean;
  onAleatorio?: () => void;
  onRestablecer?: () => void;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-2" role="group" aria-label={etiqueta}>
      <div className="mb-1 flex items-center gap-1">
        <span className="flex-1 text-sm font-medium">
          {etiqueta}
          {cambiado && (
            <span className="ml-1 text-xs font-normal text-brand-strong">· editado</span>
          )}
        </span>
        {onAleatorio && (
          <button
            type="button"
            onClick={onAleatorio}
            aria-label={`Aleatorio: ${etiqueta}`}
            title="Valor aleatorio"
            className="rounded-md px-1.5 py-0.5 text-xs font-medium text-brand-strong hover:bg-brand-soft"
          >
            Azar
          </button>
        )}
        {onRestablecer && (
          <button
            type="button"
            onClick={onRestablecer}
            disabled={!cambiado}
            aria-label={`Restablecer: ${etiqueta}`}
            title="Volver al valor de la plantilla"
            className="rounded-md px-1.5 py-0.5 text-sm text-muted hover:bg-brand-soft disabled:opacity-30"
          >
            ↺
          </button>
        )}
      </div>
      {children}
      {ayuda && <p className="mt-1 text-xs text-muted">{ayuda}</p>}
    </div>
  );
}

/** Color accesible: muestras de la paleta (botones), selector nativo y campo hexadecimal validado. */
export function SelectorColor({
  valor,
  onCambio,
  paleta = [],
  nombre,
}: {
  valor: string;
  onCambio: (hex: string) => void;
  paleta?: readonly string[];
  nombre: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? valor.toUpperCase();
  const valido = HEX.test(mostrado);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {paleta.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${nombre} ${c}`}
          aria-pressed={c.toLowerCase() === valor.toLowerCase()}
          onClick={() => {
            setTexto(null);
            onCambio(c);
          }}
          style={{ backgroundColor: c }}
          className={cx(
            'h-6 w-6 rounded-full border border-black/25',
            c.toLowerCase() === valor.toLowerCase() &&
              'outline outline-2 outline-offset-2 outline-brand-strong',
          )}
        />
      ))}
      <input
        type="color"
        aria-label={`${nombre}: selector de color`}
        value={valor.toLowerCase()}
        onChange={(e) => {
          setTexto(null);
          onCambio(e.target.value.toUpperCase());
        }}
        className="h-7 w-9 cursor-pointer rounded border border-line bg-white p-0.5"
      />
      <input
        aria-label={`${nombre}: código hexadecimal`}
        aria-invalid={!valido}
        value={mostrado}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          setTexto(v);
          if (HEX.test(v)) onCambio(v);
        }}
        onBlur={() => setTexto(null)}
        className={cx(
          'w-[84px] rounded-lg border bg-white px-2 py-1 font-mono text-xs',
          valido ? 'border-line' : 'border-bad',
        )}
      />
    </div>
  );
}

export function Deslizador({
  valor,
  min,
  max,
  paso,
  onCambio,
  nombre,
  formato = (n) => String(n),
}: {
  valor: number;
  min: number;
  max: number;
  paso: number;
  onCambio: (n: number) => void;
  nombre: string;
  formato?: (n: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={nombre}
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        className="flex-1 accent-brand-strong"
      />
      <span className="w-14 text-right text-sm tabular-nums">{formato(valor)}</span>
    </div>
  );
}

/** Grupo de opciones tipo botón (radio accesible). */
export function Opciones<T extends string>({
  valor,
  opciones,
  onCambio,
  nombre,
}: {
  valor: T;
  opciones: readonly { id: T; etiqueta: string; extra?: ReactNode }[];
  onCambio: (v: T) => void;
  nombre: string;
}) {
  return (
    <div role="radiogroup" aria-label={nombre} className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === valor}
          onClick={() => onCambio(o.id)}
          className={cx(
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors duration-150',
            o.id === valor
              ? 'border-brand-strong bg-brand-soft font-medium'
              : 'border-line bg-white hover:bg-brand-soft/60',
          )}
        >
          {o.extra}
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Muestra del rótulo con el color de texto que se aplicará (contraste AA garantizado). */
export function MuestraRotulo({ texto, fondo }: { texto: string; fondo: string }) {
  const color = textoLegible(fondo);
  return (
    <div
      className="mt-1 inline-block rounded-lg px-3 py-1 text-sm font-semibold"
      style={{ backgroundColor: fondo, color }}
      aria-label={`Vista del rótulo, contraste ${contraste(fondo, color).toFixed(1)} a 1`}
    >
      {texto || 'Rótulo'}
    </div>
  );
}
