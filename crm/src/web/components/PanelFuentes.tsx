import { useApi } from '../lib/api';

interface FilaFuente {
  fuente_id: string;
  nombre: string;
  encontrados: number;
  nuevos: number;
  fusionados: number;
  rechazados: number;
  estado: string;
  detalle: string | null;
}

const ESTADO: Record<string, string> = {
  ok: 'OK',
  sin_datos: 'Sin datos',
  quota_exceeded: 'Cuota agotada',
  error: 'Error',
  omitida: 'Omitida',
};

/** Candidatos por fuente de la corrida: qué aportó cada una (por código, sin IA). */
export function PanelFuentes({ corridaId }: { corridaId: number }) {
  const { data } = useApi<FilaFuente[]>(`/fuentes/corrida/${corridaId}`, { refreshMs: 5000 });
  if (!data || data.length === 0) return null;
  return (
    <section
      className="mt-4 rounded-lg border border-line bg-white p-4"
      aria-label="Candidatos por fuente"
    >
      <h3 className="mb-2 font-semibold">Candidatos por fuente</h3>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            {['Fuente', 'Estado', 'Encontrados', 'Nuevos', 'Fusionados', 'Rechazados'].map((h) => (
              <th key={h} className="py-1 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((f) => (
            <tr key={f.fuente_id} className="border-t border-line" title={f.detalle ?? ''}>
              <td className="py-1 pr-3">{f.nombre}</td>
              <td className="py-1 pr-3">{ESTADO[f.estado] ?? f.estado}</td>
              <td className="py-1 pr-3">{f.encontrados}</td>
              <td className="py-1 pr-3">{f.nuevos}</td>
              <td className="py-1 pr-3">{f.fusionados}</td>
              <td className="py-1 pr-3">{f.rechazados}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
