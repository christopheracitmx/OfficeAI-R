import { useState } from 'react';
import { Button, Card, ConfirmDialog, ErrorBanner, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { Ajustes, CandadoCat, HerramientaCat } from '../lib/types-datos';
import { OFICINA_PRINCIPAL } from '../lib/oficinaActiva';
import { useOficinaActual } from '../lib/useOficinas';
import { ConfArchivos } from './ConfArchivos';

/** «Herramientas del piso»: catálogo, herramientas permitidas, correo de avisos, archivos y candados. */
export function ConfHerramientas() {
  const { id, oficina } = useOficinaActual();
  const cat = useApi<{ herramientas: HerramientaCat[]; candados: CandadoCat[] }>(
    '/catalogo-herramientas',
  );
  const aj = useApi<Ajustes>(`/oficinas/${id}/ajustes`);
  const toast = useToast();
  const [relajar, setRelajar] = useState(false);
  if (id === OFICINA_PRINCIPAL)
    return (
      <Card>
        El piso de prospección conserva sus herramientas <code>crm_*</code> (no se editan aquí).
        Para usar colecciones, archivos o avisos por correo, crea otro piso desde el Edificio.
      </Card>
    );
  const permitidas = new Set(
    aj.data?.herramientas_configuradas ?? aj.data?.herramientas_efectivas ?? [],
  );
  const genericas = (cat.data?.herramientas ?? []).filter((h) => !h.solo_prospeccion && !h.nativa);
  const guardar = async (lista: string[]) => {
    try {
      await api(`/oficinas/${id}/ajustes`, { method: 'PUT', body: { herramientas: lista } });
      toast('Herramientas actualizadas');
      aj.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  const relajados = new Set(aj.data?.candados_relajados ?? []);
  return (
    <div className="space-y-4">
      <p className="text-muted">
        Piso: <b>{oficina?.nombre}</b>. Las herramientas se aplican en código: un agente solo puede
        usar las marcadas aquí, aunque su prompt o su flujo pidan otras.
      </p>
      {(cat.error || aj.error) && (
        <ErrorBanner mensaje={(cat.error ?? aj.error)!} onRetry={aj.reload} />
      )}
      <Card>
        <h3 className="font-semibold text-deep">Herramientas permitidas</h3>
        <ul className="mt-3 divide-y divide-line">
          {genericas.map((h) => (
            <li key={h.nombre} className="py-2">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={permitidas.has(h.nombre)}
                  onChange={(e) => {
                    const s = new Set(permitidas);
                    if (e.target.checked) s.add(h.nombre);
                    else s.delete(h.nombre);
                    void guardar([...s]);
                  }}
                />
                <span>
                  <b>{h.nombre}</b> <span className="text-xs text-muted">· {h.categoria}</span>
                  <span className="block text-sm text-muted">{h.descripcion}</span>
                  {h.riesgos.length > 0 && (
                    <span className="block text-xs font-medium text-deep">
                      Riesgo: {h.riesgos.join('; ')}
                    </span>
                  )}
                  {h.requiere_config.length > 0 && (
                    <span className="block text-xs text-muted">
                      Requiere: {h.requiere_config.join('; ')}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-semibold text-deep">Correo de avisos</h3>
        <p className="mt-1 text-sm text-muted">
          Con el correo activo, <code>notificar_interno</code> además de la Actividad envía un
          correo <b>solo</b> a los destinatarios internos activos (pestaña «Correos de reportes»),
          con tope de 10 por hora.
        </p>
        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={aj.data?.correo_activo ?? false}
            onChange={(e) =>
              void api(`/oficinas/${id}/ajustes`, {
                method: 'PUT',
                body: { correo_activo: e.target.checked },
              })
                .then(() => {
                  toast(e.target.checked ? 'Correo activado' : 'Correo desactivado');
                  aj.reload();
                })
                .catch((er: unknown) => toast(er instanceof Error ? er.message : 'Error', 'error'))
            }
          />
          Enviar avisos por correo desde este piso
        </label>
      </Card>
      <ConfArchivos oficina={id} onCambio={aj.reload} />
      <Card>
        <h3 className="font-semibold text-deep">Candados</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {(cat.data?.candados ?? []).map((c) => (
            <li key={c.id}>
              🔒 <b>{c.titulo}</b>: {c.texto}{' '}
              {c.relajable ? (
                relajados.has(c.id) ? (
                  <span className="font-medium text-deep">(RELAJADO)</span>
                ) : null
              ) : (
                <span className="text-muted">(fijo, no se puede relajar)</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          {relajados.has('topes_consumo') ? (
            <Button
              onClick={() =>
                void api(`/oficinas/${id}/candados`, { method: 'PUT', body: { relajados: [] } })
                  .then(() => aj.reload())
                  .catch((er: unknown) =>
                    toast(er instanceof Error ? er.message : 'Error', 'error'),
                  )
              }
            >
              Volver a activar los topes de consumo
            </Button>
          ) : (
            <Button variante="peligro" onClick={() => setRelajar(true)}>
              Relajar topes de consumo…
            </Button>
          )}
        </div>
      </Card>
      {relajar && (
        <ConfirmDialog
          titulo="Relajar topes de consumo"
          mensaje="Los topes de elementos, turnos y pasos de este piso subirán. Gastará más plan de IA. La acción queda en el registro de cambios."
          confirmar="Sí, relajar"
          onCancel={() => setRelajar(false)}
          onConfirm={() => {
            setRelajar(false);
            void api(`/oficinas/${id}/candados`, {
              method: 'PUT',
              body: { relajados: ['topes_consumo'], confirmar: true },
            })
              .then(() => aj.reload())
              .catch((er: unknown) => toast(er instanceof Error ? er.message : 'Error', 'error'));
          }}
        />
      )}
    </div>
  );
}
