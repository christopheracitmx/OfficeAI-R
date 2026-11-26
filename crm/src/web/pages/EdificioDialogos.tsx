import { useState } from 'react';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import type { Oficina } from '../lib/useOficinas';

export type ModoDialogo = 'crear' | 'duplicar' | 'renombrar';

const campo = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2';

const TITULOS: Record<ModoDialogo, string> = {
  crear: 'Nuevo piso',
  duplicar: 'Duplicar piso',
  renombrar: 'Renombrar piso',
};

/** Crear (plantilla vacía o copia de otro piso), duplicar y renombrar. Nunca borra nada. */
export function DialogoOficina({
  modo,
  oficina,
  pisos,
  onCerrar,
  onHecho,
}: {
  modo: ModoDialogo;
  oficina: Oficina | null;
  pisos: Oficina[];
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(
    modo === 'renombrar'
      ? (oficina?.nombre ?? '')
      : modo === 'duplicar'
        ? `${oficina?.nombre ?? ''} (copia)`
        : '',
  );
  const [descripcion, setDescripcion] = useState(
    modo === 'renombrar' ? (oficina?.descripcion ?? '') : '',
  );
  const [origen, setOrigen] = useState<string>(pisos[0]?.id ?? '');
  const [plantilla, setPlantilla] = useState<'vacia' | 'duplicar'>('vacia');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      if (modo === 'renombrar')
        await api(`/oficinas/${oficina!.id}`, {
          method: 'PATCH',
          body: { nombre, descripcion },
        });
      else {
        const dup = modo === 'duplicar' || plantilla === 'duplicar';
        await api('/oficinas', {
          method: 'POST',
          body: {
            nombre,
            descripcion,
            plantilla: dup ? 'duplicar' : 'vacia',
            ...(dup ? { origen: modo === 'duplicar' ? oficina!.id : origen } : {}),
          },
        });
      }
      onHecho(modo === 'renombrar' ? 'Piso actualizado' : 'Piso creado');
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
      aria-label={TITULOS[modo]}
    >
      <div className="anim-pop w-full max-w-md rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">{TITULOS[modo]}</h2>
        {modo === 'duplicar' && (
          <p className="mt-1 text-sm text-muted">
            Copia agentes, flujo, prompts, habilidades, Biblioteca y lecciones aprobadas de «
            {oficina?.nombre}». No copia prospectos, corridas, salidas ni retroalimentación.
          </p>
        )}
        <label className="mt-4 block text-muted">
          Nombre
          <input
            autoFocus
            className={campo}
            value={nombre}
            maxLength={60}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-muted">
          Descripción (opcional)
          <input
            className={campo}
            value={descripcion}
            maxLength={300}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </label>
        {modo === 'crear' && (
          <fieldset className="mt-3 space-y-2">
            <legend className="text-muted">Punto de partida</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={plantilla === 'vacia'}
                onChange={() => setPlantilla('vacia')}
              />
              Plantilla vacía (un asistente y un flujo mínimo que puedes editar)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={plantilla === 'duplicar'}
                onChange={() => setPlantilla('duplicar')}
              />
              Duplicar otro piso
            </label>
            {plantilla === 'duplicar' && (
              <select
                aria-label="Piso origen"
                className={campo}
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
              >
                {pisos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.piso}. {p.nombre}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={enviando || nombre.trim().length < 2}
            onClick={() => void enviar()}
          >
            {modo === 'renombrar' ? 'Guardar' : 'Crear piso'}
          </Button>
        </div>
      </div>
    </div>
  );
}
