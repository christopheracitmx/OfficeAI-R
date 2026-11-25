import { useState, type ReactNode } from 'react';
import { Button, Card, Chip, CopyButton } from '../components/ui';
import { METODO_ETIQUETA, fechaCorta, type ProspectoDetalle } from '../lib/types';

export function Contactos({ d }: { d: ProspectoDetalle }) {
  if (d.contactos.length === 0)
    return <p className="text-warn">⚠ No hay contactos con fuente verificada todavía.</p>;
  return (
    <ul className="divide-y divide-line">
      {d.contactos.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2">
          <Chip>
            {c.tipo === 'telefono' ? 'Teléfono' : c.tipo === 'correo' ? 'Correo' : 'Persona'}
          </Chip>
          <span className="font-medium">{c.valor}</span>
          {c.nombre && (
            <span className="text-muted">
              {c.nombre}
              {c.puesto ? ` · ${c.puesto}` : ''}
            </span>
          )}
          <a
            href={c.fuente_url}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto text-xs text-brand-strong hover:underline"
            title={c.fuente_url}
          >
            fuente · {fechaCorta(c.fecha_fuente)}
          </a>
          <CopyButton texto={c.valor} />
        </li>
      ))}
    </ul>
  );
}

export function Canalizacion({
  d,
  onPatch,
}: {
  d: ProspectoDetalle;
  onPatch: (b: object, ok: string) => Promise<void>;
}) {
  const [canal, setCanal] = useState(d.canalizado_a ?? '');
  const [notas, setNotas] = useState(d.notas_dueno ?? '');
  return (
    <Seccion titulo="Canalización">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-muted">Canalizado a</span>
          <input
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            placeholder="Ej. Ana — oficina Querétaro"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-muted">Notas del dueño</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas internas"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={() =>
            void onPatch({ canalizado_a: canal || null, notas_dueno: notas || null }, 'Guardado')
          }
        >
          Guardar
        </Button>
        <Button
          variante="primario"
          disabled={!canal.trim()}
          onClick={() =>
            void onPatch(
              { canalizado_a: canal.trim(), notas_dueno: notas || null, estado: 'Canalizado' },
              'Marcado como canalizado',
            )
          }
        >
          Marcar como canalizado
        </Button>
      </div>
    </Seccion>
  );
}

export const Seccion = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <Card>
    <h2 className="mb-3 font-semibold">{titulo}</h2>
    {children}
  </Card>
);

export function Paquetes({ d }: { d: ProspectoDetalle }) {
  return (
    <>
      {d.paquetes.length > 0 && (
        <Seccion titulo="Paquetes sugeridos">
          <div className="grid grid-cols-3 gap-3">
            {d.paquetes.map((p) => (
              <div key={p.nombre} className="rounded-lg border border-line p-4">
                <h3 className="font-semibold text-brand-strong">{p.nombre}</h3>
                <div className="my-2 flex flex-wrap gap-1">
                  {(JSON.parse(p.componentes) as string[]).map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
                <p className="text-muted">{p.argumento}</p>
                {p.dirigido_a && (
                  <p className="mt-2 text-xs text-muted">Dirigido a: {p.dirigido_a}</p>
                )}
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </>
  );
}

export function Productos({ d }: { d: ProspectoDetalle }) {
  return (
    <>
      {d.productos.length > 0 && (
        <Seccion titulo="Productos propuestos">
          <ul className="divide-y divide-line">
            {d.productos.map((p, i) => (
              <li key={i} className="flex items-start gap-3 py-2">
                <Chip>{p.marca}</Chip>
                <span className="w-48 font-medium">{p.categoria}</span>
                <span className="flex-1 text-muted">{p.razon}</span>
                <span className="text-xs uppercase text-muted">{p.prioridad}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </>
  );
}

export function FichaNecesidades({ d }: { d: ProspectoDetalle }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Seccion titulo="Ficha de la empresa">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
            <dt className="text-muted">Tamaño</dt>
            <dd>{d.tamano ?? '—'}</dd>
            <dt className="text-muted">Sucursales</dt>
            <dd>{d.sucursales ?? '—'}</dd>
            <dt className="text-muted">Dirección</dt>
            <dd>{d.direccion ?? '—'}</dd>
            <dt className="text-muted">Descubierta</dt>
            <dd>
              {METODO_ETIQUETA[d.metodo_descubrimiento] ?? d.metodo_descubrimiento}
              {d.origen_url && (
                <>
                  {' '}
                  ·{' '}
                  <a
                    href={d.origen_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-strong hover:underline"
                  >
                    origen
                  </a>
                </>
              )}
            </dd>
            {d.origen_nota && (
              <>
                <dt className="text-muted">Nota</dt>
                <dd>{d.origen_nota}</dd>
              </>
            )}
          </dl>
          {d.resumen && <p className="mt-3 leading-relaxed">{d.resumen}</p>}
        </Seccion>
        <Seccion titulo="Necesidades detectadas">
          {d.necesidades.length === 0 ? (
            <p className="text-muted">Sin necesidades registradas.</p>
          ) : (
            <ul className="space-y-2">
              {d.necesidades.map((n, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Chip tono={n.tipo}>{n.tipo === 'evidencia' ? 'Evidencia' : 'Inferencia'}</Chip>
                  <span>{n.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </>
  );
}
