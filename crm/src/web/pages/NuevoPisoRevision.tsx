import { useState } from 'react';
import { Button, Card, ErrorBanner, Skeleton } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { SesionCons, VistaPreviaCons } from '../lib/types-constructor';
import { Preview } from '../personalizar/Preview';

/** Fases 7-9: vista previa 3D, prueba controlada (con estimado y confirmación), edición avanzada y creación. */
export function NuevoPisoRevision({
  s,
  guardar,
  onCreado,
  onSesion,
}: {
  s: SesionCons;
  guardar: (parche: Record<string, unknown>, fase?: number) => Promise<void>;
  onCreado: (officeId: string) => void;
  onSesion: (s: SesionCons) => void;
}) {
  const vp = useApi<VistaPreviaCons>(
    `/constructor/sesiones/${s.id}/vista-previa?v=${JSON.stringify(s.borrador).length}`,
  );
  const [json, setJson] = useState(() => JSON.stringify(s.borrador, null, 2));
  const [errJson, setErrJson] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<{ texto: string; tokens: number } | null>(null);
  const [confirmaPrueba, setConfirmaPrueba] = useState(false);
  const [aprobado, setAprobado] = useState(false);
  const [confirmaCandados, setConfirmaCandados] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const d = vp.data;
  const relaja = (s.borrador.relajar_candados ?? []).length > 0;
  const listo = !!d?.paquete && d.errores.length === 0;

  const correr = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setOcupado(false);
    }
  };

  const aplicarJson = () => {
    try {
      const v: unknown = JSON.parse(json);
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        throw new Error('Debe ser un objeto');
      setErrJson(null);
      void guardar(v as Record<string, unknown>);
    } catch (e) {
      setErrJson(e instanceof Error ? e.message : 'JSON inválido');
    }
  };

  return (
    <div className="space-y-4">
      {vp.error && <ErrorBanner mensaje={vp.error} onRetry={vp.reload} />}
      {vp.loading && <Skeleton className="h-40 w-full" />}
      {d && d.errores.length > 0 && (
        <Card className="border-bad">
          <h3 role="alert" className="font-semibold text-bad">
            Falta corregir antes de crear
          </h3>
          <ul className="list-disc pl-5 text-sm">
            {d.errores.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Card>
      )}
      {d?.paquete && (
        <Card>
          <h3 className="font-semibold text-deep">Fase 7: vista previa 3D del piso propuesto</h3>
          <p className="mb-2 text-sm text-muted">
            Así quedará el piso «{d.paquete.office.nombre}» con apariencias por defecto (equipo
            repartido 50/50). Podrás personalizarlo después en «Personalizar».
          </p>
          <Preview
            def={d.paquete.planta}
            entidad="oficina"
            id="oficina"
            onElegirPersonaje={() => undefined}
          />
          <ul className="mt-3 grid grid-cols-2 gap-1 text-sm">
            {d.paquete.agentes.map((a) => (
              <li key={a.id}>
                {a.genero === 'f' ? '👩' : '👨'} <b>{a.persona}</b> · {a.rol} · {a.area}
              </li>
            ))}
          </ul>
          {d.advertencias.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-deep">
              {d.advertencias.map((x) => (
                <li key={x}>⚠ {x}</li>
              ))}
            </ul>
          )}
          {d.integraciones.length > 0 && (
            <div className="mt-3 rounded-lg border border-line p-3 text-sm">
              <b>Requiere herramienta nueva</b> (no está en el catálogo; el piso se crea sin ella y
              esta es su especificación):
              <ul className="list-disc pl-5">
                {d.integraciones.map((i) => (
                  <li key={i.nombre}>
                    <b>{i.nombre}</b>: {i.descripcion} {i.entrada && `· entrada: ${i.entrada}`}{' '}
                    {i.salida && `· salida: ${i.salida}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      <Card>
        <h3 className="font-semibold text-deep">Fase 8: prueba controlada (opcional)</h3>
        <p className="text-sm text-muted">
          Hace UNA llamada de IA sin herramientas ni efectos: el primer agente explica qué haría con{' '}
          {s.borrador.prueba_items ?? 1} elemento(s) de ejemplo. Consumo estimado ≈{' '}
          {(d?.estimado_prueba_tokens ?? 0).toLocaleString('es-MX')} tokens de tu plan.
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmaPrueba}
            onChange={(e) => setConfirmaPrueba(e.target.checked)}
          />
          Confirmo el consumo estimado
        </label>
        <Button
          className="mt-2"
          disabled={!listo || !confirmaPrueba || ocupado || !s.ia.disponible}
          onClick={() =>
            void correr(async () => {
              const r = await api<{ respuesta: string; tokens: number; sesion: SesionCons }>(
                `/constructor/sesiones/${s.id}/prueba`,
                { method: 'POST', body: { confirmar: true } },
              );
              setPrueba({ texto: r.respuesta, tokens: r.tokens });
              onSesion(r.sesion);
              setConfirmaPrueba(false);
            })
          }
        >
          Ejecutar prueba
        </Button>
        {!s.ia.disponible && (
          <p className="mt-1 text-xs text-muted">IA no disponible: {s.ia.motivo}</p>
        )}
        {prueba && (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-ice p-3 text-sm" role="status">
            {prueba.texto}
            <span className="block text-xs text-muted">
              Consumo real ≈ {prueba.tokens.toLocaleString('es-MX')} tokens.
            </span>
          </p>
        )}
      </Card>
      <details className="rounded-xl border border-line bg-white p-4">
        <summary className="cursor-pointer font-semibold text-deep">
          Edición avanzada del borrador (JSON)
        </summary>
        <textarea
          aria-label="Borrador en JSON"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={12}
          className="mt-3 w-full rounded-lg border border-line px-3 py-2 font-mono text-xs"
        />
        {errJson && (
          <p role="alert" className="text-sm text-bad">
            {errJson}
          </p>
        )}
        <p className="text-xs text-muted">
          Cada campo se valida; los inválidos se rechazan y el resto se aplica.
        </p>
        <Button className="mt-2" onClick={aplicarJson}>
          Aplicar cambios
        </Button>
      </details>
      <Card>
        <h3 className="font-semibold text-deep">Fase 9: crear el piso</h3>
        <p className="text-sm text-muted">
          Nada se crea hasta que apruebes. Después editas prompts, Biblioteca y apariencias en las
          pantallas de siempre.
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={aprobado}
            onChange={(e) => setAprobado(e.target.checked)}
          />
          Apruebo este borrador
        </label>
        {relaja && (
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-deep">
            <input
              type="checkbox"
              checked={confirmaCandados}
              onChange={(e) => setConfirmaCandados(e.target.checked)}
            />
            Confirmo explícitamente relajar los topes de consumo (queda en el registro de cambios)
          </label>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error}
          </p>
        )}
        <Button
          variante="primario"
          className="mt-3"
          disabled={!listo || !aprobado || (relaja && !confirmaCandados) || ocupado}
          onClick={() =>
            void correr(async () => {
              const r = await api<{ office_id: string }>(`/constructor/sesiones/${s.id}/crear`, {
                method: 'POST',
                body: { aprobado: true, confirmar_relajar: confirmaCandados },
              });
              onCreado(r.office_id);
            })
          }
        >
          Crear el piso
        </Button>
      </Card>
    </div>
  );
}
