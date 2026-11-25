import { useState } from 'react';
import { Button, Card, Skeleton, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { fechaCorta, type AgenteFila, type LeccionHistorial } from '../lib/types';
import { inp } from './ConfListas';

const MAX = 300;

export function Historial({ id, onRestaurar }: { id: number; onRestaurar: (v: number) => void }) {
  const h = useApi<LeccionHistorial[]>(`/lecciones/${id}/historial`);
  if (!h.data) return <Skeleton className="h-10" />;
  return (
    <ul className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
      {h.data.map((x) => (
        <li key={x.id} className="flex items-start justify-between gap-3">
          <span>
            <span className="text-muted">
              v{x.version} · {x.accion} · {fechaCorta(x.creado_en)}
            </span>
            <br />
            {x.texto}
          </span>
          <Button variante="fantasma" onClick={() => onRestaurar(x.version)}>
            Restaurar
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function Nueva({ agentes, onListo }: { agentes: AgenteFila[]; onListo: () => void }) {
  const toast = useToast();
  const [agente, setAgente] = useState('Redactor');
  const [tipo, setTipo] = useState<'acierto' | 'error'>('error');
  const [texto, setTexto] = useState('');
  const crear = async () => {
    try {
      await api('/lecciones', { method: 'POST', body: { agente, tipo, texto } });
      toast('Propuesta creada: revísala y apruébala');
      setTexto('');
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Escribir una lección</h2>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Agente"
          className={inp}
          value={agente}
          onChange={(e) => setAgente(e.target.value)}
        >
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.persona} ({a.id})
            </option>
          ))}
        </select>
        <select
          aria-label="Tipo"
          className={inp}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'acierto' | 'error')}
        >
          <option value="error">Error: evitar</option>
          <option value="acierto">Acierto: repetir</option>
        </select>
      </div>
      <textarea
        aria-label="Texto de la lección"
        rows={2}
        maxLength={MAX}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Una frase corta y concreta. Sin precios, sin contacto con prospectos y sin tocar los candados: el servidor la rechaza."
        className={cx(inp, 'w-full')}
      />
      <div className="flex items-center gap-3">
        <Button
          variante="primario"
          disabled={texto.trim().length < 10}
          onClick={() => void crear()}
        >
          Proponer lección
        </Button>
        <span className="text-sm text-muted">
          {texto.length}/{MAX}
        </span>
      </div>
    </Card>
  );
}
