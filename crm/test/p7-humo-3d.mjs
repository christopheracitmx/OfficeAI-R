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
const contexto = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
let page = await contexto.newPage();
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
// P6.5: pestaña Aprendizaje del panel del agente (datos reales de la demo) y clic en la sala de aprendizaje
await page.getByRole('button', { name: 'Rodrigo', exact: true }).click();
await page.waitForTimeout(1200);
await page.getByRole('tab', { name: 'Aprendizaje' }).click();
await page.waitForTimeout(1200);
ok(
  await page.getByText('Lecciones activas (').isVisible(),
  'la pestaña Aprendizaje muestra las lecciones activas del agente',
);
ok(
  await page.getByRole('link', { name: 'Abrir la pantalla Aprendizaje' }).isVisible(),
  'la pestaña Aprendizaje enlaza a la pantalla Aprendizaje',
);
await page.screenshot({ path: salida.replace('.png', '-aprendizaje.png') });
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
// Los errores se evalúan ANTES de salir de /oficina: al desmontar el canvas drei lanza un removeChild
// conocido (también ocurre al navegar con la barra lateral; no es de la pantalla de aprendizaje).
ok(
  errores.length === 0,
  `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`,
);
// recarga: seleccionar un agente acerca la cámara; la sala se mide con la vista general
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__oficina3d?.listo === true, null, { timeout: 30000 });
await page.waitForTimeout(2500);
const posSala = await page.evaluate(() => window.__oficina3d.salaPantalla('aprendizaje'));
console.info(
  'sala en pantalla:',
  JSON.stringify(posSala),
  await page.evaluate(
    ([x, y]) => {
      const e = document.elementFromPoint(x, y);
      return e ? e.tagName + ' ' + (e.className || '') : 'nada';
    },
    [posSala.x, posSala.y],
  ),
);
await page.mouse.click(posSala.x, posSala.y);
await page.waitForTimeout(1500);
ok(
  page.url().endsWith('/aprendizaje'),
  `clic en la sala de aprendizaje abre «Aprendizaje» (${page.url()})`,
);
await browser.close();
console.info(`captura: ${salida}`);
process.exit(fallas.length ? 1 : 0);
