import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Skeleton,
  cx,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { fechaCorta, type AgenteFila, type LeccionFila } from '../lib/types';
import { inp } from './ConfListas';
import { Historial, Nueva } from './AprendizajeNueva';

export type VistaLecciones = 'propuestas' | 'aprobadas' | 'archivadas';
const ESTADO: Record<VistaLecciones, string> = {
  propuestas: 'propuesta',
  aprobadas: 'aprobada',
  archivadas: 'archivada',
};
const VACIO: Record<VistaLecciones, string> = {
  propuestas:
    'No hay propuestas pendientes. Aparecen al pedir una «Reflexión» o al escribir una lección a mano.',
  aprobadas: 'Aún no hay lecciones activas. Solo las aprobadas se inyectan en los prompts.',
  archivadas: 'Nada archivado todavía.',
};
const MAX = 300;

function Tarjeta({ l, onCambio }: { l: LeccionFila; onCambio: () => void }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(l.texto);
  const [verHistorial, setVerHistorial] = useState(false);
  const evid = (() => {
    try {
      return JSON.parse(l.evidencia ?? '{}') as { feedback?: number[]; fusiona?: number[] };
    } catch {
      return {};
    }
  })();
  const run = async (ruta: string, ok: string, body?: object) => {
    try {
      await api(ruta, { method: 'POST', ...(body ? { body } : {}) });
      toast(ok);
      onCambio();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const guardar = async () => {
    try {
      await api(`/lecciones/${l.id}`, { method: 'PATCH', body: { texto } });
      toast('Lección guardada (nueva versión)');
      setEditando(false);
      onCambio();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip tono={l.tipo === 'error' ? 'inferencia' : 'evidencia'}>
          {l.tipo === 'error' ? 'EVITA' : 'REPITE'}
        </Chip>
        <span className="font-medium">{l.agente}</span>
        <span className="text-muted">
          · {l.origen === 'reflexion' ? 'Reflexión' : 'Manual'} · v{l.version} ·{' '}
          {fechaCorta(l.actualizado_en ?? l.creado_en)}
        </span>
        {evid.feedback && evid.feedback.length > 0 && (
          <span className="text-muted">· {evid.feedback.length} evidencia(s)</span>
        )}
        {evid.fusiona && evid.fusiona.length > 0 && (
          <Chip>Fusiona #{evid.fusiona.join(', #')}</Chip>
        )}
      </div>
      {editando ? (
        <div className="space-y-2">
          <textarea
            aria-label="Texto de la lección"
            rows={3}
            maxLength={MAX}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={cx(inp, 'w-full')}
          />
          <div className="flex items-center gap-2">
            <Button variante="primario" onClick={() => void guardar()}>
              Guardar
            </Button>
            <Button
              onClick={() => {
                setEditando(false);
                setTexto(l.texto);
              }}
            >
              Cancelar
            </Button>
            <span className="text-sm text-muted">
              {texto.length}/{MAX}
            </span>
          </div>
        </div>
      ) : (
        <p className="leading-relaxed">{l.texto}</p>
      )}
      {!editando && (
        <div className="flex flex-wrap gap-2">
          {l.estado !== 'aprobada' && l.estado !== 'archivada' && (
            <Button
              variante="primario"
              onClick={() =>
                void run(`/lecciones/${l.id}/aprobar`, 'Lección aprobada: ya se inyecta')
              }
            >
              Aprobar
            </Button>
          )}
          <Button onClick={() => setEditando(true)}>Editar</Button>
          {l.estado === 'propuesta' && (
            <Button
              onClick={() => void run(`/lecciones/${l.id}/descartar`, 'Propuesta descartada')}
            >
              Descartar
            </Button>
          )}
          {l.estado === 'aprobada' && (
            <Button onClick={() => void run(`/lecciones/${l.id}/archivar`, 'Lección archivada')}>
              Archivar
            </Button>
          )}
          {l.estado === 'archivada' && (
            <Button onClick={() => void run(`/lecciones/${l.id}/reabrir`, 'Vuelve a propuestas')}>
              Reabrir
            </Button>
          )}
          <Button variante="fantasma" onClick={() => setVerHistorial(!verHistorial)}>
            {verHistorial ? 'Ocultar historial' : 'Historial'}
          </Button>
        </div>
      )}
      {verHistorial && (
        <Historial
          id={l.id}
          onRestaurar={(v) =>
            void run(`/lecciones-restaurar/${l.id}`, 'Versión restaurada como propuesta', {
              version: v,
            })
          }
        />
      )}
    </Card>
  );
}

/** Lista de lecciones por estado con filtros, edición, historial y alta manual. */
export function AprendizajeLecciones({
  vista,
  onCambio,
}: {
  vista: VistaLecciones;
  onCambio: () => void;
}) {
  const [agente, setAgente] = useState('');
  const [tipo, setTipo] = useState('');
  const [origen, setOrigen] = useState('');
  const [q, setQ] = useState('');
  const agentes = useApi<AgenteFila[]>('/agentes');
  const p = new URLSearchParams({ estado: ESTADO[vista] });
  if (agente) p.set('agente', agente);
  if (tipo) p.set('tipo', tipo);
  if (origen) p.set('origen', origen);
  if (q.trim()) p.set('q', q.trim());
  const ls = useApi<LeccionFila[]>(`/lecciones?${p.toString()}`);
  const recargar = () => {
    ls.reload();
    onCambio();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filtrar por agente"
          className={inp}
          value={agente}
          onChange={(e) => setAgente(e.target.value)}
        >
          <option value="">Todos los agentes</option>
          {(agentes.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.persona} ({a.id})
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por tipo"
          className={inp}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="">Aciertos y errores</option>
          <option value="acierto">Solo aciertos</option>
          <option value="error">Solo errores</option>
        </select>
        <select
          aria-label="Filtrar por origen"
          className={inp}
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
        >
          <option value="">Cualquier origen</option>
          <option value="reflexion">Reflexión</option>
          <option value="manual">Manual</option>
        </select>
        <input
          aria-label="Buscar texto"
          placeholder="Buscar…"
          className={cx(inp, 'w-56')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {vista === 'propuestas' && agentes.data && (
        <Nueva agentes={agentes.data} onListo={recargar} />
      )}
      {ls.error ? (
        <ErrorBanner mensaje={ls.error} onRetry={ls.reload} />
      ) : !ls.data ? (
        <Skeleton className="h-32" />
      ) : ls.data.length === 0 ? (
        <EmptyState mensaje={VACIO[vista]} />
      ) : (
        ls.data.map((l) => (
          <Tarjeta key={`${l.id}-${l.version}-${l.estado}`} l={l} onCambio={recargar} />
        ))
      )}
    </div>
  );
}
