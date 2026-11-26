import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import { api } from '../lib/api';
import type { SesionCons } from '../lib/types-constructor';

/** Conversación con la Arquitecta: una llamada de IA por turno, con consumo estimado y pausa por reserva. */
export function NuevoPisoChat({
  s,
  onSesion,
}: {
  s: SesionCons;
  onSesion: (s: SesionCons) => void;
}) {
  const [texto, setTexto] = useState('');
  const [espera, setEspera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fin.current?.scrollIntoView?.({ block: 'end' });
  }, [s.mensajes.length]);

  const enviar = async () => {
    if (!texto.trim() || espera) return;
    setEspera(true);
    setError(null);
    try {
      onSesion(
        await api<SesionCons>(`/constructor/sesiones/${s.id}/turno`, {
          method: 'POST',
          body: { texto },
        }),
      );
      setTexto('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setEspera(false);
    }
  };

  const pausado = !s.ia.disponible;
  return (
    <Card>
      <h3 className="font-semibold text-deep">Conversación con la Arquitecta</h3>
      <p className="text-xs text-muted">
        Cada mensaje es UNA llamada de IA (Sonnet, esfuerzo bajo) y gasta aprox.{' '}
        {s.estimado_turno_tokens.toLocaleString('es-MX')} tokens de tu plan. Turnos usados:{' '}
        {s.turnos}.
      </p>
      {pausado && (
        <p role="status" className="mt-2 rounded-lg bg-brand-soft p-2 text-sm text-deep">
          Asistente en pausa: {s.ia.motivo} Puedes seguir con el formulario de la derecha, sin IA.
        </p>
      )}
      <div
        className="mt-3 h-72 space-y-2 overflow-y-auto rounded-lg border border-line bg-ice p-3"
        aria-live="polite"
      >
        {s.mensajes.map((m, i) => (
          <div
            key={`${i}-${m.de}`}
            className={
              m.de === 'dueno'
                ? 'ml-8 rounded-lg bg-brand-soft p-2 text-sm'
                : m.de === 'sistema'
                  ? 'rounded-lg border border-line bg-white p-2 text-xs text-muted'
                  : 'mr-8 rounded-lg bg-white p-2 text-sm shadow-sm'
            }
          >
            <b className="text-xs text-muted">
              {m.de === 'dueno' ? 'Tú' : m.de === 'asistente' ? 'Arquitecta' : 'Sistema'}
            </b>
            <p className="whitespace-pre-wrap">{m.texto}</p>
          </div>
        ))}
        {espera && <p className="text-sm text-muted">La Arquitecta está pensando…</p>}
        <div ref={fin} />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <textarea
          aria-label="Tu mensaje"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={2}
          disabled={pausado || espera}
          className="flex-1 rounded-lg border border-line px-3 py-2"
        />
        <Button type="submit" variante="primario" disabled={pausado || espera || !texto.trim()}>
          Enviar
        </Button>
      </form>
    </Card>
  );
}
