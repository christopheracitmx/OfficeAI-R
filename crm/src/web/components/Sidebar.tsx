import { NavLink } from 'react-router-dom';
import { useApi } from '../lib/api';
import type { ConteoLeccionesUi, Dashboard, EstadoApp } from '../lib/types';
import { OFICINA_PRINCIPAL } from '../lib/oficinaActiva';
import { useOficinaActual } from '../lib/useOficinas';
import { PlanMedidor } from './PlanMedidor';
import { SelectorPiso } from './SelectorPiso';
import { cx } from './ui';

const ITEMS = [
  { to: '/', etiqueta: 'Inicio', icono: '◧' },
  { to: '/edificio', etiqueta: 'Edificio', icono: '▦' },
  { to: '/prospectos', etiqueta: 'Prospectos', icono: '◉', badge: 'sinVer', soloProspeccion: true },
  { to: '/embudo', etiqueta: 'Embudo', icono: '▥', soloProspeccion: true },
  { to: '/directorio', etiqueta: 'Directorio', icono: '▤', soloProspeccion: true },
  { to: '/oficina', etiqueta: 'Ver oficina', icono: '✦', badge: 'activa' },
  { to: '/corrida', etiqueta: 'Corrida', icono: '▶' },
  { to: '/biblioteca', etiqueta: 'Biblioteca', icono: '▣' },
  { to: '/prompts', etiqueta: 'Prompts', icono: '✎' },
  { to: '/habilidades', etiqueta: 'Habilidades', icono: '★' },
  { to: '/aprendizaje', etiqueta: 'Aprendizaje', icono: '✧', badge: 'lecciones' },
  { to: '/salidas', etiqueta: 'Salidas', icono: '☰' },
  { to: '/actividad', etiqueta: 'Actividad', icono: '≋' },
  { to: '/configuracion', etiqueta: 'Configuración', icono: '⚙' },
] as const;

export function Sidebar() {
  const dash = useApi<Dashboard>('/dashboard', { refreshMs: 15000 });
  const estado = useApi<EstadoApp>('/estado', { refreshMs: 15000 });
  const lecciones = useApi<ConteoLeccionesUi>('/lecciones-conteo', { refreshMs: 20000 });
  const sinVer = dash.data?.sin_ver ?? 0;
  const porRevisar = lecciones.data?.propuestas ?? 0;
  const activa = Boolean(estado.data?.corrida_activa);
  const { id: oficinaId, oficina } = useOficinaActual();
  const items = ITEMS.filter((it) => !('soloProspeccion' in it) || oficinaId === OFICINA_PRINCIPAL);
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col bg-deep text-ice">
      <div className="p-4">
        <div className="rounded-lg bg-ice p-2">
          <img
            src="/logo-acit.png"
            alt="ACITMX Integration Technology"
            className="mx-auto h-12 w-auto"
          />
        </div>
        <p className="mt-3 text-center text-xs tracking-wide text-ice/70">
          {oficina?.nombre ?? 'Oficina'}
        </p>
        <SelectorPiso oscuro className="mt-2" />
      </div>
      {estado.data?.base_datos.modo === 'demo' && (
        <div
          role="alert"
          className="mx-3 mb-3 rounded-lg bg-warn px-3 py-2 text-xs font-semibold text-deep"
        >
          BASE DE DEMOSTRACIÓN: no son tus datos reales. Cierra este servidor y abre
          iniciar-crm.bat.
        </div>
      )}
      <nav className="flex-1 space-y-1 px-3" aria-label="Principal">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 transition-colors duration-150',
                isActive
                  ? 'border-brand bg-deep-2 font-medium'
                  : 'border-transparent text-ice/85 hover:bg-deep-2',
              )
            }
          >
            <span aria-hidden className="w-4 text-center text-brand">
              {it.icono}
            </span>
            <span className="flex-1">{it.etiqueta}</span>
            {'badge' in it && it.badge === 'sinVer' && sinVer > 0 && (
              <span className="rounded-full bg-brand px-2 text-xs font-semibold text-deep">
                {sinVer}
              </span>
            )}
            {'badge' in it && it.badge === 'lecciones' && porRevisar > 0 && (
              <span
                className="rounded-full bg-brand px-2 text-xs font-semibold text-deep"
                title={`${porRevisar} lección(es) por revisar`}
              >
                {porRevisar}
              </span>
            )}
            {'badge' in it && it.badge === 'activa' && activa && (
              <span
                className="anim-pulse h-2 w-2 rounded-full bg-brand"
                title="Hay agentes trabajando"
              />
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 pt-3">
        <PlanMedidor compacto />
      </div>
      <div className="space-y-1 p-4 text-xs text-ice/70">
        <div>
          Motor IA: <span className="font-medium text-ice">{estado.data?.motor_ia ?? '—'}</span>
        </div>
        <div>
          Places:{' '}
          <span className="font-medium text-ice">
            {estado.data
              ? `${estado.data.places.usado.toLocaleString('es-MX')} / ${estado.data.places.tope.toLocaleString('es-MX')}`
              : '—'}
          </span>
        </div>
      </div>
    </aside>
  );
}
