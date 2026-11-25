import { useState } from 'react';
import { Button, Card, ErrorBanner, PageHeader, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { Config, Destinatario, EstadoApp } from '../lib/types';

const TABS = [
  'Correos de reportes',
  'Corridas',
  'Cuotas y motor',
  'No contactar',
  'Giros',
] as const;
const inp = 'rounded-lg border border-line bg-white px-3 py-2';

function Correos() {
  const lista = useApi<Destinatario[]>('/config/destinatarios');
  const estado = useApi<EstadoApp>('/estado');
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      lista.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const activos = (lista.data ?? []).filter((d) => d.activo).length;
  return (
    <div className="space-y-4">
      <p className="text-muted">
        Estos correos reciben la alerta de cada prospecto. El servidor <b>solo</b> envía a esta
        lista; nunca a clientes. El expediente completo siempre queda en el CRM.
      </p>
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      {lista.data && activos === 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3">
          ⚠ No hay destinatarios activos: los prospectos se guardan pero no se enviará ninguna
          alerta.
        </div>
      )}
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {(lista.data ?? []).map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1">
              <b>{d.email}</b>
              {d.nombre && <span className="text-muted"> · {d.nombre}</span>}
            </span>
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={d.activo === 1}
                onChange={(e) =>
                  void run(
                    () =>
                      api(`/config/destinatarios/${d.id}`, {
                        method: 'PATCH',
                        body: { activo: e.target.checked },
                      }),
                    'Actualizado',
                  )
                }
              />{' '}
              Activo
            </label>
            <Button
              variante="fantasma"
              onClick={() =>
                void run(
                  () => api(`/config/destinatarios/${d.id}/prueba`, { method: 'POST', body: {} }),
                  'Correo de prueba enviado',
                )
              }
            >
              Enviar prueba
            </Button>
            <Button
              variante="fantasma"
              onClick={() => {
                if (confirm(`¿Quitar ${d.email}?`))
                  void run(
                    () => api(`/config/destinatarios/${d.id}`, { method: 'DELETE' }),
                    'Destinatario eliminado',
                  );
              }}
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api('/config/destinatarios', {
                method: 'POST',
                body: { email, ...(nombre ? { nombre } : {}) },
              }).then(() => {
                setEmail('');
                setNombre('');
              }),
            'Destinatario agregado',
          );
        }}
      >
        <input
          aria-label="Correo"
          type="email"
          required
          placeholder="correo@acitmx.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cx(inp, 'w-72')}
        />
        <input
          aria-label="Nombre"
          placeholder="Nombre (opcional)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={cx(inp, 'w-56')}
        />
        <Button variante="primario" type="submit">
          Agregar
        </Button>
      </form>
      <p className="text-sm text-muted">
        Remitente: <b>{estado.data?.remitente ?? '—'}</b> ·{' '}
        {estado.data?.resend_configurado
          ? 'Resend conectado ✓'
          : '⚠ Resend sin configurar: agrega RESEND_API_KEY en el archivo .env y reinicia.'}
      </p>
    </div>
  );
}

function Corridas() {
  const cfg = useApi<Config>('/config');
  const toast = useToast();
  const [max, setMax] = useState<number | null>(null);
  const [zonas, setZonas] = useState<string | null>(null);
  if (!cfg.data) return null;
  const guardar = async () => {
    try {
      await api('/config', {
        method: 'PATCH',
        body: {
          max_empresas_por_corrida: max ?? cfg.data!.max_empresas_por_corrida,
          zonas_piloto: (zonas ?? cfg.data!.zonas_piloto.join(', '))
            .split(',')
            .map((z) => z.trim())
            .filter(Boolean),
        },
      });
      toast('Configuración guardada');
      cfg.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  return (
    <div className="max-w-xl space-y-4">
      <label className="block text-muted">
        Máximo de empresas por corrida (por defecto)
        <input
          type="number"
          min={1}
          max={50}
          className={cx(inp, 'mt-1 w-full')}
          value={max ?? cfg.data.max_empresas_por_corrida}
          onChange={(e) => setMax(Number(e.target.value))}
        />
      </label>
      <label className="block text-muted">
        Zonas piloto activas (separadas por coma)
        <input
          className={cx(inp, 'mt-1 w-full')}
          value={zonas ?? cfg.data.zonas_piloto.join(', ')}
          onChange={(e) => setZonas(e.target.value)}
        />
      </label>
      <p className="text-sm text-muted">
        Hoy solo se reconocen CDMX y Estado de México. Agregar otra zona aquí no basta: antes hay
        que enseñarle al sistema sus municipios.
      </p>
      <Button variante="primario" onClick={() => void guardar()}>
        Guardar
      </Button>
    </div>
  );
}

function Cuotas() {
  const e = useApi<EstadoApp>('/estado');
  if (!e.data) return null;
  return (
    <div className="max-w-xl space-y-3">
      <Card>
        <div className="text-muted">Google Places este mes ({e.data.places.mes})</div>
        <div className="text-2xl font-bold">
          {e.data.places.usado.toLocaleString('es-MX')}{' '}
          <span className="text-base font-normal text-muted">
            de {e.data.places.tope.toLocaleString('es-MX')}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          El tope es el límite gratuito menos un margen de 100. El contador se reinicia cada mes.
          Además, mantén cuotas diarias bajas y una alerta de presupuesto en Google Cloud.
        </p>
      </Card>
      <Card>
        <div className="text-muted">Motor de IA activo</div>
        <div className="text-2xl font-bold">{e.data.motor_ia}</div>
        <p className="mt-2 text-sm text-muted">
          Para cambiar de motor (claude-code, opencode o gemini) edita la línea <code>engine:</code>{' '}
          en <code>config/engine.yaml</code>.
        </p>
      </Card>
    </div>
  );
}

function NoContactar() {
  const l =
    useApi<{ id: number; tipo: string; valor: string; motivo: string | null }[]>(
      '/config/no-contactar',
    );
  const toast = useToast();
  const [tipo, setTipo] = useState('dominio');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const run = (fn: () => Promise<unknown>, ok: string) =>
    fn()
      .then(() => {
        toast(ok);
        l.reload();
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'error'));
  return (
    <div className="space-y-4">
      <p className="text-muted">
        Dominios, correos, teléfonos o nombres que no deben volver a trabajarse. Los agentes los
        respetan antes de guardar una empresa.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {(l.data ?? []).length === 0 && (
          <li className="px-4 py-3 text-muted">La lista está vacía.</li>
        )}
        {(l.data ?? []).map((n) => (
          <li key={n.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-20 text-xs uppercase text-muted">{n.tipo}</span>
            <b className="flex-1">{n.valor}</b>
            <span className="text-muted">{n.motivo}</span>
            <Button
              variante="fantasma"
              onClick={() =>
                void run(() => api(`/config/no-contactar/${n.id}`, { method: 'DELETE' }), 'Quitado')
              }
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api('/config/no-contactar', {
                method: 'POST',
                body: { tipo, valor, ...(motivo ? { motivo } : {}) },
              }).then(() => {
                setValor('');
                setMotivo('');
              }),
            'Agregado',
          );
        }}
      >
        <select
          aria-label="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={inp}
        >
          {['dominio', 'correo', 'telefono', 'nombre'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          aria-label="Valor"
          required
          placeholder="Valor"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={cx(inp, 'w-64')}
        />
        <input
          aria-label="Motivo"
          placeholder="Motivo (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className={cx(inp, 'w-64')}
        />
        <Button variante="primario" type="submit">
          Agregar
        </Button>
      </form>
    </div>
  );
}

function Giros() {
  const l = useApi<{ id: number; nombre: string }[]>('/config/giros');
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {(l.data ?? []).map((g) => (
          <span key={g.id} className="rounded-full bg-brand-soft px-3 py-1 text-brand-strong">
            {g.nombre}
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api('/config/giros', { method: 'POST', body: { nombre } })
            .then(() => {
              toast('Giro agregado');
              setNombre('');
              l.reload();
            })
            .catch((x: unknown) => toast(x instanceof Error ? x.message : 'Error', 'error'));
        }}
      >
        <input
          aria-label="Nuevo giro"
          required
          placeholder="Nuevo giro"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={cx(inp, 'w-64')}
        />
        <Button variante="primario" type="submit">
          Agregar giro
        </Button>
      </form>
    </div>
  );
}

export function Configuracion() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  return (
    <>
      <PageHeader titulo="Configuración" />
      <div role="tablist" className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2 font-medium transition-colors',
              tab === t
                ? 'border-brand text-deep'
                : 'border-transparent text-muted hover:text-deep',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Correos de reportes' && <Correos />}
      {tab === 'Corridas' && <Corridas />}
      {tab === 'Cuotas y motor' && <Cuotas />}
      {tab === 'No contactar' && <NoContactar />}
      {tab === 'Giros' && <Giros />}
    </>
  );
}
