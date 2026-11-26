// Importa un dataset local de descubrimiento (DENUE o Overture) a la base del CRM.
// Uso:  npm run datasets:importar -- denue <archivo.csv> [<otro.csv> ...] --version "DENUE 2026/05" [--fecha 2026-05-29] [--estrato-min 2] [--agregar]
//       npm run datasets:importar -- overture <extracto.geojsonl> --version 2026-11-18.0 [--confianza-min 0.5] [--agregar]
// Es la «actualización manual»: sin --agregar reemplaza lo anterior de esa fuente. Los archivos NUNCA se ejecutan, solo se leen.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/server/db';
import { importarDenue } from '../src/server/fuentes/import-denue';
import { importarOverture } from '../src/server/fuentes/import-overture';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(RAIZ, '.env'))) process.loadEnvFile(resolve(RAIZ, '.env'));

const args = process.argv.slice(2);
const fuente = args.shift();
const opciones = new Map<string, string>();
const archivos: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '--agregar') opciones.set('agregar', '1');
  else if (a.startsWith('--')) opciones.set(a.slice(2), args[++i] ?? '');
  else archivos.push(resolve(a));
}
const version = opciones.get('version');
if ((fuente !== 'denue' && fuente !== 'overture') || archivos.length === 0 || !version) {
  console.error(
    'Uso: npm run datasets:importar -- <denue|overture> <archivo...> --version "<versión>" [--fecha AAAA-MM-DD] [--estrato-min N] [--confianza-min 0.5] [--agregar]',
  );
  process.exit(2);
}
for (const a of archivos)
  if (!existsSync(a)) {
    console.error(`No existe el archivo: ${a}`);
    process.exit(2);
  }

const db = openDb(resolve(RAIZ, process.env['CRM_DB_PATH'] ?? 'data/crm.db'));
try {
  const comunes = {
    version,
    fecha_dataset: opciones.get('fecha'),
    reemplazar: !opciones.has('agregar'),
  };
  const r =
    fuente === 'denue'
      ? await importarDenue(db, archivos, {
          ...comunes,
          estrato_min: Number(opciones.get('estrato-min')) || undefined,
        })
      : await importarOverture(db, archivos[0]!, {
          ...comunes,
          confianza_min: opciones.has('confianza-min')
            ? Number(opciones.get('confianza-min'))
            : undefined,
        });
  console.info(`Importado (${fuente}): ${r.guardados} registros de ${r.leidos} leídos.`);
  console.info('Descartados:', JSON.stringify(r.descartados));
} finally {
  db.close();
}
