import { useState } from 'react';
import { Button, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';

export function NoContactar() {
  const l =
    useApi<{ id: number; tipo: string; valor: string; motivo: string | null }[]>(
      '/config/no-contactar',
    );
  const toast = useToast();
  const [tipo, setTipo] = useState('dominio');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const run = (fn: () => Promise<unknown>, ok: string) =>
    fn()
      .then(() => {
        toast(ok);
        l.reload();
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Error', 'error'));
  return (
    <div className="space-y-4">
      <p className="text-muted">
        Dominios, correos, teléfonos o nombres que no deben volver a trabajarse. Los agentes los
        respetan antes de guardar una empresa.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {(l.data ?? []).length === 0 && (
          <li className="px-4 py-3 text-muted">La lista está vacía.</li>
        )}
        {(l.data ?? []).map((n) => (
          <li key={n.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-20 text-xs uppercase text-muted">{n.tipo}</span>
            <b className="flex-1">{n.valor}</b>
            <span className="text-muted">{n.motivo}</span>
            <Button
              variante="fantasma"
              onClick={() =>
                void run(() => api(`/config/no-contactar/${n.id}`, { method: 'DELETE' }), 'Quitado')
              }
            >
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api('/config/no-contactar', {
                method: 'POST',
                body: { tipo, valor, ...(motivo ? { motivo } : {}) },
              }).then(() => {
                setValor('');
                setMotivo('');
              }),
            'Agregado',
          );
        }}
      >
        <select
          aria-label="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={inp}
        >
          {['dominio', 'correo', 'telefono', 'nombre'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          aria-label="Valor"
          required
          placeholder="Valor"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={cx(inp, 'w-64')}
        />
        <input
          aria-label="Motivo"
          placeholder="Motivo (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className={cx(inp, 'w-64')}
        />
        <Button variante="primario" type="submit">
          Agregar
        </Button>
      </form>
    </div>
  );
}

export function Giros() {
  const l = useApi<{ id: number; nombre: string }[]>('/config/giros');
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {(l.data ?? []).map((g) => (
          <span key={g.id} className="rounded-full bg-brand-soft px-3 py-1 text-brand-strong">
            {g.nombre}
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api('/config/giros', { method: 'POST', body: { nombre } })
            .then(() => {
              toast('Giro agregado');
              setNombre('');
              l.reload();
            })
            .catch((x: unknown) => toast(x instanceof Error ? x.message : 'Error', 'error'));
        }}
      >
        <input
          aria-label="Nuevo giro"
          required
          placeholder="Nuevo giro"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={cx(inp, 'w-64')}
        />
        <Button variante="primario" type="submit">
          Agregar giro
        </Button>
      </form>
    </div>
  );
}

export const inp = 'rounded-lg border border-line bg-white px-3 py-2';
