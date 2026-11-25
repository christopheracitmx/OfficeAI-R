// Google Places API (New): SOLO descubrimiento. Field mask mínimo; sin teléfono ni sitio web ni lat/lng.

export interface LugarEncontrado {
  place_id: string;
  nombre: string;
  direccion: string;
  tipos: string[];
}

export interface OpcionesPlaces {
  apiKey: string;
  /** Debe lanzar si la cuota se agotó (el servidor responde 429). */
  consumir: () => Promise<void>;
  fetchFn?: typeof fetch;
  endpoint?: string;
}

export const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.types';

interface RespuestaPlaces {
  places?: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    types?: string[];
  }[];
}

export async function placesSearch(
  consulta: string,
  max: number,
  o: OpcionesPlaces,
): Promise<LugarEncontrado[]> {
  if (!o.apiKey) throw new Error('Falta GOOGLE_PLACES_API_KEY en .env');
  const pageSize = Math.max(1, Math.min(max, 20));
  await o.consumir(); // tope duro ANTES de gastar la solicitud
  const f = o.fetchFn ?? fetch;
  const res = await f(o.endpoint ?? 'https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': o.apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: consulta, languageCode: 'es', regionCode: 'MX', pageSize }),
  });
  if (!res.ok)
    throw new Error(`Places respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as RespuestaPlaces;
  return (data.places ?? []).map((p) => ({
    place_id: p.id,
    nombre: p.displayName?.text ?? '(sin nombre)',
    direccion: p.formattedAddress ?? '',
    tipos: p.types ?? [],
  }));
}
