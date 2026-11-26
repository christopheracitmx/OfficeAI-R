import { useState } from 'react';
import type { CampoDef } from '../../shared/colecciones';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import type { Coleccion, Registro, ValorDato } from '../lib/types-datos';

const campoCss = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2';

function Entrada({
  c,
  valor,
  onCambio,
}: {
  c: CampoDef;
  valor: ValorDato | undefined;
  onCambio: (v: ValorDato | undefined) => void;
}) {
  const etiqueta = `${c.etiqueta}${c.requerido ? ' *' : ''}`;
  if (c.tipo === 'booleano')
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={valor === true}
          onChange={(e) => onCambio(e.target.checked)}
        />
        {etiqueta}
      </label>
    );
  if (c.tipo === 'enum')
    return (
      <label className="text-sm">
        {etiqueta}
        <select
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onCambio(e.target.value || undefined)}
          className={campoCss}
        >
          <option value="">—</option>
          {c.opciones?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  const tipo =
    c.tipo === 'numero'
      ? 'number'
      : c.tipo === 'fecha'
        ? 'date'
        : c.tipo === 'url'
          ? 'url'
          : 'text';
  return (
    <label className="text-sm">
      {etiqueta}
      <input
        type={tipo}
        step={c.tipo === 'numero' ? 'any' : undefined}
        value={valor === undefined ? '' : String(valor)}
        onChange={(e) =>
          onCambio(
            e.target.value === ''
              ? undefined
              : c.tipo === 'numero'
                ? Number(e.target.value)
                : e.target.value,
          )
        }
        className={campoCss}
      />
    </label>
  );
}

/** Alta o edición manual de un registro (el dueño). Exige fuente (enlace) o nota de origen. */
export function DatosRegistro({
  col,
  registro,
  onCerrar,
  onGuardado,
}: {
  col: Coleccion;
  registro: Registro | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [datos, setDatos] = useState<Record<string, ValorDato | undefined>>(registro?.datos ?? {});
  const [fuente, setFuente] = useState(registro?.fuente_url ?? '');
  const [nota, setNota] = useState(registro?.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined));
    const body = {
      datos: limpio,
      fuente_url: fuente.trim() || null,
      nota: nota.trim() || null,
    };
    try {
      if (registro)
        await api(`/colecciones/${col.id}/registros/${registro.id}`, { method: 'PATCH', body });
      else await api(`/colecciones/${col.id}/registros`, { method: 'POST', body });
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={registro ? 'Editar registro' : 'Nuevo registro'}
    >
      <div className="anim-pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">
          {registro ? `Editar registro #${registro.id}` : `Nuevo registro en ${col.nombre}`}
        </h2>
        <div className="mt-4 space-y-3">
          {col.campos.map((c) => (
            <Entrada
              key={c.nombre}
              c={c}
              valor={datos[c.nombre]}
              onCambio={(v) => setDatos((d) => ({ ...d, [c.nombre]: v }))}
            />
          ))}
          <label className="block text-sm">
            Fuente (enlace)
            <input
              type="url"
              value={fuente}
              onChange={(e) => setFuente(e.target.value)}
              className={campoCss}
              placeholder="https://…"
            />
          </label>
          <label className="block text-sm">
            Nota de origen (si no hay enlace)
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className={campoCss}
              maxLength={500}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button variante="primario" disabled={enviando} onClick={() => void guardar()}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
