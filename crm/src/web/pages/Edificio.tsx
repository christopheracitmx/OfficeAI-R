import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
  cx,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import { fijarOficinaActiva, useOficinaActiva } from '../lib/oficinaActiva';
import { useOficinas, type Oficina } from '../lib/useOficinas';
import { fechaCorta } from '../lib/types';
import { DialogoOficina, type ModoDialogo } from './EdificioDialogos';
import { EdificioPaquetes, EnlaceExportar } from './EdificioPaquetes';
import { WorkflowEditor } from './WorkflowEditor';

const ESTADO_CORRIDA: Record<string, string> = {
  en_curso: 'En curso',
  terminada: 'Terminada',
  detenida: 'Detenida',
  error: 'Con error',
  pausada_limite_plan: 'Pausada (límite del plan)',
  pausada_cuota_places: 'Pausada (cuota)',
  pausada_reserva_plan: 'Pausada (reserva)',
};

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{etiqueta}</dt>
      <dd className="font-medium text-deep">{valor}</dd>
    </div>
  );
}

function Tarjeta({
  o,
  activa,
  onEntrar,
  onAccion,
}: {
  o: Oficina;
  activa: boolean;
  onEntrar: () => void;
  onAccion: (a: ModoDialogo | 'archivar' | 'restaurar' | 'flujo' | 'subir' | 'bajar') => void;
}) {
  const archivada = o.estado === 'archivada';
  const u = o.ultima_corrida;
  return (
    <Card className={cx(archivada && 'opacity-70', activa && 'ring-2 ring-brand')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted">
            {archivada ? 'Archivada' : `Piso ${o.piso}`}
            {o.plantilla_origen
              ? ` · ${o.plantilla_origen.replace('duplicado:', 'copia de ')}`
              : ''}
          </p>
          <h2 className="truncate text-lg font-semibold text-deep">{o.nombre}</h2>
          {o.descripcion && <p className="mt-1 text-sm text-muted">{o.descripcion}</p>}
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
            o.corrida_activa
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-brand-soft text-brand-strong',
          )}
        >
          {archivada ? 'Archivada' : o.corrida_activa ? '● En operación' : 'Libre'}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Dato etiqueta="Agentes" valor={o.agentes} />
        <Dato
          etiqueta="Última corrida"
          valor={
            u ? `${ESTADO_CORRIDA[u.estado] ?? u.estado} · ${fechaCorta(u.iniciada_en)}` : 'Nunca'
          }
        />
        <Dato
          etiqueta="Pendientes de aprendizaje"
          valor={
            o.pendientes_aprendizaje > 0 ? `${o.pendientes_aprendizaje} por revisar` : 'Al día'
          }
        />
        <Dato
          etiqueta="Uso del plan (7 días)"
          valor={
            <span className="flex items-center gap-2">
              {o.uso_pct}%
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-brand-soft" aria-hidden>
                <span className="block h-full bg-brand" style={{ width: `${o.uso_pct}%` }} />
              </span>
            </span>
          }
        />
      </dl>
      {o.advertencias.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-warn/30 p-2 text-xs text-deep" role="note">
          {o.advertencias.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!archivada && (
          <Button variante="primario" onClick={onEntrar}>
            Entrar al piso
          </Button>
        )}
        {!archivada && <Button onClick={() => onAccion('duplicar')}>Duplicar</Button>}
        <Button onClick={() => onAccion('renombrar')}>Renombrar</Button>
        <EnlaceExportar id={o.id} />
        {!archivada && (
          <>
            <Button
              variante="fantasma"
              aria-label={`Subir ${o.nombre} un piso`}
              onClick={() => onAccion('subir')}
            >
              ▲
            </Button>
            <Button
              variante="fantasma"
              aria-label={`Bajar ${o.nombre} un piso`}
              onClick={() => onAccion('bajar')}
            >
              ▼
            </Button>
            <Button variante="fantasma" onClick={() => onAccion('flujo')}>
              Flujo (avanzado)
            </Button>
          </>
        )}
        {archivada ? (
          <Button onClick={() => onAccion('restaurar')}>Restaurar</Button>
        ) : (
          <Button variante="fantasma" onClick={() => onAccion('archivar')}>
            Archivar
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Pantalla «Edificio»: un piso por oficina, con estado y acciones (crear, duplicar, renombrar, archivar). */
export function Edificio() {
  const lista = useOficinas(8000);
  const todas = useApi<Oficina[]>('/oficinas?archivadas=1', { refreshMs: 15000 });
  const activaId = useOficinaActiva();
  const navegar = useNavigate();
  const toast = useToast();
  const [dialogo, setDialogo] = useState<{ modo: ModoDialogo; o: Oficina | null } | null>(null);
  const [archivar, setArchivar] = useState<Oficina | null>(null);
  const [flujo, setFlujo] = useState<Oficina | null>(null);
  const [galeria, setGaleria] = useState(false);

  const recargar = () => {
    lista.reload();
    todas.reload();
  };
  const llamar = async (ruta: string, ok: string, metodo = 'POST', body?: unknown) => {
    try {
      await api(ruta, { method: metodo, ...(body === undefined ? {} : { body }) });
      toast(ok);
      recargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar la acción', 'error');
    }
  };
  const mover = (o: Oficina, d: -1 | 1) => {
    const ids = (lista.data ?? []).map((x) => x.id);
    const i = ids.indexOf(o.id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void llamar('/oficinas/orden', 'Pisos reordenados', 'PUT', { orden: ids });
  };
  const accion = (
    o: Oficina,
    a: ModoDialogo | 'archivar' | 'restaurar' | 'flujo' | 'subir' | 'bajar',
  ) => {
    if (a === 'archivar') setArchivar(o);
    else if (a === 'restaurar') void llamar(`/oficinas/${o.id}/restaurar`, 'Oficina restaurada');
    else if (a === 'flujo') setFlujo(o);
    else if (a === 'subir') mover(o, 1);
    else if (a === 'bajar') mover(o, -1);
    else setDialogo({ modo: a, o });
  };
  const entrar = (o: Oficina) => {
    fijarOficinaActiva(o.id);
    navegar('/oficina');
  };

  const archivadas = (todas.data ?? []).filter((o) => o.estado === 'archivada');
  return (
    <>
      <PageHeader
        titulo="Edificio"
        subtitulo="Cada piso es una oficina con sus agentes, flujo, biblioteca y corridas. Nada se borra: solo se archiva."
        acciones={
          <>
            <Link
              to="/oficina?vista=edificio"
              className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-deep hover:bg-brand-soft"
            >
              Ver edificio en 3D
            </Link>
            <Button onClick={() => setGaleria(true)}>Galería e importar</Button>
            <Button onClick={() => setDialogo({ modo: 'crear', o: null })}>Piso vacío</Button>
            <Button variante="primario" onClick={() => navegar('/edificio/nuevo')}>
              Nuevo piso
            </Button>
          </>
        }
      />
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      {lista.loading && <Skeleton className="h-56" />}
      {lista.data && lista.data.length === 0 && (
        <EmptyState mensaje="Todavía no hay pisos en el edificio." />
      )}
      <div className="grid grid-cols-2 gap-4">
        {[...(lista.data ?? [])].reverse().map((o) => (
          <Tarjeta
            key={o.id}
            o={o}
            activa={o.id === activaId}
            onEntrar={() => entrar(o)}
            onAccion={(a) => accion(o, a)}
          />
        ))}
      </div>
      {archivadas.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold text-deep">Archivadas</h2>
          <div className="grid grid-cols-2 gap-4">
            {archivadas.map((o) => (
              <Tarjeta
                key={o.id}
                o={o}
                activa={false}
                onEntrar={() => undefined}
                onAccion={(a) => accion(o, a)}
              />
            ))}
          </div>
        </>
      )}
      {galeria && (
        <EdificioPaquetes
          onCerrar={() => setGaleria(false)}
          onHecho={(msg) => {
            setGaleria(false);
            toast(msg);
            recargar();
          }}
        />
      )}
      {dialogo && (
        <DialogoOficina
          modo={dialogo.modo}
          oficina={dialogo.o}
          pisos={lista.data ?? []}
          onCerrar={() => setDialogo(null)}
          onHecho={(msg) => {
            setDialogo(null);
            toast(msg);
            recargar();
          }}
        />
      )}
      {archivar && (
        <ConfirmDialog
          titulo={`Archivar «${archivar.nombre}»`}
          mensaje="El piso se oculta del edificio, pero sus datos se conservan y puedes restaurarlo cuando quieras. No se puede archivar con una corrida en curso."
          confirmar="Archivar"
          onCancel={() => setArchivar(null)}
          onConfirm={() => {
            const o = archivar;
            setArchivar(null);
            void llamar(`/oficinas/${o.id}/archivar`, 'Oficina archivada');
          }}
        />
      )}
      {flujo && (
        <WorkflowEditor oficina={flujo} onCerrar={() => setFlujo(null)} onGuardado={recargar} />
      )}
    </>
  );
}
