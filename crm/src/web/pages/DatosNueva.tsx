import { useRef, useState } from 'react';
import { ETQ_TIPO, TIPOS_CAMPO, type CampoDef, type TipoCampo } from '../../shared/colecciones';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import type { Coleccion } from '../lib/types-datos';

const campo = 'w-full rounded-lg border border-line bg-white px-3 py-2';

interface Fila {
  uid: number;
  etiqueta: string;
  tipo: TipoCampo;
  requerido: boolean;
  opciones: string;
}

const nombreDe = (etiqueta: string, usados: Set<string>): string => {
  const base =
    etiqueta
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9]+/, '')
      .slice(0, 26) || 'campo';
  let n = base;
  for (let i = 2; usados.has(n); i++) n = `${base}_${i}`;
  usados.add(n);
  return n;
};

/** Crear una colección: nombre, campos tipados y campo clave (deduplicación). */
export function DatosNueva({
  onCerrar,
  onCreada,
}: {
  onCerrar: () => void;
  onCreada: (c: Coleccion) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [filas, setFilas] = useState<Fila[]>([
    { uid: 0, etiqueta: 'Nombre', tipo: 'texto', requerido: true, opciones: '' },
  ]);
  const proximo = useRef(0);
  const [clave, setClave] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (i: number, p: Partial<Fila>) =>
    setFilas((fs) => fs.map((f, k) => (k === i ? { ...f, ...p } : f)));

  const enviar = async () => {
    setError(null);
    const usados = new Set<string>();
    const campos: CampoDef[] = filas.map((f) => ({
      nombre: nombreDe(f.etiqueta, usados),
      etiqueta: f.etiqueta.trim(),
      tipo: f.tipo,
      requerido: f.requerido,
      ...(f.tipo === 'enum'
        ? {
            opciones: f.opciones
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    }));
    setEnviando(true);
    try {
      const c = await api<Coleccion>('/colecciones', {
        method: 'POST',
        body: {
          nombre,
          descripcion,
          campos,
          clave: clave >= 0 && filas[clave]?.tipo !== 'booleano' ? campos[clave]!.nombre : null,
        },
      });
      onCreada(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nueva colección"
    >
      <div className="anim-pop max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold">Nueva colección</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            Nombre
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={campo}
              maxLength={60}
            />
          </label>
          <label className="text-sm">
            Descripción (opcional)
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className={campo}
              maxLength={300}
            />
          </label>
        </div>
        <h3 className="mt-5 text-sm font-semibold text-deep">Campos</h3>
        <ul className="mt-2 space-y-2">
          {filas.map((f, i) => (
            <li key={f.uid} className="grid grid-cols-[1fr_150px_90px_80px] items-end gap-2">
              <label className="text-xs">
                Etiqueta
                <input
                  value={f.etiqueta}
                  onChange={(e) => cambiar(i, { etiqueta: e.target.value })}
                  className={campo}
                  maxLength={60}
                />
              </label>
              <label className="text-xs">
                Tipo
                <select
                  value={f.tipo}
                  onChange={(e) => cambiar(i, { tipo: e.target.value as TipoCampo })}
                  className={campo}
                >
                  {TIPOS_CAMPO.map((t) => (
                    <option key={t} value={t}>
                      {ETQ_TIPO[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 pb-2 text-xs">
                <input
                  type="checkbox"
                  checked={f.requerido}
                  onChange={(e) => cambiar(i, { requerido: e.target.checked })}
                />
                Obligatorio
              </label>
              <Button
                variante="fantasma"
                disabled={filas.length === 1}
                onClick={() => {
                  setFilas((fs) => fs.filter((_, k) => k !== i));
                  setClave((c) => (c === i ? 0 : c > i ? c - 1 : c));
                }}
              >
                Quitar
              </Button>
              {f.tipo === 'enum' && (
                <label className="col-span-4 text-xs">
                  Opciones separadas por coma (mínimo 2)
                  <input
                    value={f.opciones}
                    onChange={(e) => cambiar(i, { opciones: e.target.value })}
                    className={campo}
                    placeholder="alta, media, baja"
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-4">
          <Button
            disabled={filas.length >= 30}
            onClick={() =>
              setFilas((fs) => [
                ...fs,
                {
                  uid: ++proximo.current,
                  etiqueta: '',
                  tipo: 'texto',
                  requerido: false,
                  opciones: '',
                },
              ])
            }
          >
            + Agregar campo
          </Button>
          <label className="flex items-center gap-2 text-sm">
            Campo clave (evita duplicados)
            <select
              value={clave}
              onChange={(e) => setClave(Number(e.target.value))}
              className="rounded-lg border border-line px-2 py-1"
            >
              <option value={-1}>Ninguno</option>
              {filas.map((f, i) =>
                f.tipo === 'booleano' ? null : (
                  <option key={i} value={i}>
                    {f.etiqueta || `Campo ${i + 1}`}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={enviando || nombre.trim().length < 2 || filas.some((f) => !f.etiqueta.trim())}
            onClick={() => void enviar()}
          >
            Crear colección
          </Button>
        </div>
      </div>
    </div>
  );
}
