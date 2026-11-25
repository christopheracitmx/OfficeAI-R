/** Alternativa textual accesible: agentes, estado actual y últimas acciones (también para lectores de pantalla). */
import { useEffect, useState } from 'react';
import type { DefinicionOficina } from '../../shared/oficina3d/definicion';
import { ETIQUETA_ESTADO, estadoVisible } from '../../shared/oficina3d/eventos';
import { useTienda, type Tienda } from './tienda';

export function ListaAgentes({ d, t }: { d: DefinicionOficina; t: Tienda }) {
  const est = useTienda(t, (e) => e);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <section
        className="rounded-xl border border-line bg-white p-4 shadow-sm"
        aria-label="Agentes y estado"
      >
        <h2 className="mb-2 font-semibold">Agentes</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="py-1 font-medium">Agente</th>
              <th className="font-medium">Rol</th>
              <th className="font-medium">Área</th>
              <th className="font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.agentes.map((a) => {
              const r = est.registros[a.id];
              const e = estadoVisible(r, ahora, est.enPausa, !!est.caminatas[a.id]);
              return (
                <tr key={a.id}>
                  <td className="py-1.5">
                    <button
                      className="font-medium text-brand-strong hover:underline"
                      onClick={() => t.set({ seleccionado: a.id })}
                    >
                      {a.persona}
                    </button>
                  </td>
                  <td>{a.rol}</td>
                  <td>{a.area}</td>
                  <td>
                    {ETIQUETA_ESTADO[e]}
                    {e === 'trabajando' && r ? (
                      <span className="text-muted"> · {r.burbuja}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section
        className="rounded-xl border border-line bg-white p-4 shadow-sm"
        aria-live="polite"
        aria-label="Últimas acciones"
      >
        <h2 className="mb-2 font-semibold">Últimas acciones</h2>
        {est.feed.length === 0 ? (
          <p className="text-muted">
            Aún no hay acciones en esta sesión. Aparecerán aquí en cuanto los agentes trabajen.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {est.feed.map((f) => (
              <li key={f.id}>
                <b className="text-brand-strong">
                  {d.agentes.find((a) => a.id === f.agente)?.persona ?? f.agente}
                </b>{' '}
                · {f.burbuja}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
