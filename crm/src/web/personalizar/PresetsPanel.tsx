/** Presets de inicio (equipo y paletas) y los propios: aplicar, duplicar, exportar y borrar. */
import { useState } from 'react';
import type { Entidad } from '../../shared/oficina3d/composicion';
import { Button, ConfirmDialog } from '../components/ui';
import { api } from '../lib/api';
import type { PresetUi } from '../lib/types-apariencia';
import type { Personalizador } from './usarApariencias';
import { descargarJson, nombreArchivo } from './visuales';

const EQUIPO = [
  ['uniforme', 'Uniforme de marca'],
  ['casual', 'Casual'],
  ['formal', 'Formal'],
  ['aleatorio', 'Aleatorio 50/50'],
  ['restablecer', 'Restablecer todos'],
] as const;

/** Acciones sobre todo el equipo (solo en la pestaña Personajes). */
export function AccionesEquipo({ p }: { p: Personalizador }) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  return (
    <section aria-label="Acciones de equipo" className="rounded-xl border border-line bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">Todo el equipo</h3>
      <div className="flex flex-wrap gap-2">
        {EQUIPO.map(([id, etiqueta]) => (
          <Button
            key={id}
            onClick={() =>
              id === 'aleatorio' || id === 'restablecer' ? setConfirmar(id) : void p.equipo(id)
            }
          >
            {etiqueta}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Uniforme, casual y formal cambian solo la ropa. Aleatorio conserva la paridad 50/50.
      </p>
      {confirmar && (
        <ConfirmDialog
          titulo={
            confirmar === 'aleatorio'
              ? 'Aleatorio para todo el equipo'
              : 'Restablecer todo el equipo'
          }
          mensaje={
            confirmar === 'aleatorio'
              ? 'Se generará una apariencia nueva para cada personaje (se puede deshacer personaje por personaje).'
              : 'Todos los personajes vuelven a la apariencia de la plantilla (se puede deshacer).'
          }
          confirmar="Continuar"
          onCancel={() => setConfirmar(null)}
          onConfirm={() => {
            void p.equipo(confirmar);
            setConfirmar(null);
          }}
        />
      )}
    </section>
  );
}

export function PresetsPanel({
  p,
  tipo,
  id,
  titulo,
}: {
  p: Personalizador;
  tipo: Entidad;
  id: string;
  titulo: string;
}) {
  const lista = p.presets.filter((x) => x.tipo === tipo);
  const [borrar, setBorrar] = useState<PresetUi | null>(null);
  const exportar = async (x: PresetUi) => {
    try {
      descargarJson(
        `${nombreArchivo(x.nombre)}.json`,
        await api(`/apariencias/presets/${x.id}/exportar`),
      );
    } catch {
      /* el servidor ya valida; si falla no hay nada que descargar */
    }
  };
  return (
    <section aria-label={titulo} className="rounded-xl border border-line bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {lista.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay presets.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {lista.map((x) => (
            <li key={x.id} className="flex items-center gap-1.5 text-sm">
              <span className="flex-1 truncate" title={x.nombre}>
                {x.nombre}
                {x.builtin && <span className="ml-1 text-xs text-muted">(de fábrica)</span>}
              </span>
              <Button
                onClick={() => p.aplicarPreset(tipo, id, x.id)}
                aria-label={`Aplicar ${x.nombre}`}
              >
                Aplicar
              </Button>
              <Button
                variante="fantasma"
                aria-label={`Duplicar preset ${x.nombre}`}
                onClick={() => void p.post(`/apariencias/presets/${x.id}/duplicar`)}
              >
                Duplicar
              </Button>
              <Button
                variante="fantasma"
                aria-label={`Exportar preset ${x.nombre}`}
                onClick={() => void exportar(x)}
              >
                Exportar
              </Button>
              {!x.builtin && (
                <Button
                  variante="fantasma"
                  aria-label={`Borrar preset ${x.nombre}`}
                  onClick={() => setBorrar(x)}
                >
                  Borrar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {borrar && (
        <ConfirmDialog
          titulo="Borrar preset"
          mensaje={`¿Borrar «${borrar.nombre}»? Los elementos que lo usan conservan sus cambios propios.`}
          confirmar="Borrar"
          onCancel={() => setBorrar(null)}
          onConfirm={() => {
            void api(`/apariencias/presets/${borrar.id}`, { method: 'DELETE' })
              .then(() => p.cargar())
              .catch(() => p.cargar());
            setBorrar(null);
          }}
        />
      )}
    </section>
  );
}
