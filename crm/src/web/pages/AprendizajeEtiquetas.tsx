import { useState } from 'react';
import { Button, Card, Chip, Skeleton, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import { inp } from './ConfListas';

/** Etiquetas predefinidas del 👍/👎 en el detalle del prospecto (editables). */
export function AprendizajeEtiquetas() {
  const et = useApi<string[]>('/feedback-etiquetas');
  const toast = useToast();
  const [nueva, setNueva] = useState('');
  if (!et.data) return <Skeleton className="h-24" />;
  const guardar = async (lista: string[]) => {
    try {
      await api('/feedback-etiquetas', { method: 'PUT', body: { etiquetas: lista } });
      toast('Etiquetas guardadas');
      et.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };
  return (
    <Card className="max-w-2xl space-y-3">
      <h2 className="font-semibold">Etiquetas de retroalimentación</h2>
      <p className="text-muted">
        Aparecen como opciones rápidas al dar 👍/👎 en un prospecto. Edítalas a tu medida.
      </p>
      <ul className="flex flex-wrap gap-2">
        {et.data.map((e) => (
          <li key={e} className="flex items-center gap-1">
            <Chip>{e}</Chip>
            <button
              aria-label={`Quitar ${e}`}
              className="text-muted hover:text-bad"
              onClick={() => void guardar(et.data!.filter((x) => x !== e))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (nueva.trim()) void guardar([...et.data!, nueva.trim()]).then(() => setNueva(''));
        }}
      >
        <input
          aria-label="Nueva etiqueta"
          className={cx(inp, 'w-64')}
          maxLength={80}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Nueva etiqueta"
        />
        <Button type="submit" disabled={!nueva.trim()}>
          Agregar
        </Button>
      </form>
    </Card>
  );
}
