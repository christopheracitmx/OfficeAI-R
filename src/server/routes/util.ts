import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import type { Db } from '../db';
import type { Runner } from '../runner/runner';
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
  runner?: Runner;
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

export const qstr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
