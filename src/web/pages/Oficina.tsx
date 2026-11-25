import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, PageHeader, cx } from '../components/ui';
import { useApi, useEventosEnVivo, type EventoActividad } from '../lib/api';
import type { EstadoApp } from '../lib/types';

const AGENTES = [
  {
    id: 'Cartografo',
    nombre: 'Cartógrafo',
    rol: 'Descubre empresas',
    color: '#00ADA9',
    piel: '#F2C9A5',
  },
  {
    id: 'Explorador',
    nombre: 'Explorador',
    rol: 'Busca por nichos',
    color: '#007F7C',
    piel: '#D9A67A',
  },
  {
    id: 'Guardian',
    nombre: 'Guardián',
    rol: 'Filtra y deduplica',
    color: '#164E5A',
    piel: '#F2C9A5',
  },
  {
    id: 'Rastreador',
    nombre: 'Rastreador',
    rol: 'Busca contactos',
    color: '#D98E04',
    piel: '#B9805A',
  },
  {
    id: 'Analista',
    nombre: 'Analista',
    rol: 'Analiza la empresa',
    color: '#00ADA9',
    piel: '#E8B88F',
  },
  {
    id: 'Estratega',
    nombre: 'Estratega',
    rol: 'Elige productos',
    color: '#7A8F97',
    piel: '#D9A67A',
  },
  { id: 'Armador', nombre: 'Armador', rol: 'Arma paquetes', color: '#007F7C', piel: '#F2C9A5' },
  { id: 'QA-1', nombre: 'QA-1', rol: 'Revisa la propuesta', color: '#D64545', piel: '#B9805A' },
  {
    id: 'Calificador',
    nombre: 'Calificador',
    rol: 'Da el score',
    color: '#164E5A',
    piel: '#E8B88F',
  },
  {
    id: 'Redactor',
    nombre: 'Redactor',
    rol: 'Escribe el reporte',
    color: '#00ADA9',
    piel: '#F2C9A5',
  },
  { id: 'QA-2', nombre: 'QA-2', rol: 'Revisión final', color: '#D64545', piel: '#D9A67A' },
  {
    id: 'Coordinador',
    nombre: 'Coordinador',
    rol: 'Coordina la oficina',
    color: '#0F3D47',
    piel: '#E8B88F',
  },
] as const;

const COLS = 4;
const ACTIVO_MS = 25000;
const W = 1000;
const H = 600;
const pos = (i: number) => ({ x: 60 + (i % COLS) * 240, y: 50 + Math.floor(i / COLS) * 190 });

interface Viaje {
  id: number;
  de: number;
  a: number;
  fase: 'sale' | 'viaja';
}
interface Estado {
  ev: EventoActividad;
  t: number;
}

function Personaje({
  color,
  piel,
  activo,
  alerta,
}: {
  color: string;
  piel: string;
  activo: boolean;
  alerta: boolean;
}) {
  return (
    <svg
      width="64"
      height="72"
      viewBox="0 0 64 72"
      className={cx(activo && !alerta && 'anim-bob')}
      aria-hidden
    >
      <rect x="14" y="38" width="36" height="30" rx="10" fill={color} />
      <rect x="6" y="42" width="12" height="20" rx="6" fill={color} opacity=".85" />
      <rect x="46" y="42" width="12" height="20" rx="6" fill={color} opacity=".85" />
      <circle cx="32" cy="24" r="15" fill={piel} />
      <path d="M17 22c1-10 8-14 15-14s14 4 15 14c-4-5-9-7-15-7s-11 2-15 7z" fill="#0F3D47" />
      <circle cx="26" cy="26" r="1.8" fill="#0F3D47" />
      <circle cx="38" cy="26" r="1.8" fill="#0F3D47" />
      {alerta ? (
        <path
          d="M27 33q5-3 10 0"
          stroke="#0F3D47"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M27 32q5 4 10 0"
          stroke="#0F3D47"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function Oficina() {
  const estado = useApi<EstadoApp>('/estado', { refreshMs: 6000 });
  const inicial = useApi<EventoActividad[]>('/actividad?limit=60');
  const [ultimo, setUltimo] = useState<Record<string, Estado>>({});
  const [feed, setFeed] = useState<EventoActividad[]>([]);
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());
  const [presentacion, setPresentacion] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setEscala(el.clientWidth / W));
    ro.observe(el);
    setEscala(el.clientWidth / W);
    return () => ro.disconnect();
  }, [presentacion]);
  useEffect(() => {
    if (!presentacion) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPresentacion(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [presentacion]);

  const alEvento = useCallback((e: EventoActividad) => {
    setUltimo((u) => ({ ...u, [e.agente]: { ev: e, t: Date.now() } }));
    setFeed((f) => [e, ...f].slice(0, 12));
    const i = AGENTES.findIndex((a) => a.id === e.agente);
    const avanza = /aprobó|guardó|armó|calificó|redactó|registró empresa|etapa/.test(e.accion);
    const devuelve = /devolvió/.test(e.accion);
    const a = devuelve ? i - 1 : i + 1;
    if (i >= 0 && a >= 0 && a < AGENTES.length && (avanza || devuelve)) {
      const id = e.id;
      setViajes((v) => [...v, { id, de: i, a, fase: 'sale' }]);
      setTimeout(
        () => setViajes((v) => v.map((x) => (x.id === id ? { ...x, fase: 'viaja' } : x))),
        40,
      );
      setTimeout(() => setViajes((v) => v.filter((x) => x.id !== id)), 1500);
    }
  }, []);
  const conectado = useEventosEnVivo(alEvento);

  const activos = useMemo(
    () => AGENTES.filter((a) => ultimo[a.id] && ahora - ultimo[a.id]!.t < ACTIVO_MS).length,
    [ultimo, ahora],
  );
  const corrida = estado.data?.corrida_activa ?? null;
  const enPausa = !corrida && activos === 0;
  const feedVisible = feed.length > 0 ? feed : (inicial.data ?? []).slice(0, 12);
  const cont = (re: RegExp) => feedVisible.filter((f) => re.test(f.accion)).length;

  const escena = (
    <div
      ref={caja}
      className="relative w-full overflow-hidden rounded-2xl bg-deep shadow-md"
      style={{ height: H * escala }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: W, height: H, transform: `scale(${escala})` }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 30%, #164E5A 0%, #0F3D47 70%)' }}
        />
        {AGENTES.map((a, i) => {
          const p = pos(i);
          const u = ultimo[a.id];
          const activo = !!u && ahora - u.t < ACTIVO_MS;
          const alerta = activo && /devolvió|rechaz|falló|error|sin_datos/i.test(u!.ev.accion);
          const texto = u
            ? `${u.ev.accion}${!presentacion && u.ev.detalle ? ` · ${u.ev.detalle}` : ''}`
            : '';
          return (
            <div
              key={a.id}
              className="absolute"
              style={{
                transform: `translate(${p.x}px, ${p.y}px)`,
                width: 200,
                opacity: enPausa ? 0.55 : 1,
                transition: 'opacity 400ms',
              }}
            >
              {activo && (
                <div
                  className="anim-pop absolute -top-9 left-1/2 z-10 w-[190px] -translate-x-1/2 rounded-lg bg-ice px-2.5 py-1.5 text-center text-[11px] leading-tight text-deep shadow-md"
                  role="status"
                >
                  {texto.length > 60 ? `${texto.slice(0, 58)}…` : texto}
                </div>
              )}
              <div className="flex items-end justify-center gap-2 pt-6">
                <Personaje color={a.color} piel={a.piel} activo={activo} alerta={alerta} />
                <div
                  className={cx(
                    'mb-1 h-10 w-14 rounded-md border-2 transition-colors duration-300',
                    activo
                      ? alerta
                        ? 'border-bad bg-bad/30'
                        : 'border-brand bg-brand/30'
                      : 'border-white/20 bg-white/5',
                  )}
                >
                  {activo && <div className="anim-pulse mx-auto mt-3 h-1.5 w-8 rounded bg-brand" />}
                </div>
              </div>
              <div className="mx-auto -mt-1 h-3 w-44 rounded-md bg-[#0b2f37]" />
              <div className="mt-1.5 text-center">
                <div className="text-sm font-semibold text-ice">{a.nombre}</div>
                <div className="text-[11px] text-ice/60">{a.rol}</div>
              </div>
            </div>
          );
        })}
        {viajes.map((v) => {
          const d = pos(v.de);
          const a = pos(v.a);
          const p = v.fase === 'sale' ? d : a;
          return (
            <div
              key={v.id}
              className="pointer-events-none absolute z-20 flex h-7 w-10 items-center justify-center rounded-md bg-brand text-xs font-bold text-deep shadow-md"
              style={{
                transform: `translate(${p.x + 80}px, ${p.y + 90}px)`,
                transition: 'transform 1.1s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              ▤
            </div>
          );
        })}
        {enPausa && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-deep/70 text-center">
            <p className="max-w-md text-lg text-ice">
              La oficina está en pausa. Inicia una corrida para verla en acción.
            </p>
            {!presentacion && (
              <Link to="/corrida">
                <Button variante="primario">Ir a Corrida</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const marcador = (
    <div className="mt-4 grid grid-cols-5 gap-3 text-center">
      {[
        ['Corrida', corrida ? `#${corrida.id} · ${corrida.zona}` : '—'],
        ['Empresas registradas', String(cont(/registró empresa|hallazgo/))],
        ['Contactos guardados', String(cont(/contacto/))],
        ['Aprobaciones QA', String(cont(/aprobó/))],
        ['Prospectos reportados', String(cont(/guardó el prospecto/))],
      ].map(([t, v]) => (
        <div key={t} className="rounded-xl border border-line bg-white px-3 py-2.5 shadow-sm">
          <div className="text-xs text-muted">{t}</div>
          <div className="text-lg font-bold">{v}</div>
        </div>
      ))}
    </div>
  );

  if (presentacion) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-deep p-6">
        <div className="mb-3 flex items-center justify-between text-ice">
          <div className="flex items-center gap-3">
            <img src="/logo-acit.png" alt="ACITMX" className="h-9 rounded bg-ice p-1" />
            <span className="text-lg font-semibold">Oficina de Prospección ACITMX</span>
          </div>
          <Button variante="secundario" onClick={() => setPresentacion(false)}>
            Salir (Esc)
          </Button>
        </div>
        <div className="mx-auto w-full max-w-[1400px] flex-1">{escena}</div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Ver oficina"
        subtitulo="Así trabajan tus agentes en este momento (solo lectura)."
        acciones={
          <>
            <span className={cx('text-xs', conectado ? 'text-ok' : 'text-muted')}>
              {conectado ? '● En vivo' : '○ Reconectando…'}
            </span>
            <Button onClick={() => setPresentacion(true)}>Modo presentación</Button>
          </>
        }
      />
      {escena}
      {marcador}
      <div className="mt-4 rounded-xl border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Últimas acciones</h2>
        {feedVisible.length === 0 ? (
          <p className="text-muted">
            Aún no hay acciones. Aparecerán aquí en cuanto los agentes trabajen.
          </p>
        ) : (
          <ul className="space-y-1">
            {feedVisible.map((f) => (
              <li key={f.id} className="anim-slide">
                <b className="text-brand-strong">{f.agente}</b> · {f.accion}
                {f.detalle ? <span className="text-muted"> · {f.detalle}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
