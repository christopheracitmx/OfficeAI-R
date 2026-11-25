import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  cx,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { Markdown } from '../lib/markdown';
import { fechaCorta, type AgenteFila, type Habilidad } from '../lib/types';

const inp = 'w-full rounded-lg border border-line bg-white px-3 py-2';

interface Ed {
  id: number | null;
  nombre: string;
  descripcion: string;
  contenido_md: string;
  activo: number;
  agentes: string[];
  version: number;
}
const NUEVA: Ed = {
  id: null,
  nombre: '',
  descripcion: '',
  contenido_md: '',
  activo: 1,
  agentes: [],
  version: 0,
};

function Versiones({ id, onRestaurar }: { id: number; onRestaurar: (v: number) => void }) {
  const v = useApi<{ version: number; creado_en: string }[]>(`/habilidades/${id}/versiones`);
  return (
    <ul className="mt-2 divide-y divide-line text-sm">
      {v.data?.map((x) => (
        <li key={x.version} className="flex items-center gap-2 py-1">
          <span className="flex-1">
            v{x.version} · {fechaCorta(x.creado_en)}
          </span>
          <Button variante="fantasma" onClick={() => onRestaurar(x.version)}>
            Restaurar
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function Habilidades() {
  const lista = useApi<Habilidad[]>('/habilidades');
  const agentes = useApi<AgenteFila[]>('/agentes');
  const [e, setE] = useState<Ed | null>(null);
  const [vista, setVista] = useState(false);
  const [hist, setHist] = useState(false);
  const toast = useToast();

  const guardar = async () => {
    if (!e) return;
    try {
      const cuerpo = { nombre: e.nombre, descripcion: e.descripcion, contenido_md: e.contenido_md };
      const h =
        e.id === null
          ? await api<Habilidad>('/habilidades', { method: 'POST', body: cuerpo })
          : await api<Habilidad>(`/habilidades/${e.id}`, { method: 'PATCH', body: cuerpo });
      await api(`/habilidades/${h.id}/agentes`, { method: 'PUT', body: { agentes: e.agentes } });
      setE({ ...e, id: h.id, version: h.version });
      toast('Habilidad guardada');
      lista.reload();
    } catch (x) {
      toast(x instanceof Error ? x.message : 'No se pudo guardar', 'error');
    }
  };
  const alternar = async (h: Habilidad) => {
    try {
      await api(`/habilidades/${h.id}`, { method: 'PATCH', body: { activo: h.activo !== 1 } });
      lista.reload();
      if (e?.id === h.id) setE({ ...e, activo: h.activo === 1 ? 0 : 1 });
    } catch (x) {
      toast(x instanceof Error ? x.message : 'Error', 'error');
    }
  };
  const restaurar = async (version: number) => {
    if (e?.id == null) return;
    try {
      const h = await api<Habilidad>(`/habilidades/${e.id}/restaurar`, {
        method: 'POST',
        body: { version },
      });
      setE({ ...e, contenido_md: h.contenido_md, nombre: h.nombre, version: h.version });
      lista.reload();
      toast(`Restaurada la versión ${version}`);
    } catch (x) {
      toast(x instanceof Error ? x.message : 'Error', 'error');
    }
  };
  const alternarAgente = (a: string) =>
    e &&
    setE({
      ...e,
      agentes: e.agentes.includes(a) ? e.agentes.filter((x) => x !== a) : [...e.agentes, a],
    });

  return (
    <>
      <PageHeader
        titulo="Habilidades"
        subtitulo="Procedimientos en texto que se añaden al prompt de los agentes asignados. Solo son instrucciones: nunca ejecutan código ni instalan nada."
        acciones={
          <Button variante="primario" onClick={() => setE({ ...NUEVA })}>
            Nueva habilidad
          </Button>
        }
      />
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      <div className="grid grid-cols-[340px_1fr] gap-4">
        <div className="space-y-2">
          {lista.data?.length === 0 && <EmptyState mensaje="Sin habilidades." />}
          {lista.data?.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                setE({ ...h });
                setHist(false);
              }}
              className={cx(
                'w-full rounded-lg border p-3 text-left hover:bg-brand-soft',
                e?.id === h.id ? 'border-brand bg-brand-soft' : 'border-line bg-white',
                h.activo ? '' : 'opacity-60',
              )}
            >
              <div className="font-medium">{h.nombre}</div>
              <div className="mb-1 text-xs text-muted">
                {h.base ? 'Base · ' : ''}v{h.version}
                {h.activo ? '' : ' · desactivada'}
              </div>
              <div className="flex flex-wrap gap-1">
                {h.agentes.length === 0 ? (
                  <span className="text-xs text-warn">Sin agentes asignados</span>
                ) : (
                  h.agentes.map((a) => <Chip key={a}>{a}</Chip>)
                )}
              </div>
            </button>
          ))}
        </div>
        {e === null ? (
          <EmptyState mensaje="Elige una habilidad o crea una nueva." />
        ) : (
          <Card>
            <input
              aria-label="Nombre"
              placeholder="Nombre de la habilidad"
              value={e.nombre}
              onChange={(x) => setE({ ...e, nombre: x.target.value })}
              className={cx(inp, 'mb-2')}
            />
            <input
              aria-label="Descripción"
              placeholder="Para qué sirve (una línea)"
              value={e.descripcion}
              onChange={(x) => setE({ ...e, descripcion: x.target.value })}
              className={cx(inp, 'mb-2')}
            />
            <div className="mb-2 flex gap-2">
              <Button variante={vista ? 'secundario' : 'primario'} onClick={() => setVista(false)}>
                Editar
              </Button>
              <Button variante={vista ? 'primario' : 'secundario'} onClick={() => setVista(true)}>
                Vista previa
              </Button>
            </div>
            {vista ? (
              <div className="min-h-[200px] rounded-lg border border-line p-4">
                <Markdown texto={e.contenido_md} />
              </div>
            ) : (
              <textarea
                aria-label="Procedimiento en Markdown"
                value={e.contenido_md}
                onChange={(x) => setE({ ...e, contenido_md: x.target.value })}
                className={cx(inp, 'min-h-[200px] font-mono text-[13px]')}
              />
            )}
            <p className="mb-1 mt-3 text-sm font-medium">Agentes que la usan</p>
            <div className="flex flex-wrap gap-2">
              {agentes.data?.map((a) => (
                <label
                  key={a.id}
                  className={cx(
                    'flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-sm',
                    e.agentes.includes(a.id) ? 'border-brand bg-brand-soft' : 'border-line',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={e.agentes.includes(a.id)}
                    onChange={() => alternarAgente(a.id)}
                  />
                  {a.id}
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button
                variante="primario"
                disabled={e.nombre.trim().length < 2 || e.contenido_md.trim().length < 10}
                onClick={() => void guardar()}
              >
                Guardar
              </Button>
              {e.id !== null && (
                <>
                  <Button onClick={() => void alternar({ ...e, id: e.id!, base: 0 } as Habilidad)}>
                    {e.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button onClick={() => setHist(!hist)}>Versiones</Button>
                </>
              )}
            </div>
            {hist && e.id !== null && (
              <Versiones id={e.id} onRestaurar={(v) => void restaurar(v)} />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
