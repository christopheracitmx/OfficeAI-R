import type { Campos, Entidad } from '../../shared/oficina3d/composicion';
import { Campo } from './controles';
import type { Personalizador } from './usarApariencias';

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Contexto de edición de una entidad: valores efectivos, plantilla y cómo editar un campo. */
export interface Ctx {
  p: Personalizador;
  entidad: Entidad;
  id: string;
  ef: Campos;
  base: Campos;
}

/** Campo con «editado», aleatorio y restablecer ya conectados. */
export function CampoEd({
  ctx,
  campo,
  etiqueta,
  aleatorio = true,
  ayuda,
  campos,
  children,
}: {
  ctx: Ctx;
  campo: string;
  etiqueta: string;
  aleatorio?: boolean;
  ayuda?: string;
  /** Campos que restablece/compara este control (por omisión, solo `campo`). */
  campos?: string[];
  children: React.ReactNode;
}) {
  const { p, entidad, id, ef, base } = ctx;
  const lista = campos ?? [campo];
  return (
    <Campo
      etiqueta={etiqueta}
      cambiado={lista.some((c) => !igual(ef[c], base[c]))}
      onAleatorio={aleatorio ? () => p.aleatorioCampo(entidad, id, campo, ef) : undefined}
      onRestablecer={() =>
        p.editar(entidad, id, Object.fromEntries(lista.map((c) => [c, base[c]])))
      }
      {...(ayuda ? { ayuda } : {})}
    >
      {children}
    </Campo>
  );
}
