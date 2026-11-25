import { useState } from 'react';
import { Button, Card, ErrorBanner, Skeleton, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { diffLineas, estimarTokens } from '../lib/diff';
import { fechaCorta, type VersionPrompt } from '../lib/types';

function Diff({ antes, despues }: { antes: string; despues: string }) {
  const lineas = diffLineas(antes, despues);
  return (
    <pre className="max-h-72 overflow-auto rounded-lg bg-ice p-3 text-xs">
      {lineas.map((l, i) => (
        <div
          key={`${i}-${l.tipo}`}
          className={cx(
            'whitespace-pre-wrap',
            l.tipo === 'agregada' && 'bg-green-100 text-green-900',
            l.tipo === 'quitada' && 'bg-red-100 text-red-900 line-through',
          )}
        >
          {l.tipo === 'agregada' ? '+ ' : l.tipo === 'quitada' ? '- ' : '  '}
          {l.texto}
        </div>
      ))}
    </pre>
  );
}

/** Carga las versiones y monta el formulario; la `key` lo reinicia al cambiar de prompt o de versión activa. */
export function PromptEditor({ nombre, onGuardado }: { nombre: string; onGuardado: () => void }) {
  const v = useApi<VersionPrompt[]>(`/prompts/${nombre}`);
  const activa = v.data?.find((x) => x.activo === 1);
  if (v.error) return <ErrorBanner mensaje={v.error} onRetry={v.reload} />;
  if (!v.data || !activa) return <Skeleton className="h-64" />;
  return (
    <Formulario
      key={`${nombre}-${activa.version}`}
      nombre={nombre}
      versiones={v.data}
      activa={activa}
      recargar={() => {
        v.reload();
        onGuardado();
      }}
    />
  );
}

function Formulario({
  nombre,
  versiones,
  activa,
  recargar,
}: {
  nombre: string;
  versiones: VersionPrompt[];
  activa: VersionPrompt;
  recargar: () => void;
}) {
  const [texto, setTexto] = useState(activa.texto);
  const [nota, setNota] = useState('');
  const [comparar, setComparar] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  const sinCambios = texto.trim() === activa.texto.trim();
  const otra = versiones.find((x) => x.version === comparar);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api(`/prompts/${nombre}`, { method: 'PUT', body: { texto, nota: nota || undefined } });
      toast('Versión nueva guardada. Se usa desde la próxima corrida.');
      recargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  };
  const restaurar = async (version: number) => {
    try {
      await api(`/prompts/${nombre}/restaurar`, { method: 'POST', body: { version } });
      toast(`Restaurada la versión ${version} como versión nueva`);
      recargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">
          {nombre === '_comun' ? 'Prompt global (todos los agentes)' : `Prompt: ${nombre}`}
          <span className="ml-2 text-sm font-normal text-muted">versión {activa.version}</span>
        </h2>
        <span className="text-sm text-muted">
          ≈ {estimarTokens(texto).toLocaleString('es-MX')} tokens
        </span>
      </div>
      <textarea
        aria-label="Texto del prompt"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="min-h-[300px] w-full rounded-lg border border-line bg-white p-3 font-mono text-[13px]"
      />
      <p className="mt-1 text-xs text-muted">
        Los candados de seguridad (no contactar, sin precios, solo correos internos, CDMX/Edomex) se
        añaden al final en código: no se pueden quitar desde aquí.
      </p>
      {!sinCambios && (
        <div className="mt-3">
          <h3 className="mb-1 text-sm font-semibold">Cambios sin guardar</h3>
          <Diff antes={activa.texto} despues={texto} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input
          aria-label="Nota de la versión"
          placeholder="Nota (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="flex-1 rounded-lg border border-line px-3 py-2"
        />
        <Button
          variante="primario"
          disabled={sinCambios || guardando || texto.trim().length < 20}
          onClick={() => void guardar()}
        >
          Guardar versión nueva
        </Button>
        <Button disabled={sinCambios} onClick={() => setTexto(activa.texto)}>
          Descartar
        </Button>
      </div>
      <h3 className="mb-1 mt-5 font-semibold">Versiones</h3>
      <ul className="divide-y divide-line">
        {versiones.map((x) => (
          <li key={x.version} className="flex items-center gap-2 py-1.5">
            <span className="w-8 font-medium">v{x.version}</span>
            <span className="flex-1 text-muted">
              {x.activo ? 'ACTIVA · ' : ''}
              {x.nota ?? 'Edición'} · {fechaCorta(x.creado_en)} · ≈{x.tokens} tokens
            </span>
            {!x.activo && (
              <>
                <Button
                  variante="fantasma"
                  onClick={() => setComparar(comparar === x.version ? null : x.version)}
                >
                  {comparar === x.version ? 'Ocultar diff' : 'Comparar'}
                </Button>
                <Button onClick={() => void restaurar(x.version)}>Restaurar</Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {otra && (
        <div className="mt-2">
          <p className="mb-1 text-sm text-muted">
            Versión {otra.version} → activa (v{activa.version})
          </p>
          <Diff antes={otra.texto} despues={activa.texto} />
        </div>
      )}
    </Card>
  );
}
