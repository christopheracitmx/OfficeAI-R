import { CDMX_ZONAS, norm } from '../services/zona';

export interface FiltroZona {
  /** Estados a incluir (siempre dentro de la zona piloto). */
  estados: ('CDMX' | 'Estado de México')[];
  /** Municipios/alcaldías (nombres canónicos) o vacío = todo el estado. */
  municipios: string[];
}

/** Interpreta la zona de la corrida: «CDMX Norte», «Edomex - Naucalpan de Juárez», «Estado de México»... */
export function resolverZona(zona: string | undefined | null): FiltroZona {
  const z = (zona ?? '').trim();
  const t = norm(z);
  const cdmxZona = CDMX_ZONAS[z];
  if (cdmxZona) return { estados: ['CDMX'], municipios: cdmxZona };
  const hitAlcaldia = Object.values(CDMX_ZONAS)
    .flat()
    .find((a) => norm(a) === t);
  if (hitAlcaldia) return { estados: ['CDMX'], municipios: [hitAlcaldia] };
  const edo = /^edomex\s*-\s*(.+)$/i.exec(z);
  if (edo) return { estados: ['Estado de México'], municipios: [edo[1]!.trim()] };
  if (t === 'cdmx' || t.includes('ciudad de mexico')) return { estados: ['CDMX'], municipios: [] };
  if (t === 'edomex' || t.includes('estado de mexico'))
    return { estados: ['Estado de México'], municipios: [] };
  return { estados: ['CDMX', 'Estado de México'], municipios: [] };
}

/** Caja geográfica aproximada de la zona piloto (para Overpass); no reemplaza el filtro por dirección. */
export const BBOX_PILOTO = { sur: 18.35, oeste: -100.65, norte: 20.3, este: -98.5 } as const;
