/**
 * «Personalizar»: apariencia de personajes, salas y oficina. Lista a la izquierda, controles al centro y
 * vista previa 3D en vivo a la derecha. Todo por la oficina (piso) activa; se guarda solo.
 */
import { useSearchParams } from 'react-router-dom';
import type { Campos, Entidad } from '../../shared/oficina3d/composicion';
import { ErrorBanner, PageHeader, Skeleton, cx } from '../components/ui';
import { SelectorPiso } from '../components/SelectorPiso';
import { useOficinas } from '../lib/useOficinas';
import { Barra } from './Barra';
import { PanelOficina } from './PanelOficina';
import { PanelPersonaje } from './PanelPersonaje';
import { PanelSala } from './PanelSala';
import { PresetsPanel, AccionesEquipo } from './PresetsPanel';
import { Preview } from './Preview';
import { useApariencias } from './usarApariencias';

const TABS: { id: string; entidad: Entidad; etiqueta: string }[] = [
  { id: 'personajes', entidad: 'personaje', etiqueta: 'Personajes' },
  { id: 'salas', entidad: 'sala', etiqueta: 'Salas' },
  { id: 'oficina', entidad: 'oficina', etiqueta: 'Oficina' },
];

export function Personalizar() {
  const p = useApariencias();
  const [params, setParams] = useSearchParams();
  const pisos = useOficinas().data?.length ?? 1;
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]!;
  const { def, base } = p;

  const elegir = (t: string, id?: string) =>
    setParams(id ? { tab: t, id } : { tab: t }, { replace: true });

  const cuerpo = (() => {
    if (p.error && !p.estado)
      return <ErrorBanner mensaje={p.error} onRetry={() => void p.cargar()} />;
    if (!def || !base) return <Skeleton className="h-[560px] rounded-2xl" />;
    const pedido = params.get('id');
    const personaje = def.agentes.find((a) => a.id === pedido) ?? def.agentes[0];
    const sala = def.salas.find((s) => s.id === pedido) ?? def.salas[0];
    const elementos =
      tab.entidad === 'personaje'
        ? def.agentes.map((a) => ({
            id: a.id,
            nombre: a.persona,
            detalle: a.rol,
            color: a.apariencia.camisa,
          }))
        : tab.entidad === 'sala'
          ? def.salas.map((s) => ({
              id: s.id,
              nombre: s.nombre,
              detalle: `${s.apariencia.ancho}×${s.apariencia.fondo}`,
              color: s.apariencia.acento,
            }))
          : [
              {
                id: def.office.id,
                nombre: def.office.apariencia.marca || def.office.nombre,
                detalle: `Piso ${def.office.piso}`,
                color: def.office.apariencia.colores.secundario,
              },
            ];
    const sel =
      tab.entidad === 'personaje'
        ? personaje?.id
        : tab.entidad === 'sala'
          ? sala?.id
          : def.office.id;
    if (!sel)
      return (
        <p className="text-muted">Esta oficina todavía no tiene {tab.etiqueta.toLowerCase()}.</p>
      );
    const nombre = elementos.find((e) => e.id === sel)?.nombre ?? sel;
    const ef: Campos =
      tab.entidad === 'personaje'
        ? ({ ...personaje!.apariencia } as unknown as Campos)
        : tab.entidad === 'sala'
          ? ({ ...sala!.apariencia } as unknown as Campos)
          : ({ ...def.office.apariencia } as unknown as Campos);
    return (
      <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,460px)]">
        <nav
          aria-label={`Lista de ${tab.etiqueta.toLowerCase()}`}
          className="space-y-1 lg:max-h-[640px] lg:overflow-y-auto"
        >
          {elementos.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-current={e.id === sel ? 'true' : undefined}
              onClick={() => elegir(tab.id, e.id)}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors duration-150',
                e.id === sel
                  ? 'border-brand-strong bg-brand-soft font-medium'
                  : 'border-line bg-white hover:bg-brand-soft/60',
              )}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-black/20"
                style={{ backgroundColor: e.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.nombre}</span>
                <span className="block truncate text-xs text-muted">{e.detalle}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-3">
          <Barra
            p={p}
            entidad={tab.entidad}
            id={sel}
            nombre={nombre}
            ef={ef}
            hermanos={elementos.map((e) => ({ id: e.id, nombre: e.nombre }))}
          />
          {tab.entidad === 'personaje' && (
            <>
              <AccionesEquipo p={p} />
              <PanelPersonaje
                p={p}
                agente={personaje!}
                base={base.agentes.find((a) => a.id === personaje!.id) ?? personaje!}
                agentes={def.agentes}
              />
            </>
          )}
          {tab.entidad === 'sala' && (
            <PanelSala
              p={p}
              sala={sala!}
              baseDef={base}
              def={def}
              onSala={(id) => elegir('salas', id)}
            />
          )}
          {tab.entidad === 'oficina' && (
            <PanelOficina p={p} def={def} baseDef={base} pisos={pisos} />
          )}
          <PresetsPanel
            p={p}
            tipo={tab.entidad}
            id={sel}
            titulo={
              tab.entidad === 'oficina'
                ? 'Paletas y presets de oficina'
                : `Presets de ${tab.etiqueta.toLowerCase()}`
            }
          />
          {p.descartes.length > 0 && (
            <p role="status" className="rounded-lg bg-warn/15 px-3 py-2 text-xs">
              Algunos valores guardados ya no son válidos y se ignoran:{' '}
              {p.descartes.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Preview
            def={def}
            entidad={tab.entidad}
            id={sel}
            onElegirPersonaje={(id) => elegir('personajes', id)}
          />
          <p className="mt-2 text-xs text-muted" aria-live="polite">
            {p.comparando
              ? 'Mostrando la plantilla (default) del elemento elegido.'
              : p.guardando
                ? 'Guardando…'
                : 'Cambios guardados.'}
          </p>
        </div>
      </div>
    );
  })();

  return (
    <>
      <PageHeader
        titulo="Personalizar"
        subtitulo="Cambia cómo se ven tus personajes, salas y oficina. Todo se ve al instante y se guarda solo."
        acciones={<SelectorPiso />}
      />
      <div
        role="tablist"
        aria-label="Qué personalizar"
        className="mb-4 flex gap-1 border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === tab.id}
            onClick={() => elegir(t.id)}
            className={cx(
              '-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150',
              t.id === tab.id
                ? 'border-brand-strong text-deep'
                : 'border-transparent text-muted hover:text-deep',
            )}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>
      {cuerpo}
    </>
  );
}
