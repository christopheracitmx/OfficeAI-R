import { useState } from 'react';
import { PageHeader, cx } from '../components/ui';
import { useApi } from '../lib/api';
import type { ConteoLeccionesUi } from '../lib/types';
import { AprendizajeEtiquetas } from './AprendizajeEtiquetas';
import { AprendizajeLecciones } from './AprendizajeLecciones';
import { AprendizajeReflexion } from './AprendizajeReflexion';
import { Desempeno } from './Desempeno';
import { Evaluaciones } from './Evaluaciones';

const TABS = [
  'Propuestas',
  'Lecciones activas',
  'Archivo',
  'Reflexión',
  'Desempeño',
  'Casos dorados',
  'Etiquetas',
] as const;

/** Aprendizaje: el dueño aprueba lo que los agentes pueden recordar. Ningún agente reescribe sus instrucciones solo. */
export function Aprendizaje() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const conteo = useApi<ConteoLeccionesUi>('/lecciones-conteo', { refreshMs: 20000 });
  const c = conteo.data;
  const badge = (t: (typeof TABS)[number]): string =>
    !c
      ? ''
      : t === 'Propuestas' && c.propuestas > 0
        ? ` (${c.propuestas})`
        : t === 'Lecciones activas'
          ? ` (${c.aprobadas})`
          : '';
  return (
    <>
      <PageHeader
        titulo="Aprendizaje"
        subtitulo="Propuestas, lecciones activas por agente, reflexión a petición, desempeño y casos de prueba. Solo lo que apruebas llega a los prompts."
      />
      <div role="tablist" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2 font-medium transition-colors',
              tab === t
                ? 'border-brand text-deep'
                : 'border-transparent text-muted hover:text-deep',
            )}
          >
            {t}
            {badge(t)}
          </button>
        ))}
      </div>
      {tab === 'Propuestas' && (
        <AprendizajeLecciones key="p" vista="propuestas" onCambio={conteo.reload} />
      )}
      {tab === 'Lecciones activas' && (
        <AprendizajeLecciones key="a" vista="aprobadas" onCambio={conteo.reload} />
      )}
      {tab === 'Archivo' && (
        <AprendizajeLecciones key="x" vista="archivadas" onCambio={conteo.reload} />
      )}
      {tab === 'Reflexión' && <AprendizajeReflexion onCambio={conteo.reload} />}
      {tab === 'Desempeño' && <Desempeno />}
      {tab === 'Casos dorados' && <Evaluaciones />}
      {tab === 'Etiquetas' && <AprendizajeEtiquetas />}
    </>
  );
}
