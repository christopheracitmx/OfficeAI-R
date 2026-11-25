import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Skeleton,
  cx,
  useToast,
} from '../components/ui';
import { api, useApi } from '../lib/api';
import type { CasoDoradoUi, CriterioUi } from '../lib/types';
import { inp } from './ConfListas';

export const CRITERIOS: Record<string, { etiqueta: string; conValor: boolean }> = {
  sin_precios: { etiqueta: 'Sin precios', conValor: false },
  sin_contacto_externo: { etiqueta: 'Sin contacto externo', conValor: false },
  contacto_con_fuente: { etiqueta: 'Contactos con fuente', conValor: false },
  paquete_coherente: { etiqueta: 'Paquete coherente', conValor: false },
  json_valido: { etiqueta: 'JSON válido', conValor: false },
  contiene: { etiqueta: 'Contiene', conValor: true },
  no_contiene: { etiqueta: 'No contiene', conValor: true },
  largo_max: { etiqueta: 'Largo máximo (caracteres)', conValor: true },
};
const nombreCriterio = (c: CriterioUi): string =>
  `${CRITERIOS[c.tipo]?.etiqueta ?? c.tipo}${c.valor ? `: ${c.valor}` : ''}`;

function Editor({ c, onListo }: { c: CasoDoradoUi; onListo: () => void }) {
  const toast = useToast();
  const [entrada, setEntrada] = useState(c.entrada);
  const [esperada, setEsperada] = useState(c.salida_esperada);
  const [criterios, setCriterios] = useState<CriterioUi[]>(c.criterios);
  const [tipo, setTipo] = useState('sin_precios');
  const [valor, setValor] = useState('');
  const guardar = async (extra: object = {}) => {
    try {
      await api(`/casos-dorados/${c.id}`, {
        method: 'PATCH',
        body: { entrada, salida_esperada: esperada, criterios, ...extra },
      });
      toast('Caso guardado');
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <label className="block text-muted">
        Expediente de ejemplo
        <textarea
          className={cx(inp, 'mt-1 w-full')}
          rows={6}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
        />
      </label>
      <label className="block text-muted">
        Salida esperada (referencia para ti)
        <textarea
          className={cx(inp, 'mt-1 w-full')}
          rows={2}
          value={esperada}
          onChange={(e) => setEsperada(e.target.value)}
        />
      </label>
      <div>
        <span className="text-muted">Criterios verificables por código</span>
        <ul className="mt-1 flex flex-wrap gap-2">
          {criterios.map((k, i) => (
            <li key={`${k.tipo}${k.valor ?? ''}${i}`} className="flex items-center gap-1">
              <Chip>{nombreCriterio(k)}</Chip>
              <button
                aria-label={`Quitar criterio ${nombreCriterio(k)}`}
                className="text-muted hover:text-bad"
                disabled={criterios.length <= 1}
                onClick={() => setCriterios(criterios.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            aria-label="Tipo de criterio"
            className={inp}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {Object.entries(CRITERIOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.etiqueta}
              </option>
            ))}
          </select>
          {CRITERIOS[tipo]?.conValor && (
            <input
              aria-label="Valor del criterio"
              className={inp}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Valor"
            />
          )}
          <Button
            disabled={Boolean(CRITERIOS[tipo]?.conValor) && !valor.trim()}
            onClick={() => {
              setCriterios([
                ...criterios,
                { tipo, ...(CRITERIOS[tipo]?.conValor ? { valor: valor.trim() } : {}) },
              ]);
              setValor('');
            }}
          >
            Agregar criterio
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variante="primario" onClick={() => void guardar()}>
          Guardar caso
        </Button>
        <Button onClick={() => void guardar({ activo: !c.activo })}>
          {c.activo ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
    </div>
  );
}

/** Lista editable de casos dorados (expedientes de ejemplo con criterios verificables). */
export function CasosLista() {
  const casos = useApi<CasoDoradoUi[]>('/casos-dorados');
  const [abierto, setAbierto] = useState<number | null>(null);
  if (casos.error) return <ErrorBanner mensaje={casos.error} onRetry={casos.reload} />;
  if (!casos.data) return <Skeleton className="h-32" />;
  if (casos.data.length === 0) return <EmptyState mensaje="No hay casos dorados." />;
  return (
    <div className="space-y-3">
      {casos.data.map((c) => (
        <Card key={c.id} className={cx(!c.activo && 'opacity-60')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">{c.nombre}</h3>
              <p className="text-sm text-muted">
                {c.agente} · {c.criterios.length} criterio(s){c.activo ? '' : ' · inactivo'}
              </p>
            </div>
            <Button
              variante="fantasma"
              aria-expanded={abierto === c.id}
              onClick={() => setAbierto(abierto === c.id ? null : c.id)}
            >
              {abierto === c.id ? 'Cerrar' : 'Ver / editar'}
            </Button>
          </div>
          {abierto === c.id && <Editor c={c} onListo={casos.reload} />}
        </Card>
      ))}
    </div>
  );
}
