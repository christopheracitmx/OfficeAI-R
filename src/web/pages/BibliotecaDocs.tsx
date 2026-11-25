import { useState } from 'react';
import { Button, Card, EmptyState, ErrorBanner, Skeleton, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { Markdown } from '../lib/markdown';
import {
  KB_TIPO_ETIQUETA,
  fechaCorta,
  type KbDocCompleto,
  type KbDocResumen,
  type KbVersion,
} from '../lib/types';

const inp = 'w-full rounded-lg border border-line bg-white px-3 py-2';
const TIPOS = Object.keys(KB_TIPO_ETIQUETA);

interface Borrador {
  id: number | null;
  tipo: string;
  titulo: string;
  tags: string;
  contenido_md: string;
  activo: number;
  version: number;
}
const NUEVO: Borrador = {
  id: null,
  tipo: 'otro',
  titulo: '',
  tags: '',
  contenido_md: '',
  activo: 1,
  version: 0,
};

function Historial({ id, onRestaurar }: { id: number; onRestaurar: (v: number) => void }) {
  const v = useApi<KbVersion[]>(`/kb/docs/${id}/versiones`);
  const [ver, setVer] = useState<number | null>(null);
  if (!v.data) return <Skeleton className="h-10" />;
  const abierta = v.data.find((x) => x.version === ver);
  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <h3 className="mb-2 font-semibold">Historial</h3>
      <ul className="divide-y divide-line">
        {v.data.map((x) => (
          <li key={x.version} className="flex items-center gap-2 py-1.5">
            <span className="w-8 font-medium">v{x.version}</span>
            <span className="flex-1 text-muted">
              {x.nota ?? 'Edición'} · {fechaCorta(x.creado_en)}
            </span>
            <Button
              variante="fantasma"
              onClick={() => setVer(ver === x.version ? null : x.version)}
            >
              {ver === x.version ? 'Ocultar' : 'Ver'}
            </Button>
            <Button onClick={() => onRestaurar(x.version)}>Restaurar</Button>
          </li>
        ))}
      </ul>
      {abierta && (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-ice p-3 text-xs">
          {abierta.contenido_md}
        </pre>
      )}
    </div>
  );
}

export function BibliotecaDocs() {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const lista = useApi<KbDocResumen[]>(
    `/kb/docs?${tipo ? `tipo=${tipo}&` : ''}${q ? `q=${encodeURIComponent(q)}&` : ''}${mostrarArchivados ? '' : 'activo=1'}`,
  );
  const [b, setB] = useState<Borrador | null>(null);
  const [vista, setVista] = useState(false);
  const [hist, setHist] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();

  const abrir = async (id: number) => {
    try {
      const d = await api<KbDocCompleto>(`/kb/docs/${id}`);
      setB({ ...d, id: d.id });
      setHist(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo abrir', 'error');
    }
  };
  const guardar = async () => {
    if (!b) return;
    setGuardando(true);
    try {
      const cuerpo = { tipo: b.tipo, titulo: b.titulo, tags: b.tags, contenido_md: b.contenido_md };
      const d =
        b.id === null
          ? await api<KbDocCompleto>('/kb/docs', { method: 'POST', body: cuerpo })
          : await api<KbDocCompleto>(`/kb/docs/${b.id}`, { method: 'PATCH', body: cuerpo });
      setB({ ...d, id: d.id });
      toast(`Guardado (versión ${d.version})`);
      lista.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  };
  const archivar = async (activo: boolean) => {
    if (b?.id == null) return;
    try {
      await api(`/kb/docs/${b.id}`, { method: 'PATCH', body: { activo } });
      setB({ ...b, activo: activo ? 1 : 0 });
      lista.reload();
      toast(activo ? 'Documento reactivado' : 'Documento archivado: los agentes ya no lo ven');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const restaurar = async (version: number) => {
    if (b?.id == null) return;
    try {
      const d = await api<KbDocCompleto>(`/kb/docs/${b.id}/restaurar`, {
        method: 'POST',
        body: { version },
      });
      setB({ ...d, id: d.id });
      lista.reload();
      toast(`Restaurada la versión ${version} como v${d.version}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  return (
    <div className="grid grid-cols-[320px_1fr] gap-4">
      <div>
        <div className="mb-2 flex gap-2">
          <input
            aria-label="Buscar documentos"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inp}
          />
          <Button variante="primario" onClick={() => setB({ ...NUEVO })}>
            Nuevo
          </Button>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <select
            aria-label="Tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-white px-2 py-1.5"
          >
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {KB_TIPO_ETIQUETA[t]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={mostrarArchivados}
              onChange={(e) => setMostrarArchivados(e.target.checked)}
            />
            archivados
          </label>
        </div>
        {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
        {lista.data?.length === 0 && <EmptyState mensaje="Sin documentos con ese filtro." />}
        <ul className="space-y-1">
          {lista.data?.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => void abrir(d.id)}
                className={cx(
                  'w-full rounded-lg border px-3 py-2 text-left hover:bg-brand-soft',
                  b?.id === d.id ? 'border-brand bg-brand-soft' : 'border-line bg-white',
                  d.activo ? '' : 'opacity-60',
                )}
              >
                <div className="font-medium">{d.titulo}</div>
                <div className="text-xs text-muted">
                  {KB_TIPO_ETIQUETA[d.tipo] ?? d.tipo} · v{d.version}
                  {d.activo ? '' : ' · archivado'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {b === null ? (
        <EmptyState mensaje="Elige un documento o crea uno nuevo. Aquí vive todo lo que los agentes consultan sobre el negocio." />
      ) : (
        <Card>
          <div className="mb-3 grid grid-cols-[1fr_200px] gap-2">
            <input
              aria-label="Título"
              placeholder="Título"
              value={b.titulo}
              onChange={(e) => setB({ ...b, titulo: e.target.value })}
              className={inp}
            />
            <select
              aria-label="Tipo de documento"
              value={b.tipo}
              onChange={(e) => setB({ ...b, tipo: e.target.value })}
              className={inp}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {KB_TIPO_ETIQUETA[t]}
                </option>
              ))}
            </select>
          </div>
          <input
            aria-label="Etiquetas"
            placeholder="Etiquetas separadas por coma"
            value={b.tags}
            onChange={(e) => setB({ ...b, tags: e.target.value })}
            className={cx(inp, 'mb-3')}
          />
          <div className="mb-2 flex gap-2">
            <Button variante={vista ? 'secundario' : 'primario'} onClick={() => setVista(false)}>
              Editar
            </Button>
            <Button variante={vista ? 'primario' : 'secundario'} onClick={() => setVista(true)}>
              Vista previa
            </Button>
            <span className="ml-auto self-center text-xs text-muted">
              {b.contenido_md.length.toLocaleString('es-MX')} caracteres · sin precios
            </span>
          </div>
          {vista ? (
            <div className="min-h-[300px] rounded-lg border border-line p-4">
              <Markdown texto={b.contenido_md} />
            </div>
          ) : (
            <textarea
              aria-label="Contenido en Markdown"
              value={b.contenido_md}
              onChange={(e) => setB({ ...b, contenido_md: e.target.value })}
              className={cx(inp, 'min-h-[300px] font-mono text-[13px]')}
            />
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button
              variante="primario"
              disabled={guardando || b.titulo.trim().length < 2 || !b.contenido_md.trim()}
              onClick={() => void guardar()}
            >
              {b.id === null ? 'Crear documento' : 'Guardar cambios'}
            </Button>
            {b.id !== null && (
              <>
                <Button onClick={() => setHist(!hist)}>Historial</Button>
                <Button onClick={() => void archivar(b.activo !== 1)}>
                  {b.activo === 1 ? 'Archivar' : 'Reactivar'}
                </Button>
              </>
            )}
          </div>
          {hist && b.id !== null && <Historial id={b.id} onRestaurar={(v) => void restaurar(v)} />}
        </Card>
      )}
    </div>
  );
}
