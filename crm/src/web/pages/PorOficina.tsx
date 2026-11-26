/** Pantallas que cambian según el piso activo: las de prospección solo existen en esa oficina. */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, PageHeader } from '../components/ui';
import { fijarOficinaActiva, OFICINA_PRINCIPAL, useOficinaActiva } from '../lib/oficinaActiva';
import { useOficinaActual } from '../lib/useOficinas';
import { Corrida } from './Corrida';
import { CorridaGenerica } from './CorridaGenerica';
import { Inicio } from './Inicio';

export function SoloProspeccion({ children }: { children: ReactNode }) {
  const activa = useOficinaActiva();
  const navegar = useNavigate();
  if (activa === OFICINA_PRINCIPAL) return <>{children}</>;
  return (
    <EmptyState
      mensaje="Esta sección es propia de la oficina de Prospección (prospectos, embudo y directorio de empresas)."
      accion={
        <Button
          onClick={() => {
            fijarOficinaActiva(OFICINA_PRINCIPAL);
            navegar('/');
          }}
        >
          Ir al piso de Prospección
        </Button>
      }
    />
  );
}

export const CorridaSegunOficina = () =>
  useOficinaActiva() === OFICINA_PRINCIPAL ? <Corrida /> : <CorridaGenerica />;

function InicioOficina() {
  const { oficina } = useOficinaActual();
  return (
    <>
      <PageHeader
        titulo={oficina?.nombre ?? 'Oficina'}
        subtitulo={oficina?.descripcion || 'Resumen del piso activo.'}
      />
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-muted">Agentes</p>
          <p className="text-2xl font-semibold">{oficina?.agentes ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-muted">Lecciones por revisar</p>
          <p className="text-2xl font-semibold">{oficina?.pendientes_aprendizaje ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-muted">Uso del plan (7 días)</p>
          <p className="text-2xl font-semibold">{oficina ? `${oficina.uso_pct}%` : '—'}</p>
        </Card>
      </div>
      <div className="mt-6 flex gap-2">
        <Link
          to="/corrida"
          className="rounded-lg bg-brand-strong px-3.5 py-2 text-sm font-medium text-white hover:bg-deep-2"
        >
          Iniciar una corrida
        </Link>
        <Link
          to="/oficina"
          className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-deep hover:bg-brand-soft"
        >
          Ver oficina
        </Link>
        <Link
          to="/edificio"
          className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-deep hover:bg-brand-soft"
        >
          Ver el edificio
        </Link>
      </div>
    </>
  );
}

export const InicioSegunOficina = () =>
  useOficinaActiva() === OFICINA_PRINCIPAL ? <Inicio /> : <InicioOficina />;
