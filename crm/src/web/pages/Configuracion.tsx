import { DiagnosticoInstalacion } from '../components/AvisosInstalacion';
import { useState } from 'react';
import { numeroSeguro } from '../lib/types';
import { Button, Card, ErrorBanner, PageHeader, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { Config, Destinatario, EstadoApp } from '../lib/types';

import { NoContactar, Giros, inp } from './ConfListas';
import { ConfCambios } from './ConfCambios';
import { ConfFuentes } from './ConfFuentes';
import { ConfHerramientas } from './ConfHerramientas';
import { ConfPlan } from './ConfPlan';
import { ConfRespaldos } from './ConfRespaldos';

const TABS = [
  'Correos de reportes',
  'Corridas',
  'Cuotas y motor',
  'Plan y reserva',
  'Herramientas del piso',
  'Fuentes de descubrimiento',
  'No contactar',
  'Giros',
  'Respaldos',
  'Registro de cambios',
] as const;

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
          placeholder="correo@tuempresa.com"
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
          onChange={(e) => setMax(numeroSeguro(e.target.value, 10))}
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
        <div className="text-muted">Base de datos</div>
        <div className="break-all font-mono text-sm font-semibold">{e.data.base_datos.ruta}</div>
        <p className="mt-2 text-sm text-muted">
          Modo: <b>{e.data.base_datos.modo === 'real' ? 'real' : 'DEMOSTRACIÓN (no es tu base)'}</b>
          . Antes de cada migración se respalda en la carpeta <code>backups</code> junto a la base
          (se conservan los últimos 5).
        </p>
      </Card>
      <DiagnosticoInstalacion estado={e.data} />
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
      {tab === 'Herramientas del piso' && <ConfHerramientas />}
      {tab === 'Fuentes de descubrimiento' && <ConfFuentes />}
      {tab === 'Corridas' && <Corridas />}
      {tab === 'Cuotas y motor' && <Cuotas />}
      {tab === 'Plan y reserva' && <ConfPlan />}
      {tab === 'No contactar' && <NoContactar />}
      {tab === 'Giros' && <Giros />}
      {tab === 'Respaldos' && <ConfRespaldos />}
      {tab === 'Registro de cambios' && <ConfCambios />}
    </>
  );
}
