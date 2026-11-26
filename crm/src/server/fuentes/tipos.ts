import type { Db } from '../db';

/** Candidato normalizado: lo mismo sin importar de qué fuente venga. */
export interface Candidato {
  nombre: string;
  razon_social?: string | undefined;
  direccion: string;
  municipio?: string | undefined;
  codigo_postal?: string | undefined;
  estado_mx?: string | undefined;
  telefono?: string | undefined;
  correo?: string | undefined;
  sitio_web?: string | undefined;
  /** Giro de la taxonomía (derivado del SCIAN o de la categoría). */
  giro: string;
  scian?: string | undefined;
  /** Límite inferior del estrato de personal (p. ej. 11 para «11 a 30»). Ausente si la fuente no lo sabe. */
  tamano_est?: number | undefined;
  estrato?: number | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  fuente_id: string;
  /** Id del registro en la fuente (clave del dataset, id de nodo OSM...). */
  registro_id: string;
  fuente_url?: string | undefined;
  licencia: string;
  atribucion: string;
}

export interface BusquedaFuente {
  /** Zona de la corrida: «CDMX», «CDMX Norte», «Edomex - Naucalpan de Juárez», «Estado de México»... */
  zona: string;
  /** Giro de la taxonomía o «Cualquiera». */
  giro: string;
  /** Prefijos SCIAN explícitos (opcional; si no, se derivan del giro). */
  scian?: string[] | undefined;
  texto?: string | undefined;
  max: number;
  /** Personal mínimo estimado; las fuentes que lo saben ya lo filtran. */
  min_personal?: number | undefined;
  /** office_id de quien consulta (para no repetir registros ya traídos a ese piso). */
  office_id?: string | undefined;
}

export class FuenteQuotaError extends Error {
  constructor(
    public readonly fuente: string,
    public readonly usado: number,
    public readonly tope: number,
  ) {
    super(`quota_exceeded: ${fuente} ${usado}/${tope} este mes`);
  }
}

export interface CtxFuente {
  db: Db;
  env: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch | undefined;
  /** Cuenta ANTES de gastar la solicitud; lanza FuenteQuotaError si se alcanzó el tope duro. */
  consumir: (n?: number) => void;
  /** Pausa entre intentos/consultas (inyectable para pruebas). */
  esperar?: ((ms: number) => Promise<void>) | undefined;
}

export interface PruebaConexion {
  ok: boolean;
  detalle: string;
}

export interface FuenteAdapter {
  id: string;
  nombre: string;
  tipo: 'api' | 'dataset_local';
  requiere_token: boolean;
  /** Variable de crm/.env con el token (solo se informa si está o no, nunca su valor). */
  env_token?: string | undefined;
  /** Texto corto de límites/cuotas para la UI. */
  limites: string;
  /** Tope mensual propio por defecto (null = sin tope: dataset local). */
  tope_defecto: number | null;
  /** Método guardado en empresas.metodo_descubrimiento. */
  metodo: string;
  licencia: string;
  atribucion: string;
  info_url: string;
  buscar(q: BusquedaFuente, ctx: CtxFuente): Promise<Candidato[]>;
  /** Una consulta mínima para «probar conexión». */
  probar(ctx: CtxFuente): Promise<PruebaConexion>;
}

export interface FuenteDescartada {
  id: string;
  nombre: string;
  veredicto: 'NO INTEGRAR';
  motivo: string;
  info_url: string;
}
