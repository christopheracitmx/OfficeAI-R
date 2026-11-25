/** «Tu opinión»: 👍/👎 por etapa del prospecto, etiqueta, nota y «error de agente X». También muestra lo capturado solo (QA y resultados). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, cx, useToast } from './ui';
import { api, useApi } from '../lib/api';
import { ETAPAS_UI, fechaCorta, type AgenteFila, type FeedbackFila } from '../lib/types';

const inp = 'rounded-lg border border-line bg-white px-3 py-2';
type Voto = { etapa: string; valor: 1 | -1 };

function Formulario({
  prospectoId,
  voto,
  onListo,
  onCancelar,
}: {
  prospectoId: number;
  voto: Voto;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const toast = useToast();
  const etiquetas = useApi<string[]>('/feedback-etiquetas');
  const agentes = useApi<AgenteFila[]>('/agentes');
  const [etiqueta, setEtiqueta] = useState('');
  const [nota, setNota] = useState('');
  const [agente, setAgente] = useState('');
  const enviar = async () => {
    try {
      await api('/feedback', {
        method: 'POST',
        body: {
          prospecto_id: prospectoId,
          etapa: voto.etapa,
          valor: voto.valor,
          ...(etiqueta ? { etiqueta } : {}),
          ...(nota.trim() ? { nota: nota.trim() } : {}),
          ...(agente ? { agente } : {}),
        },
      });
      toast('Gracias: queda como retroalimentación para el aprendizaje');
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    }
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-ice p-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Etiqueta"
          className={inp}
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
        >
          <option value="">Sin etiqueta</option>
          {(etiquetas.data ?? []).map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <select
          aria-label="Error de agente"
          className={inp}
          value={agente}
          onChange={(e) => setAgente(e.target.value)}
        >
          <option value="">Agente de la etapa</option>
          {(agentes.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              Error de {a.persona} ({a.id})
            </option>
          ))}
        </select>
      </div>
      <textarea
        aria-label="Nota"
        rows={2}
        maxLength={500}
        className={cx(inp, 'w-full')}
        placeholder="Nota libre (opcional)"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button variante="primario" onClick={() => void enviar()}>
          Guardar {voto.valor > 0 ? '👍' : '👎'}
        </Button>
        <Button onClick={onCancelar}>Cancelar</Button>
        <Link to="/aprendizaje" className="ml-auto text-sm text-brand-strong hover:underline">
          Editar etiquetas
        </Link>
      </div>
    </div>
  );
}

export function FeedbackProspecto({ prospectoId }: { prospectoId: number }) {
  const fb = useApi<FeedbackFila[]>(`/feedback?prospecto_id=${prospectoId}&limit=50`);
  const [voto, setVoto] = useState<Voto | null>(null);
  const lista = fb.data ?? [];
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Tu opinión sobre el trabajo de los agentes</h2>
      <p className="mb-3 text-sm text-muted">
        Cada 👍/👎 alimenta el aprendizaje; nada cambia solo: tú apruebas las lecciones.
      </p>
      <ul className="grid grid-cols-4 gap-3">
        {ETAPAS_UI.map((e) => (
          <li key={e.id} className="rounded-lg border border-line p-3">
            <div className="font-medium">{e.etiqueta}</div>
            <div className="mb-2 text-xs text-muted">{e.agente}</div>
            <div className="flex gap-2">
              <Button
                aria-label={`Bien: ${e.etiqueta}`}
                aria-pressed={voto?.etapa === e.id && voto.valor > 0}
                onClick={() => setVoto({ etapa: e.id, valor: 1 })}
              >
                👍
              </Button>
              <Button
                aria-label={`Mal: ${e.etiqueta}`}
                aria-pressed={voto?.etapa === e.id && voto.valor < 0}
                onClick={() => setVoto({ etapa: e.id, valor: -1 })}
              >
                👎
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {voto && (
        <Formulario
          key={`${voto.etapa}${voto.valor}`}
          prospectoId={prospectoId}
          voto={voto}
          onCancelar={() => setVoto(null)}
          onListo={() => {
            setVoto(null);
            fb.reload();
          }}
        />
      )}
      {lista.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          {lista.map((f) => (
            <li key={f.id}>
              {f.valor > 0 ? '👍' : f.valor < 0 ? '👎' : '•'} {f.etapa}
              {f.agente ? ` · ${f.agente}` : ''}
              {f.etiqueta ? ` · ${f.etiqueta}` : ''}
              {f.nota ? <span className="text-muted"> · {f.nota}</span> : null}
              <span className="text-muted">
                {' '}
                ·{' '}
                {f.origen === 'manual'
                  ? 'tuyo'
                  : f.origen === 'qa'
                    ? 'QA (automático)'
                    : 'resultado (automático)'}{' '}
                · {fechaCorta(f.creado_en)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
