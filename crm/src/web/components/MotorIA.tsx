import { useState } from 'react';
import { api, useApi } from '../lib/api';
import { Button, Card, ErrorBanner, Skeleton, cx, useToast } from './ui';

interface Modelo {
  id: string;
  nombre: string;
  contexto?: number;
  limite_mensual_usd?: number;
}
interface Proveedor {
  id: 'claude' | 'gemini' | 'opencode_go';
  nombre: string;
  nota: string;
  env_key: string | null;
  conectado: boolean;
  motivo?: string;
  modelos: Modelo[];
}
interface Resp {
  seleccion: { proveedor: Proveedor['id']; modelo: string };
  calidad: Record<string, number>;
  proveedores: Proveedor[];
}
interface Prueba {
  ok: boolean;
  ms: number;
  respuesta?: string;
  tokens?: number;
  herramientas?: boolean;
  error?: string;
}

const sel = 'rounded-lg border border-line bg-white px-3 py-2';

/** Motor de IA a mano: qué proveedores tienen llave, sus modelos (con % de calidad) y cuál se usa. `compacto` = solo el selector (Corrida). */
export function MotorIA({ compacto = false }: { compacto?: boolean }) {
  const { data, error, reload } = useApi<Resp>('/motor');
  const toast = useToast();
  const [prueba, setPrueba] = useState<Record<string, Prueba | 'cargando'>>({});
  if (error) return <ErrorBanner mensaje={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-32" />;

  const elegir = async (proveedor: Proveedor['id'], modelo: string) => {
    try {
      await api('/motor/seleccion', { method: 'PUT', body: { proveedor, modelo } });
      toast('Motor actualizado');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el motor', 'error');
    }
  };
  const probar = async (p: Proveedor['id'], modelo: string) => {
    setPrueba((x) => ({ ...x, [p]: 'cargando' }));
    try {
      const r = await api<Prueba>('/motor/probar', {
        method: 'POST',
        body: { proveedor: p, modelo },
      });
      setPrueba((x) => ({ ...x, [p]: r }));
    } catch (e) {
      setPrueba((x) => ({
        ...x,
        [p]: { ok: false, ms: 0, error: e instanceof Error ? e.message : 'Error' },
      }));
    }
  };
  const guardarCalidad = async (proveedor: string, modelo: string, texto: string) => {
    const n = texto.trim() === '' ? null : Math.round(Number(texto));
    if (n !== null && !(n >= 0 && n <= 100)) return toast('El % va de 0 a 100', 'error');
    try {
      await api('/motor/calidad', { method: 'PUT', body: { proveedor, modelo, pct: n } });
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    }
  };

  const actual = data.proveedores.find((p) => p.id === data.seleccion.proveedor);
  if (compacto)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Motor de IA:</span>
        <select
          aria-label="Proveedor de IA"
          className={sel}
          value={data.seleccion.proveedor}
          onChange={(e) => {
            const p = data.proveedores.find((x) => x.id === e.target.value)!;
            void elegir(p.id, p.id === 'claude' ? '' : (p.modelos[0]?.id ?? ''));
          }}
        >
          {data.proveedores.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.conectado}>
              {p.nombre}
              {p.conectado ? '' : ' (sin llave)'}
            </option>
          ))}
        </select>
        {actual && actual.id !== 'claude' && (
          <select
            aria-label="Modelo de IA"
            className={sel}
            value={data.seleccion.modelo}
            onChange={(e) => void elegir(actual.id, e.target.value)}
          >
            {!actual.modelos.some((m) => m.id === data.seleccion.modelo) && (
              <option value={data.seleccion.modelo}>
                {data.seleccion.modelo || 'Elige modelo'}
              </option>
            )}
            {actual.modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        )}
        {actual?.id === 'claude' && <span>Sonnet 5.5</span>}
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-muted">
        Elige con qué IA trabajan las corridas. Es una selección <b>manual</b>: si un proveedor se
        agota, la corrida se detiene (no cambia sola). Las llaves se ponen en el archivo{' '}
        <code>crm\.env</code> y nunca se muestran aquí.
      </p>
      {data.proveedores.map((p) => {
        const activo = data.seleccion.proveedor === p.id;
        const pr = prueba[p.id];
        const modeloActual = activo ? data.seleccion.modelo : (p.modelos[0]?.id ?? '');
        return (
          <Card key={p.id} className={cx(activo && 'ring-2 ring-brand')}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">
                  {p.nombre}{' '}
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-xs font-normal',
                      p.conectado ? 'bg-ok/15 text-ok' : 'bg-bad/10 text-bad',
                    )}
                  >
                    {p.conectado ? '✓ Conectado' : 'Sin conectar'}
                  </span>
                  {activo && (
                    <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-normal">
                      En uso
                    </span>
                  )}
                </h3>
                <p className="text-sm text-muted">{p.nota}</p>
                {!p.conectado && p.env_key && (
                  <p className="mt-1 text-sm text-warn">
                    {p.motivo ?? `Falta ${p.env_key}`}. Agrega <code>{p.env_key}=tu_llave</code> en{' '}
                    <code>crm\.env</code> y reinicia el CRM.
                  </p>
                )}
              </div>
              {p.conectado && p.id === 'claude' && (
                <Button
                  variante={activo ? 'secundario' : 'primario'}
                  disabled={activo}
                  onClick={() => void elegir('claude', '')}
                >
                  {activo ? 'En uso' : 'Usar Claude'}
                </Button>
              )}
            </div>
            {p.conectado && p.id !== 'claude' && (
              <div className="mt-3 space-y-2">
                <div className="text-sm text-muted">
                  {p.modelos.length} modelo(s) disponibles con tu llave
                </div>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {p.modelos.map((m) => {
                    const pct = data.calidad[`${p.id}/${m.id}`];
                    const esActual = activo && data.seleccion.modelo === m.id;
                    return (
                      <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <b>{m.nombre}</b>{' '}
                          <span className="text-xs text-muted">
                            {m.id}
                            {m.contexto ? ` · ${(m.contexto / 1000).toFixed(0)}k contexto` : ''}
                            {m.limite_mensual_usd ? ` · tope ${m.limite_mensual_usd} USD/mes` : ''}
                          </span>
                        </span>
                        <label className="text-sm text-muted">
                          Calidad
                          <input
                            aria-label={`Calidad de ${m.nombre}`}
                            type="number"
                            min={0}
                            max={100}
                            placeholder="—"
                            defaultValue={pct ?? ''}
                            onBlur={(e) => void guardarCalidad(p.id, m.id, e.target.value)}
                            className="ml-1 w-16 rounded border border-line px-2 py-1"
                          />
                          %
                        </label>
                        <Button
                          variante={esActual ? 'secundario' : 'primario'}
                          disabled={esActual}
                          onClick={() => void elegir(p.id, m.id)}
                        >
                          {esActual ? 'En uso' : 'Usar'}
                        </Button>
                        <Button variante="secundario" onClick={() => void probar(p.id, m.id)}>
                          Probar
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {pr === 'cargando' && <p className="text-sm text-muted">Probando…</p>}
                {pr && pr !== 'cargando' && (
                  <p
                    className={cx(
                      'rounded-lg border px-3 py-2 text-sm',
                      pr.ok ? 'border-ok/40 bg-ok/10' : 'border-bad/40 bg-bad/10',
                    )}
                  >
                    {pr.ok
                      ? `✓ Respondió «${pr.respuesta ?? ''}» en ${(pr.ms / 1000).toFixed(1)} s · ${pr.tokens ?? 0} tokens · herramientas: ${pr.herramientas ? 'sí' : 'NO (no sirve para los agentes)'}`
                      : `✗ ${pr.error ?? 'Falló'}`}
                  </p>
                )}
                <p className="text-xs text-muted">
                  «Calidad» es tu nota (0-100) tras tus pruebas, para comparar; Claude Sonnet es la
                  referencia. Modelo para probar: <code>{modeloActual}</code>.
                </p>
              </div>
            )}
          </Card>
        );
      })}
      <Button variante="secundario" onClick={() => void api('/motor?refrescar=1').then(reload)}>
        Volver a detectar modelos
      </Button>
    </div>
  );
}
