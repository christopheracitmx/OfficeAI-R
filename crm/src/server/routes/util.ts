import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import type { Db } from '../db';
import type { RunnerEdificio } from '../runner/edificio';
import type { EventBus } from '../services/events';
import type { Mailer } from '../services/mailer';

export interface Deps {
  db: Db;
  bus: EventBus;
  mailer: Mailer;
  from: string;
  baseUrl: string;
  agentToken: string;
  uiOrigins: string[];
  /** Ejecuta una búsqueda (Places) o lectura web; se inyecta para poder simularla en tests. */
  env?: NodeJS.ProcessEnv;
  /** Orquestador de corridas. Sin runner (tests de API) las corridas solo se registran. */
  runner?: RunnerEdificio;
  /** Carpeta config/offices (por defecto, relativa al directorio de trabajo del CRM). */
  dirOficinas?: string;
  /** `real` solo lo fija el servidor del CRM; todo lo demás (demo, pruebas) se muestra como demo. */
  dbModo?: 'real' | 'demo';
  /** Raíz de la app (carpeta `crm`) y comprobador de Claude Code: solo los fija el servidor real. */
  raiz?: string;
  comprobarClaude?: () => Promise<string | null>;
  /** Fuentes de descubrimiento: red y esperas inyectables (pruebas) y carpeta de datasets locales. */
  fuentes?: {
    fetchFn?: typeof fetch;
    esperar?: (ms: number) => Promise<void>;
    dirDatasets?: string;
  };
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Envuelve handlers async para que los errores lleguen al errorHandler. */
export const ah =
  (fn: (req: Request, res: Response) => Promise<void> | void): RequestHandler =>
  (req, res, next: NextFunction) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, msg);
  }
  return r.data;
}

export function idParam(req: Request): number {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id inválido');
  return id;
}

/** Oficina activa de la petición: ?office_id= o encabezado x-office-id de la UI (por defecto la de prospección). */
export const oficinaDe = (req: Request): string =>
  qstr(req.query['office_id']) ?? (req.header('x-office-id') || 'prospeccion');

export const qstr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
