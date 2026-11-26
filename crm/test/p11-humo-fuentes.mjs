// Prueba de humo de la UI de fuentes de descubrimiento (P11) con capturas. Requiere `npm run build` y el
// servidor de demostración (puerto 4099, BD temporal, red simulada):
//   npx tsx test/p11-demo-servidor.ts <bd-temporal>
// Uso: node test/p11-humo-fuentes.mjs [url-base] [carpeta-capturas] [--channel=msedge|chrome]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const canal = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'msedge';
const base = args[0] ?? 'http://127.0.0.1:4099';
const dir = resolve(args[1] ?? 'capturas-p11');
mkdirSync(dir, { recursive: true });
const require = createRequire(resolve('../tools/pw-shot/package.json'));
const { chromium } = require('playwright-core');

const fallas = [];
const ok = (cond, msg) => {
  console.info(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (!cond) fallas.push(msg);
};
const browser = await chromium.launch({ channel: canal, headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1400, height: 1000 } })
).newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
const foto = (n) => page.screenshot({ path: join(dir, `${n}.png`), fullPage: true });
const post = (p, b) =>
  fetch(`${base}/api${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'x-office-id': 'prospeccion' },
    body: JSON.stringify(b ?? {}),
  }).then((r) => r.json());

// 1) Configuración → Fuentes de descubrimiento
await page.goto(`${base}/configuracion`);
await page.getByRole('tab', { name: 'Fuentes de descubrimiento' }).click();
await page.getByText('DENUE (descarga masiva local)').waitFor();
ok(
  await page.getByText('Configurado ✓').isVisible(),
  'DENUE API muestra «token configurado» sin su valor',
);
ok(
  !(await page.content()).includes('token-de-demostracion'),
  'el valor del token no aparece en la página',
);
ok(
  await page.getByText('DENUE 2026/05 (muestra)').isVisible(),
  'muestra versión del dataset local',
);
ok(await page.getByText('37 / 2000').isVisible(), 'muestra cuota usada / tope');
ok(await page.getByText('Fuentes descartadas').isVisible(), 'lista las fuentes descartadas');
await foto('01-configuracion-fuentes');
// activar Overpass y probar conexión (red simulada)
await page.getByLabel('Activar OpenStreetMap (Overpass API)').click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Probar conexión' }).nth(3).click();
await page.getByText(/Overpass respondió/).waitFor({ timeout: 10000 });
ok(true, '«Probar conexión» de Overpass responde');
await page.getByRole('button', { name: 'Probar conexión' }).nth(0).click();
await page.getByText(/Dataset local DENUE 2026\/05/).waitFor({ timeout: 10000 });
await foto('02-probar-conexion');

// 2) Corrida: descubrimiento por código y panel de candidatos por fuente
await post('/corridas', { zona: 'CDMX', giro: 'Cualquiera', max_empresas: 2 });
await page.goto(`${base}/corrida`);
await page.getByText('Candidatos por fuente').waitFor({ timeout: 20000 });
ok(
  await page.getByText('DENUE (descarga masiva local)').first().isVisible(),
  'panel de Corrida lista la fuente DENUE',
);
await foto('03-corrida-panel-fuentes');

// 3) Directorio con columna y filtro de fuente
await page.goto(`${base}/directorio`);
await page.getByText('Logística Norte').waitFor({ timeout: 10000 });
ok(
  await page.getByRole('columnheader', { name: 'Fuente' }).isVisible(),
  'el Directorio tiene columna Fuente',
);
ok(
  await page.getByText('Fuente: INEGI').first().isVisible(),
  'muestra la atribución de INEGI por registro',
);
await foto('04-directorio-fuente');
await page.getByLabel('Fuente', { exact: true }).selectOption('denue_local');
await page.getByText('Clínica Santa Fe').waitFor();
await foto('05-directorio-filtrado');

ok(errores.length === 0, `sin errores de página (${errores.slice(0, 2).join(' | ')})`);
await browser.close();
console.info(fallas.length === 0 ? 'HUMO P11: TODO OK' : `HUMO P11: ${fallas.length} FALLA(S)`);
process.exit(fallas.length === 0 ? 0 : 1);
