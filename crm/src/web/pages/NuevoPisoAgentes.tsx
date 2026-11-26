import { useState } from 'react';
import type { AgenteBorrador } from '../../shared/constructor';
import { Button } from '../components/ui';
import type { SesionCons } from '../lib/types-constructor';
import type { HerramientaCat } from '../lib/types-datos';
import { inp, Texto, type Guardar } from './NuevoPisoCampos';

const AGENTE_NUEVO = (): AgenteBorrador => ({
  rol: '',
  area: 'Trabajo',
  tarea: '',
  es_qa: false,
  herramientas: [],
  web: false,
});

export function Fase3({ s, guardar }: { s: SesionCons; guardar: Guardar }) {
  const [ag, setAg] = useState<(AgenteBorrador & { uid: number })[]>(() =>
    (s.borrador.agentes?.length ? s.borrador.agentes : [AGENTE_NUEVO()]).map((a, i) => ({
      ...a,
      uid: i,
    })),
  );
  const [dev, setDev] = useState(s.borrador.devoluciones_max ?? 1);
  const [items, setItems] = useState(s.borrador.items_max ?? 5);
  const cambiar = (i: number, p: Partial<AgenteBorrador>) =>
    setAg((a) => a.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const valido =
    ag.every((a) => a.rol.trim().length >= 2 && a.tarea.trim().length >= 3) &&
    ag.some((a) => !a.es_qa);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Define a los agentes. Sin género elegido, el equipo se reparte 50/50 automáticamente.
      </p>
      {ag.map((a, i) => (
        <div
          key={a.uid}
          className="grid grid-cols-[1fr_1fr_90px] gap-2 rounded-lg border border-line p-3"
        >
          <Texto etiqueta="Rol" valor={a.rol} onCambio={(v) => cambiar(i, { rol: v })} />
          <Texto etiqueta="Área (sala)" valor={a.area} onCambio={(v) => cambiar(i, { area: v })} />
          <label className="text-sm">
            Género
            <select
              value={a.genero ?? ''}
              onChange={(e) =>
                cambiar(i, { genero: (e.target.value || undefined) as 'f' | 'm' | undefined })
              }
              className={inp}
            >
              <option value="">Auto</option>
              <option value="f">F</option>
              <option value="m">M</option>
            </select>
          </label>
          <div className="col-span-3">
            <Texto etiqueta="Tarea" valor={a.tarea} onCambio={(v) => cambiar(i, { tarea: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={a.es_qa}
              onChange={(e) => cambiar(i, { es_qa: e.target.checked })}
            />
            Es QA (revisa y puede devolver)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={a.web}
              onChange={(e) => cambiar(i, { web: e.target.checked })}
            />
            Busca en la web
          </label>
          <Button
            variante="fantasma"
            disabled={ag.length === 1}
            onClick={() => setAg((x) => x.filter((_, k) => k !== i))}
          >
            Quitar
          </Button>
        </div>
      ))}
      <Button
        disabled={ag.length >= 20}
        onClick={() => setAg((x) => [...x, { ...AGENTE_NUEVO(), uid: Date.now() }])}
      >
        + Agregar agente
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Rondas de devolución del QA (0-3)
          <input
            type="number"
            min={0}
            max={3}
            value={dev}
            onChange={(e) => setDev(Number.parseInt(e.target.value, 10) || 0)}
            className={inp}
          />
        </label>
        <label className="text-sm">
          Elementos máximos por corrida
          <input
            type="number"
            min={1}
            max={100}
            value={items}
            onChange={(e) => setItems(Number.parseInt(e.target.value, 10) || 1)}
            className={inp}
          />
        </label>
      </div>
      <Button
        variante="primario"
        disabled={!valido}
        onClick={() =>
          void guardar(
            {
              agentes: ag.map((a) => ({
                rol: a.rol.trim(),
                persona: a.persona,
                genero: a.genero,
                area: a.area,
                tarea: a.tarea.trim(),
                es_qa: a.es_qa,
                herramientas: a.herramientas,
                web: a.web,
              })),
              devoluciones_max: dev,
              items_max: items,
            },
            4,
          )
        }
      >
        Guardar y continuar
      </Button>
    </div>
  );
}

export function Fase4({
  s,
  cat,
  guardar,
}: {
  s: SesionCons;
  cat: HerramientaCat[];
  guardar: Guardar;
}) {
  const [sel, setSel] = useState(() => new Set(s.borrador.herramientas ?? []));
  const [integ, setInteg] = useState(() =>
    (s.borrador.integraciones ?? []).map((i) => i.nombre).join(', '),
  );
  const genericas = cat.filter((h) => !h.solo_prospeccion && !h.nativa);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Solo herramientas del catálogo. Lo que no esté aquí queda como «requiere herramienta nueva».
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {genericas.map((h) => (
          <li key={h.nombre} className="px-3 py-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={sel.has(h.nombre)}
                onChange={(e) =>
                  setSel((a) => {
                    const n = new Set(a);
                    if (e.target.checked) n.add(h.nombre);
                    else n.delete(h.nombre);
                    return n;
                  })
                }
              />
              <span>
                <b>{h.nombre}</b> <span className="text-muted">{h.descripcion}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Texto
        etiqueta="Integraciones que NO están en el catálogo (separadas por coma, opcional)"
        valor={integ}
        onCambio={setInteg}
      />
      <Button
        variante="primario"
        onClick={() =>
          void guardar(
            {
              herramientas: [...sel],
              integraciones: integ
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .map((nombre) => ({
                  nombre: nombre.slice(0, 60),
                  descripcion: `Integración «${nombre}» pedida por el dueño`,
                  entrada: '',
                  salida: '',
                })),
            },
            5,
          )
        }
      >
        Guardar y continuar
      </Button>
    </div>
  );
}
