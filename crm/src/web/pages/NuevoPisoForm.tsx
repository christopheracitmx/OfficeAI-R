import { useState } from 'react';
import { Button, Card } from '../components/ui';
import type { SesionCons } from '../lib/types-constructor';
import type { CandadoCat, HerramientaCat } from '../lib/types-datos';
import { Fase3, Fase4 } from './NuevoPisoAgentes';
import { parseCampos, Texto, type Guardar } from './NuevoPisoCampos';
import { Fase5, Fase6 } from './NuevoPisoExtras';

function Fase12({ s, f, guardar }: { s: SesionCons; f: 1 | 2; guardar: Guardar }) {
  const b = s.borrador;
  const [v, setV] = useState({
    nombre: b.nombre ?? '',
    descripcion: b.descripcion ?? '',
    objetivo: b.objetivo ?? '',
    entregable: b.entregable ?? '',
    entrada: b.entrada ?? '',
    salida: b.salida ?? '',
    almacenamiento: b.almacenamiento ?? '',
    coleccion: b.colecciones?.[0]?.nombre ?? '',
    campos: (b.colecciones?.[0]?.campos ?? [])
      .map((c) => `${c.nombre}:${c.tipo}${c.requerido ? '*' : ''}`)
      .join(', '),
  });
  const set = (k: keyof typeof v) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const ok1 =
    v.nombre.trim().length >= 2 && v.objetivo.trim().length >= 5 && v.entregable.trim().length >= 3;
  if (f === 1)
    return (
      <div className="space-y-3">
        <Texto etiqueta="Nombre del piso" valor={v.nombre} onCambio={set('nombre')} />
        <Texto
          etiqueta="Objetivo: ¿qué quieres lograr?"
          valor={v.objetivo}
          onCambio={set('objetivo')}
          largo
        />
        <Texto
          etiqueta="Entregable: ¿qué te debe entregar?"
          valor={v.entregable}
          onCambio={set('entregable')}
        />
        <Texto
          etiqueta="Descripción corta (opcional)"
          valor={v.descripcion}
          onCambio={set('descripcion')}
        />
        <Button
          variante="primario"
          disabled={!ok1}
          onClick={() =>
            void guardar(
              {
                nombre: v.nombre,
                objetivo: v.objetivo,
                entregable: v.entregable,
                descripcion: v.descripcion,
              },
              2,
            )
          }
        >
          Guardar y continuar
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      <Texto etiqueta="Datos de entrada (qué recibe)" valor={v.entrada} onCambio={set('entrada')} />
      <Texto etiqueta="Datos de salida (qué produce)" valor={v.salida} onCambio={set('salida')} />
      <Texto
        etiqueta="¿Dónde se guarda?"
        valor={v.almacenamiento}
        onCambio={set('almacenamiento')}
      />
      <Texto
        etiqueta="Colección de resultados (nombre, opcional)"
        valor={v.coleccion}
        onCambio={set('coleccion')}
      />
      <Texto
        etiqueta="Campos (nombre:tipo, * = obligatorio; el primero es la clave). Tipos: texto, numero, fecha, booleano, url"
        valor={v.campos}
        onCambio={set('campos')}
      />
      <Button
        variante="primario"
        onClick={() => {
          const campos = parseCampos(v.campos);
          const col =
            v.coleccion.trim().length >= 2 && campos.length > 0
              ? [{ nombre: v.coleccion.trim(), descripcion: '', campos, clave: campos[0]!.nombre }]
              : [];
          void guardar(
            {
              entrada: v.entrada,
              salida: v.salida,
              almacenamiento: v.almacenamiento,
              colecciones: col,
            },
            3,
          );
        }}
      >
        Guardar y continuar
      </Button>
    </div>
  );
}

export function NuevoPisoForm({
  s,
  cat,
  candados,
  guardar,
}: {
  s: SesionCons;
  cat: HerramientaCat[];
  candados: CandadoCat[];
  guardar: Guardar;
}) {
  return (
    <Card>
      <h3 className="mb-3 font-semibold text-deep">
        Fase {s.fase}: {s.fases[s.fase - 1]}
      </h3>
      {/* key = fase + cantidad de cambios: el formulario se reinicia cuando el asistente actualiza el borrador */}
      <div key={`${s.fase}-${s.turnos}-${JSON.stringify(s.borrador).length}`}>
        {s.fase === 1 && <Fase12 s={s} f={1} guardar={guardar} />}
        {s.fase === 2 && <Fase12 s={s} f={2} guardar={guardar} />}
        {s.fase === 3 && <Fase3 s={s} guardar={guardar} />}
        {s.fase === 4 && <Fase4 s={s} cat={cat} guardar={guardar} />}
        {s.fase === 5 && <Fase5 s={s} guardar={guardar} />}
        {s.fase === 6 && <Fase6 s={s} candados={candados} guardar={guardar} />}
      </div>
    </Card>
  );
}
