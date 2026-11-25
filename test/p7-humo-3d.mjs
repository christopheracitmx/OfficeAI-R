// Prueba de humo del canvas 3D con captura REAL (WebGL) — fuera de vitest.
// Requiere: servidor levantado (p. ej. `npx tsx test/p7-demo-servidor.ts <bd-temporal>` tras `vite build`)
// y playwright-core aislado en ../tools/pw-shot con Edge o Chrome del sistema.
// Uso: node test/p7-humo-3d.mjs [url] [captura.png] [--channel=msedge|chrome]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const canal = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'msedge';
const url = args[0] ?? 'http://127.0.0.1:4010/oficina';
const salida = args[1] ?? 'humo-3d.png';
const require = createRequire(resolve('../tools/pw-shot/package.json'));
const { chromium } = require('playwright-core');

const fallas = [];
const ok = (cond, msg) => {
  console.info(`${cond ? 'OK  ' : 'FALLA'} ${msg}`);
  if (!cond) fallas.push(msg);
};

const browser = await chromium.launch({
  channel: canal,
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await (
  await browser.newContext({ viewport: { width: 1600, height: 1000 } })
).newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__oficina3d?.listo === true, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const o = window.__oficina3d;
  return { agentes: o.agentes, salas: o.salas, calidad: o.calidad, colores: o.muestra() };
});
console.info('diagnóstico:', JSON.stringify(info));
ok(info.agentes === 12, '12 agentes en la escena');
ok(info.salas >= 10, 'salas de la oficina construidas');
ok(info.colores >= 20, `el canvas no está vacío (${info.colores} colores muestreados)`);
ok((await page.locator('canvas').count()) === 1, 'hay un canvas WebGL');
await page.getByRole('button', { name: 'Camila', exact: true }).click();
await page.waitForTimeout(1500);
ok(
  await page.getByRole('heading', { name: 'Camila' }).isVisible(),
  'al seleccionar se abre el panel del agente',
);
ok(
  await page.getByRole('tab', { name: 'Aprendizaje' }).isVisible(),
  'pestañas del panel presentes',
);
await page.screenshot({ path: salida });
ok(
  errores.length === 0,
  `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`,
);
await browser.close();
console.info(`captura: ${salida}`);
process.exit(fallas.length ? 1 : 0);
