import cors from 'cors';
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { agentRouter } from './routes/agent';
import { ownerRouter } from './routes/owner';
import { HttpError, type Deps } from './routes/util';
import type { ActividadEvento } from './services/events';

const MUTACIONES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Defensa contra uso accidental: las rutas del dueño exigen Origin de la UI al mutar. */
function exigirOrigenUi(uiOrigins: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!MUTACIONES.has(req.method)) return next();
    const origin = req.header('origin');
    if (!origin || !uiOrigins.includes(origin))
      return next(new HttpError(403, 'Origen no permitido para esta acción'));
    next();
  };
}

export function createApp(d: Deps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // Orden canónico: json → cors → helmet → morgan → rutas → notFound → errorHandler
  app.use(express.json({ limit: '256kb' }));
  app.use(cors({ origin: d.uiOrigins }));
  app.use(helmet({ contentSecurityPolicy: false }));
  if (d.env?.['NODE_ENV'] !== 'test') app.use(morgan('tiny'));

  app.get('/api/health', (_req, res) => void res.json({ ok: true }));

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    const onEvent = (e: ActividadEvento) => res.write(`event: actividad\ndata: ${JSON.stringify(e)}\n\n`);
    d.bus.on('actividad', onEvent);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      d.bus.off('actividad', onEvent);
    });
  });

  app.use('/api/agent', agentRouter(d));
  app.use('/api', exigirOrigenUi(d.uiOrigins), ownerRouter(d));

  const web = join(process.cwd(), 'dist', 'web');
  if (existsSync(web)) {
    app.use(express.static(web));
    app.get(/^\/(?!api).*/, (_req, res) => void res.sendFile(join(web, 'index.html')));
  }

  app.use((_req, res) => void res.status(404).json({ error: 'No encontrado' }));
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    console.error('[error]', err);
    res.status(500).json({ error: 'Error interno' });
  };
  app.use(onError);
  return app;
}
