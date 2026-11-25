import type { Server } from 'node:http';
import type { Express } from 'express';
import type { Db } from './db';

/** Escucha solo en 127.0.0.1. Si el puerto está ocupado falla con un mensaje claro (no abre nada más). */
export function escuchar(app: Express, port: number): Promise<Server> {
  return new Promise((resolver, rechazar) => {
    const server = app.listen(port, '127.0.0.1', () => resolver(server));
    server.once('error', (e: NodeJS.ErrnoException) =>
      rechazar(
        e.code === 'EADDRINUSE'
          ? new Error(
              `Puerto ${port} ocupado: otro proceso lo usa. Ciérralo (o cambia CRM_PORT) y vuelve a abrir.`,
            )
          : e,
      ),
    );
  });
}

/** Cierre limpio: deja de aceptar conexiones, vuelca el WAL al archivo y cierra la base. */
export function cerrarLimpio(server: Server, db: Db): Promise<void> {
  return new Promise((resolver) => {
    server.close(() => {
      try {
        if (db.open) {
          db.pragma('wal_checkpoint(TRUNCATE)');
          db.close();
        }
      } finally {
        resolver();
      }
    });
    server.closeAllConnections();
  });
}
