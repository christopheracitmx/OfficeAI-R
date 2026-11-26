/** Diálogos del Personalizador: guardar como preset, importar, copiar apariencia y versiones (rollback). */
import { useEffect, useState, type ReactNode } from 'react';
import type { Campos, Entidad } from '../../shared/oficina3d/composicion';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import type { VersionUi } from '../lib/types-apariencia';
import { camposVisuales } from './visuales';
import type { Personalizador } from './usarApariencias';

const LIMITE_ARCHIVO = 20_000;
const campo = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2';

function Marco({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
    >
      <div className="anim-pop w-full max-w-md rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function DialogoGuardarPreset({
  p,
  entidad,
  ef,
  nombreInicial,
  onCerrar,
}: {
  p: Personalizador;
  entidad: Entidad;
  ef: Campos;
  nombreInicial: string;
  onCerrar: () => void;
}) {
  const [escrito, setNombre] = useState<string | null>(null);
  const nombre = escrito ?? nombreInicial;
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    try {
      await api('/apariencias/presets', {
        method: 'POST',
        body: { tipo: entidad, nombre, json: camposVisuales(entidad, ef) },
      });
      await p.cargar();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };
  return (
    <Marco titulo="Guardar como preset" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-muted">
        Guarda los colores y opciones actuales (no el nombre ni el tamaño) para reutilizarlos.
      </p>
      <label className="mt-4 block text-muted">
        Nombre del preset
        <input
          className={campo}
          value={nombre}
          maxLength={60}
          onChange={(e) => setNombre(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button
          variante="primario"
          disabled={nombre.trim().length < 1}
          onClick={() => void guardar()}
        >
          Guardar
        </Button>
      </div>
    </Marco>
  );
}

export function DialogoImportar({ p, onCerrar }: { p: Personalizador; onCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const leer = (f: File | undefined) => {
    if (!f) return;
    if (f.size > LIMITE_ARCHIVO)
      return setError(`El archivo es demasiado grande (máximo ${LIMITE_ARCHIVO} caracteres)`);
    void f.text().then((t) => {
      setTexto(t);
      setError(null);
    });
  };
  const importar = async () => {
    try {
      await api('/apariencias/presets/importar', { method: 'POST', body: { contenido: texto } });
      await p.cargar();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar');
    }
  };
  return (
    <Marco titulo="Importar preset" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-muted">
        Elige un archivo .json exportado desde aquí, o pega su contenido. Se valida antes de
        guardarlo.
      </p>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Archivo de preset"
        onChange={(e) => leer(e.target.files?.[0])}
        className="mt-3 block w-full text-sm"
      />
      <textarea
        aria-label="Contenido del preset"
        className={`${campo} h-32 font-mono text-xs`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder='{"formato":"acitmx-preset", …}'
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button
          variante="primario"
          disabled={texto.trim().length < 2}
          onClick={() => void importar()}
        >
          Importar
        </Button>
      </div>
    </Marco>
  );
}

export function DialogoCopiar({
  p,
  entidad,
  origen,
  ef,
  destinos,
  onCerrar,
}: {
  p: Personalizador;
  entidad: Entidad;
  origen: string;
  ef: Campos;
  destinos: { id: string; nombre: string }[];
  onCerrar: () => void;
}) {
  const [sel, setSel] = useState(() => destinos.find((d) => d.id !== origen)?.id ?? '');
  return (
    <Marco titulo="Duplicar apariencia" onCerrar={onCerrar}>
      <p className="mt-1 text-sm text-muted">
        Copia los colores y opciones de esta apariencia a otro elemento (no cambia nombre, género ni
        tamaño).
      </p>
      <label className="mt-4 block text-muted">
        Copiar a
        <select
          className={campo}
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          aria-label="Elemento destino"
        >
          {destinos
            .filter((d) => d.id !== origen)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
        </select>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCerrar}>Cancelar</Button>
        <Button
          variante="primario"
          disabled={!sel}
          onClick={() => {
            p.editar(entidad, sel, camposVisuales(entidad, ef));
            onCerrar();
          }}
        >
          Copiar
        </Button>
      </div>
    </Marco>
  );
}

export function DialogoVersiones({
  p,
  entidad,
  id,
  onCerrar,
}: {
  p: Personalizador;
  entidad: Entidad;
  id: string;
  onCerrar: () => void;
}) {
  const [lista, setLista] = useState<VersionUi[] | null>(null);
  useEffect(() => {
    let vivo = true;
    api<{ versiones: VersionUi[] }>(`/apariencias/${entidad}/${encodeURIComponent(id)}`)
      .then((r) => vivo && setLista(r.versiones))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [entidad, id]);
  return (
    <Marco titulo="Historial de versiones" onCerrar={onCerrar}>
      {lista === null ? (
        <p className="mt-3 text-muted">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="mt-3 text-muted">Aún no hay cambios guardados: es la plantilla.</p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {[...lista].reverse().map((v) => (
            <li
              key={v.version}
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm"
            >
              <span className="flex-1">
                <span className="font-medium">v{v.version}</span> · {v.nota ?? ''}
                {v.vigente && <span className="ml-1 text-ok">(actual)</span>}
                <br />
                <span className="text-xs text-muted">
                  {new Date(v.creado_en).toLocaleString('es-MX')}
                </span>
              </span>
              {!v.vigente && (
                <Button
                  onClick={() => {
                    void p.restaurar(entidad, id, v.version);
                    onCerrar();
                  }}
                >
                  Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={onCerrar}>Cerrar</Button>
      </div>
    </Marco>
  );
}
