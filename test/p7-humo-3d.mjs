// Prueba de humo del canvas 3D con captura REAL (WebGL) — fuera de vitest.
// Requiere: servidor levantado (p. ej. `npx tsx test/p7-demo-servidor.ts <bd-temporal>` tras `vite build`)
// y playwright-core aislado en ../tools/pw-shot con Edge o Chrome del sistema.
// Uso: node test/p7-humo-3d.mjs [url] [captura.png] [--channel=msedge|chrome]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const canal = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'msedge';
const url = args[0] ?? 'http://127.0.0.1:4099/oficina';
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
// P7b: pantalla completa real (Fullscreen API): botón, atajo F, controles mínimos y salida
await page.getByRole('button', { name: 'Cerrar panel' }).click();
await page.getByRole('button', { name: 'Pantalla completa' }).click();
await page.waitForTimeout(1200);
ok(
  await page.evaluate(() => document.fullscreenElement !== null),
  'el botón expande a pantalla completa',
);
const tam = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return { w: c.clientWidth, h: c.clientHeight, iw: innerWidth, ih: innerHeight };
});
ok(
  tam.h >= tam.ih - 40 && tam.w > tam.iw * 0.9,
  `el canvas ocupa la pantalla (${tam.w}x${tam.h} de ${tam.iw}x${tam.ih})`,
);
ok(
  await page.getByRole('button', { name: 'Girar vista a la derecha' }).last().isVisible(),
  'controles mínimos visibles (girar)',
);
ok(
  await page.getByLabel('Calidad gráfica en pantalla completa').isVisible(),
  'selector de calidad visible',
);
await page.screenshot({ path: salida.replace('.png', '-fs.png') });
await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
await page.waitForTimeout(800);
ok(await page.evaluate(() => document.fullscreenElement === null), 'salir vuelve al modo normal');
await page.keyboard.press('f');
await page.waitForTimeout(800);
ok(
  await page.evaluate(() => document.fullscreenElement !== null),
  'el atajo F entra a pantalla completa',
);
await page.keyboard.press('f');
await page.waitForTimeout(800);
ok(
  await page.evaluate(() => document.fullscreenElement === null),
  'el atajo F sale de pantalla completa',
);
await page.screenshot({ path: salida });
ok(
  errores.length === 0,
  `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`,
);
await browser.close();
console.info(`captura: ${salida}`);
process.exit(fallas.length ? 1 : 0);
