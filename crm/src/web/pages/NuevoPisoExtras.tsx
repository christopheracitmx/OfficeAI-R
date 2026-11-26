import { useState } from 'react';
import { Button, Card } from '../components/ui';
import type { SesionCons } from '../lib/types-constructor';
import type { CandadoCat } from '../lib/types-datos';
import { Texto, type Guardar } from './NuevoPisoCampos';

export function Fase5({ s, guardar }: { s: SesionCons; guardar: Guardar }) {
  const kb = s.borrador.kb ?? [];
  const [titulo, setTitulo] = useState('');
  const [md, setMd] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Pega aquí lo que los agentes deben saber (guía de estilo, criterios, datos del negocio). Va
        a la Biblioteca del piso.
      </p>
      <ul className="text-sm">
        {kb.map((d) => (
          <li key={d.titulo}>
            📄 {d.titulo} ({d.contenido_md.length} caracteres)
          </li>
        ))}
      </ul>
      <Texto etiqueta="Título del documento" valor={titulo} onCambio={setTitulo} />
      <Texto etiqueta="Contenido (texto o Markdown)" valor={md} onCambio={setMd} largo />
      <div className="flex gap-2">
        <Button
          disabled={titulo.trim().length < 2 || !md.trim() || md.length > 4000}
          onClick={() => {
            void guardar({
              kb: [...kb, { tipo: 'otro', titulo: titulo.trim(), contenido_md: md.trim() }],
            });
            setTitulo('');
            setMd('');
          }}
        >
          Agregar a la Biblioteca
        </Button>
        <Button variante="primario" onClick={() => void guardar({}, 6)}>
          Continuar
        </Button>
      </div>
    </div>
  );
}

export function Fase6({
  s,
  candados,
  guardar,
}: {
  s: SesionCons;
  candados: CandadoCat[];
  guardar: Guardar;
}) {
  const [reglas, setReglas] = useState(() => (s.borrador.reglas ?? []).join('\n'));
  const [relajar, setRelajar] = useState(() =>
    (s.borrador.relajar_candados ?? []).includes('topes_consumo'),
  );
  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {candados.map((c) => (
          <li key={c.id}>
            🔒 <b>{c.titulo}</b>: {c.texto}{' '}
            {c.relajable ? '' : <span className="text-muted">(fijo)</span>}
          </li>
        ))}
      </ul>
      <Texto
        etiqueta="Reglas extra del piso (una por línea; se suman a los candados, nunca los sustituyen)"
        valor={reglas}
        onCambio={setReglas}
        largo
      />
      <Card className="text-sm">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={relajar}
            onChange={(e) => setRelajar(e.target.checked)}
          />
          <span>
            Relajar los topes de consumo (más agentes, elementos y pasos). Gasta más plan; al crear
            el piso te pediré confirmación explícita y quedará en el registro de cambios.
          </span>
        </label>
      </Card>
      <Button
        variante="primario"
        onClick={() =>
          void guardar(
            {
              reglas: reglas
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 10),
              relajar_candados: relajar ? ['topes_consumo'] : [],
            },
            7,
          )
        }
      >
        Guardar y ver la vista previa 3D
      </Button>
    </div>
  );
}
