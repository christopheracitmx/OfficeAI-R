import { TIPOS_CAMPO, type CampoDef, type TipoCampo } from '../../shared/colecciones';

export const inp = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2';
export type Guardar = (parche: Record<string, unknown>, fase?: number) => Promise<void>;

export function Texto({
  etiqueta,
  valor,
  onCambio,
  largo,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  largo?: boolean;
}) {
  return (
    <label className="block text-sm">
      {etiqueta}
      {largo ? (
        <textarea
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          rows={3}
          className={inp}
        />
      ) : (
        <input value={valor} onChange={(e) => onCambio(e.target.value)} className={inp} />
      )}
    </label>
  );
}

/** «folio:texto*, fecha:fecha» → campos (el asterisco marca obligatorio; el primero es la clave). */
export function parseCampos(t: string): CampoDef[] {
  return t
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [n = '', tp = 'texto'] = x.replace('*', '').split(':');
      const nombre = n
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^[0-9_]+/, '')
        .slice(0, 28);
      const tipo = (TIPOS_CAMPO as readonly string[]).includes(tp.trim())
        ? (tp.trim() as TipoCampo)
        : 'texto';
      return {
        nombre: nombre || 'campo',
        etiqueta: n.trim() || 'Campo',
        tipo,
        requerido: x.includes('*'),
        ...(tipo === 'enum' ? { opciones: ['si', 'no'] } : {}),
      };
    });
}
