/** Barra de acciones del elemento elegido: aleatorio, default, duplicar, preset, importar/exportar, versiones, deshacer/rehacer, comparar. */
import { useState } from 'react';
import { clave, type Campos, type Entidad } from '../../shared/oficina3d/composicion';
import { Button } from '../components/ui';
import { DialogoCopiar, DialogoGuardarPreset, DialogoImportar, DialogoVersiones } from './Dialogos';
import type { Personalizador } from './usarApariencias';
import { descargarJson, nombreArchivo, sobreExportable } from './visuales';

type Abierto = null | 'preset' | 'importar' | 'copiar' | 'versiones';

export function Barra({
  p,
  entidad,
  id,
  nombre,
  ef,
  hermanos,
}: {
  p: Personalizador;
  entidad: Entidad;
  id: string;
  nombre: string;
  ef: Campos;
  /** Otros elementos del mismo tipo (destino de «Duplicar apariencia»). */
  hermanos: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState<Abierto>(null);
  const k = clave(entidad, id);
  const guardada = p.capas[k];
  const hayBorrador = k in p.borrador;
  const comparando = p.comparando === k;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label="Acciones de apariencia"
    >
      <Button onClick={() => void p.aleatorio(entidad, id)}>Aleatorio</Button>
      <Button onClick={() => void p.restablecer(entidad, id)}>Default de la plantilla</Button>
      {entidad !== 'oficina' && hermanos.length > 1 && (
        <Button onClick={() => setAbierto('copiar')}>Duplicar apariencia</Button>
      )}
      <Button onClick={() => setAbierto('preset')}>Guardar como preset</Button>
      <Button onClick={() => setAbierto('importar')}>Importar</Button>
      <Button
        onClick={() =>
          descargarJson(`${nombreArchivo(nombre)}.json`, sobreExportable(entidad, nombre, ef))
        }
      >
        Exportar
      </Button>
      <Button onClick={() => setAbierto('versiones')}>Versiones</Button>
      <span className="mx-1 h-6 w-px bg-line" aria-hidden />
      <Button
        aria-label="Deshacer"
        disabled={!hayBorrador && !guardada?.puedeDeshacer}
        onClick={() => void p.deshacer(entidad, id)}
      >
        ↶ Deshacer
      </Button>
      <Button
        aria-label="Rehacer"
        disabled={hayBorrador || !guardada?.puedeRehacer}
        onClick={() => void p.rehacer(entidad, id)}
      >
        Rehacer ↷
      </Button>
      <Button
        aria-pressed={comparando}
        onClick={() => p.setComparando(comparando ? null : k)}
        title="Muestra la plantilla en la vista previa mientras esté activado"
      >
        {comparando ? 'Dejar de comparar' : 'Comparar con default'}
      </Button>
      {abierto === 'preset' && (
        <DialogoGuardarPreset
          p={p}
          entidad={entidad}
          ef={ef}
          nombreInicial={`Mi ${nombre}`.slice(0, 60)}
          onCerrar={() => setAbierto(null)}
        />
      )}
      {abierto === 'importar' && <DialogoImportar p={p} onCerrar={() => setAbierto(null)} />}
      {abierto === 'copiar' && (
        <DialogoCopiar
          p={p}
          entidad={entidad}
          origen={id}
          ef={ef}
          destinos={hermanos}
          onCerrar={() => setAbierto(null)}
        />
      )}
      {abierto === 'versiones' && (
        <DialogoVersiones p={p} entidad={entidad} id={id} onCerrar={() => setAbierto(null)} />
      )}
    </div>
  );
}
