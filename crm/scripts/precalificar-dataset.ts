// Recalcula el pre-score (por código, sin IA) de los datasets locales y muestra un resumen.
// Uso: npm run datasets:precalificar [-- denue_local|overture_local]
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/server/db';
import { precalificarDataset } from '../src/server/fuentes/precalificar';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(RAIZ, '.env'))) process.loadEnvFile(resolve(RAIZ, '.env'));
const db = openDb(resolve(RAIZ, process.env['CRM_DB_PATH'] ?? 'data/crm.db'));
try {
  const fuentes = process.argv[2] ? [process.argv[2]] : ['denue_local', 'overture_local'];
  for (const f of fuentes) {
    const r = precalificarDataset(db, f);
    console.info(
      `${f}: ${r.total} registros, ${r.descartados} descartados por código.`,
      r.por_nivel,
    );
  }
} finally {
  db.close();
}
