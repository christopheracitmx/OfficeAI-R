import { useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorBanner, cx, useToast } from '../components/ui';
import { api, useApi } from '../lib/api';
import type { KbProducto } from '../lib/types';

const inp = 'w-full rounded-lg border border-line bg-white px-3 py-2';
const CAMPOS: { k: keyof KbProducto; etiqueta: string; largo?: boolean }[] = [
  { k: 'descripcion', etiqueta: 'Descripción', largo: true },
  { k: 'casos_uso', etiqueta: 'Casos de uso', largo: true },
  { k: 'giros_ideales', etiqueta: 'Giros ideales' },
  { k: 'argumentos_valor', etiqueta: 'Argumentos de valor', largo: true },
  { k: 'advertencias', etiqueta: 'Advertencias' },
];

type Edicion = Omit<KbProducto, 'id'> & { id: number | null };
const VACIO: Edicion = {
  id: null,
  marca: 'Lenovo',
  familia: '',
  descripcion: '',
  casos_uso: '',
  giros_ideales: '',
  argumentos_valor: '',
  advertencias: '',
  activo: 1,
};

interface ResultadoCsv {
  importados: number;
  errores: { fila: number; error: string }[];
}

function ImportarCsv({ onListo }: { onListo: () => void }) {
  const [csv, setCsv] = useState('');
  const [res, setRes] = useState<ResultadoCsv | null>(null);
  const toast = useToast();
  const leerArchivo = async (f: File | undefined) => {
    if (f) setCsv(await f.text());
  };
  const importar = async () => {
    try {
      const r = await api<ResultadoCsv>('/kb/productos/importar', {
        method: 'POST',
        body: { csv },
      });
      setRes(r);
      toast(`${r.importados} producto(s) importado(s)`);
      onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo importar', 'error');
    }
  };
  return (
    <Card className="mb-4">
      <h3 className="mb-1 font-semibold">Importar CSV de productos</h3>
      <p className="mb-2 text-sm text-muted">
        Columnas: marca, familia (o categoría), descripción, casos de uso, giros ideales, argumentos
        de valor, advertencias. Las filas con precios se rechazan.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Archivo CSV"
        onChange={(e) => void leerArchivo(e.target.files?.[0])}
        className="mb-2 block"
      />
      <textarea
        aria-label="Contenido CSV"
        placeholder="…o pega aquí el CSV"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        className={cx(inp, 'h-24 font-mono text-xs')}
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          variante="primario"
          disabled={csv.trim().length < 5}
          onClick={() => void importar()}
        >
          Importar
        </Button>
        {res && res.errores.length > 0 && (
          <span className="text-sm text-bad">
            {res.errores.map((e) => `fila ${e.fila}: ${e.error}`).join(' · ')}
          </span>
        )}
      </div>
    </Card>
  );
}

export function BibliotecaProductos() {
  const [q, setQ] = useState('');
  const lista = useApi<KbProducto[]>(`/kb/productos${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const [e, setE] = useState<Edicion | null>(null);
  const [csv, setCsv] = useState(false);
  const toast = useToast();

  const guardar = async () => {
    if (!e) return;
    const { id, activo, ...cuerpo } = e;
    void activo;
    try {
      if (id === null) await api('/kb/productos', { method: 'POST', body: cuerpo });
      else await api(`/kb/productos/${id}`, { method: 'PATCH', body: cuerpo });
      toast('Producto guardado');
      setE(null);
      lista.reload();
    } catch (x) {
      toast(x instanceof Error ? x.message : 'No se pudo guardar', 'error');
    }
  };
  const activar = async (p: KbProducto) => {
    try {
      await api(`/kb/productos/${p.id}`, { method: 'PATCH', body: { activo: p.activo !== 1 } });
      lista.reload();
    } catch (x) {
      toast(x instanceof Error ? x.message : 'Error', 'error');
    }
  };

  return (
    <>
      <div className="mb-3 flex gap-2">
        <input
          aria-label="Buscar productos"
          placeholder="Buscar marca, familia, caso de uso…"
          value={q}
          onChange={(x) => setQ(x.target.value)}
          className={cx(inp, 'max-w-sm')}
        />
        <Button variante="primario" onClick={() => setE({ ...VACIO })}>
          Nueva familia
        </Button>
        <Button onClick={() => setCsv(!csv)}>Importar CSV</Button>
      </div>
      {csv && <ImportarCsv onListo={lista.reload} />}
      {e && (
        <Card className="mb-4">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <input
              aria-label="Marca"
              placeholder="Marca (Lenovo, Aruba…)"
              value={e.marca}
              onChange={(x) => setE({ ...e, marca: x.target.value })}
              className={inp}
            />
            <input
              aria-label="Familia o categoría"
              placeholder="Familia o categoría"
              value={e.familia}
              onChange={(x) => setE({ ...e, familia: x.target.value })}
              className={inp}
            />
          </div>
          {CAMPOS.map((c) => (
            <label key={c.k} className="mb-2 block">
              <span className="text-sm text-muted">{c.etiqueta}</span>
              <textarea
                value={String(e[c.k as keyof Edicion] ?? '')}
                onChange={(x) => setE({ ...e, [c.k]: x.target.value })}
                className={cx(inp, c.largo ? 'h-16' : 'h-10')}
              />
            </label>
          ))}
          <p className="mb-2 text-xs text-muted">
            Sin precios y sin modelos que no estén en el catálogo oficial: propón familias y casos
            de uso.
          </p>
          <div className="flex gap-2">
            <Button
              variante="primario"
              disabled={!e.marca.trim() || !e.familia.trim()}
              onClick={() => void guardar()}
            >
              Guardar
            </Button>
            <Button onClick={() => setE(null)}>Cancelar</Button>
          </div>
        </Card>
      )}
      {lista.error && <ErrorBanner mensaje={lista.error} onRetry={lista.reload} />}
      {lista.data?.length === 0 && <EmptyState mensaje="Aún no hay productos." />}
      <div className="grid grid-cols-2 gap-3">
        {lista.data?.map((p) => (
          <Card key={p.id} className={p.activo ? '' : 'opacity-60'}>
            <div className="mb-1 flex items-center gap-2">
              <Chip>{p.marca}</Chip>
              <h3 className="font-semibold">{p.familia}</h3>
            </div>
            <p className="text-muted">{p.descripcion}</p>
            {p.casos_uso && <p className="mt-1 text-sm">Casos de uso: {p.casos_uso}</p>}
            {p.giros_ideales && <p className="text-sm">Giros: {p.giros_ideales}</p>}
            <div className="mt-2 flex gap-2">
              <Button onClick={() => setE({ ...p })}>Editar</Button>
              <Button variante="fantasma" onClick={() => void activar(p)}>
                {p.activo ? 'Archivar' : 'Reactivar'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
