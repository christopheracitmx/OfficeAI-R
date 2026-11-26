import { useState } from 'react';
import { Button, Skeleton, cx } from '../components/ui';
import { api, ApiError, useApi } from '../lib/api';

interface Ficha {
  id: string;
  nombre: string;
  descripcion: string;
  agentes: number;
  colecciones: number;
  herramientas: string[];
}

interface Vista {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  id_propuesto?: string;
  resumen?: Record<string, string[] | string>;
  requiere_confirmar_candados?: boolean;
}

const ETQ: Record<string, string> = {
  agentes: 'Agentes',
  pasos: 'Pasos del flujo',
  herramientas: 'Herramientas',
  colecciones: 'Colecciones (solo esquema)',
  kb: 'Biblioteca',
  habilidades: 'Habilidades',
  prompts: 'Prompts',
  integraciones: 'Integraciones que requieren herramienta nueva',
  candados_relajados: 'Candados relajados',
};

/** Galería de plantillas base e importación de paquetes (con vista previa antes de crear). */
export function EdificioPaquetes({
  onCerrar,
  onHecho,
}: {
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const galeria = useApi<Ficha[]>('/galeria');
  const [tab, setTab] = useState<'galeria' | 'importar'>('galeria');
  const [nombre, setNombre] = useState('');
  const [paquete, setPaquete] = useState<unknown>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const crearDeGaleria = async (f: Ficha) => {
    setOcupado(true);
    setError(null);
    try {
      await api(`/galeria/${f.id}/crear`, {
        method: 'POST',
        body: nombre.trim() ? { nombre } : {},
      });
      onHecho(`Piso «${nombre.trim() || f.nombre}» creado desde la plantilla.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setOcupado(false);
    }
  };

  const leerArchivo = async (file: File | undefined) => {
    setVista(null);
    setError(null);
    setPaquete(null);
    if (!file) return;
    if (file.size > 1_500_000) return setError('El archivo es demasiado grande (máximo 1,5 MB).');
    try {
      const p: unknown = JSON.parse(await file.text());
      setPaquete(p);
      setVista(
        await api<Vista>('/paquetes/vista-previa', {
          method: 'POST',
          body: { paquete: p, ...(nombre.trim() ? { nombre } : {}) },
        }),
      );
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? 'El archivo no es JSON válido.'
          : e instanceof Error
            ? e.message
            : 'Error',
      );
    }
  };

  const importar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await api('/paquetes/importar', {
        method: 'POST',
        body: { paquete, ...(nombre.trim() ? { nombre } : {}), confirmar_relajar: confirmar },
      });
      onHecho('Piso importado.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo importar');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Galería e importación de pisos"
    >
      <div className="anim-pop max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-md">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Galería e importación</h2>
          <Button variante="fantasma" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
        <label className="mt-3 block text-sm">
          Nombre del piso nuevo (opcional)
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={60}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2"
          />
        </label>
        <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
          {(['galeria', 'importar'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx(
                '-mb-px border-b-2 px-4 py-2 font-medium',
                tab === t ? 'border-brand text-deep' : 'border-transparent text-muted',
              )}
            >
              {t === 'galeria' ? 'Plantillas base' : 'Importar paquete'}
            </button>
          ))}
        </div>
        {tab === 'galeria' && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {galeria.loading && <Skeleton className="h-24" />}
            {(galeria.data ?? []).map((f) => (
              <div key={f.id} className="rounded-lg border border-line p-3">
                <h3 className="font-semibold text-deep">{f.nombre}</h3>
                <p className="text-sm text-muted">{f.descripcion}</p>
                <p className="mt-1 text-xs text-muted">
                  {f.agentes} agente(s) · {f.colecciones} colección(es)
                </p>
                <Button className="mt-2" disabled={ocupado} onClick={() => void crearDeGaleria(f)}>
                  Crear piso con esta plantilla
                </Button>
              </div>
            ))}
          </div>
        )}
        {tab === 'importar' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">
              Elige un archivo de paquete (.json) exportado desde otro piso. Verás qué se creará
              antes de confirmar. El paquete nunca incluye datos operativos ni secretos.
            </p>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Archivo de paquete"
              onChange={(e) => void leerArchivo(e.target.files?.[0])}
            />
            {vista && (
              <div className="rounded-lg border border-line p-3 text-sm">
                {vista.errores.length > 0 && (
                  <ul role="alert" className="mb-2 list-disc pl-5 text-bad">
                    {vista.errores.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
                {vista.advertencias.length > 0 && (
                  <ul className="mb-2 list-disc pl-5 text-deep">
                    {vista.advertencias.map((x) => (
                      <li key={x}>⚠ {x}</li>
                    ))}
                  </ul>
                )}
                {vista.resumen && (
                  <dl className="grid grid-cols-2 gap-2">
                    {Object.entries(ETQ).map(([k, t]) => {
                      const v = vista.resumen?.[k];
                      return Array.isArray(v) && v.length > 0 ? (
                        <div key={k}>
                          <dt className="text-xs text-muted">{t}</dt>
                          <dd>{v.join(', ')}</dd>
                        </div>
                      ) : null;
                    })}
                  </dl>
                )}
                {vista.requiere_confirmar_candados && (
                  <label className="mt-3 flex items-center gap-2 font-medium text-deep">
                    <input
                      type="checkbox"
                      checked={confirmar}
                      onChange={(e) => setConfirmar(e.target.checked)}
                    />
                    Confirmo explícitamente que el piso relaje esos candados
                  </label>
                )}
                <Button
                  variante="primario"
                  className="mt-3"
                  disabled={
                    !vista.ok || ocupado || (vista.requiere_confirmar_candados && !confirmar)
                  }
                  onClick={() => void importar()}
                >
                  Crear el piso «{vista.resumen?.['nombre'] as string}»
                </Button>
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function EnlaceExportar({ id }: { id: string }) {
  return (
    <a
      href={`/api/oficinas/${id}/exportar`}
      download
      className="inline-flex items-center rounded-lg px-4 py-2 text-brand-strong hover:bg-brand-soft"
    >
      Exportar paquete
    </a>
  );
}
