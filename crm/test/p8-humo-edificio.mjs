// Prueba de humo REAL (WebGL) del edificio: fachada 3D, cambio de piso, creación de un piso por duplicado.
// Requiere el servidor de demostración (puerto 4099, BD temporal) tras `vite build`:
//   npx tsx test/p7-demo-servidor.ts <bd-temporal> --aprendizaje
// Uso: node test/p8-humo-edificio.mjs [url-base] [carpeta-capturas] [--channel=msedge|chrome]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const canal = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'msedge';
const base = args[0] ?? 'http://127.0.0.1:4099';
const dir = resolve(args[1] ?? 'capturas-p8');
mkdirSync(dir, { recursive: true });
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
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
const foto = (n) => page.screenshot({ path: join(dir, `${n}.png`) });

// 1) Pantalla Edificio (tarjetas)
await page.goto(`${base}/edificio`, { waitUntil: 'networkidle' });
ok(await page.getByRole('heading', { name: 'Edificio' }).isVisible(), 'pantalla Edificio visible');
ok(await page.getByText('Piso 1').first().isVisible(), 'tarjeta del piso 1 (prospección)');
await foto('01-edificio-tarjetas');

// 2) Crear un piso por duplicado desde la UI
await page.getByRole('button', { name: 'Duplicar' }).first().click();
const nombre = page.getByRole('dialog').getByRole('textbox').first();
await nombre.fill('Prospección Norte');
await page.getByRole('button', { name: 'Crear piso' }).click();
await page.getByText('Prospección Norte').first().waitFor({ timeout: 8000 });
ok(await page.getByText('Piso 2').first().isVisible(), 'el piso duplicado aparece como piso 2');
// y uno vacío
await page.getByRole('button', { name: 'Piso vacío' }).click();
await page.getByRole('dialog').getByRole('textbox').first().fill('Noticias del sector');
await page.getByRole('button', { name: 'Crear piso' }).click();
await page.getByText('Noticias del sector').first().waitFor({ timeout: 8000 });
await page.waitForTimeout(800);
await foto('02-edificio-3-pisos');
const api = async (p) => (await fetch(`${base}/api${p}`)).json();
const pisos = await api('/oficinas');
ok(pisos.length === 3, `hay 3 pisos (${pisos.map((o) => o.id).join(', ')})`);
const dup = await api('/oficinas/prospeccion-norte');
ok(
  dup.agentes === 12 && dup.plantilla_origen === 'duplicado:prospeccion',
  'el duplicado copió los 12 agentes',
);
const cop = await fetch(`${base}/api/prospectos`, {
  headers: { 'x-office-id': 'prospeccion-norte' },
});
ok((await cop.json()).length === 0, 'el piso duplicado no trae prospectos');

// 3) Vista 3D del edificio
await page.goto(`${base}/oficina?vista=edificio`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
const colores = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const o = document.createElement('canvas');
  o.width = 64;
  o.height = 40;
  const g = o.getContext('2d');
  g.drawImage(c, 0, 0, 64, 40);
  const d = g.getImageData(0, 0, 64, 40).data;
  const s = new Set();
  for (let i = 0; i < d.length; i += 4) s.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
  return s.size;
});
ok(
  (await page.locator('canvas').count()) === 1,
  'un solo canvas (solo la escena activa renderiza)',
);
ok(colores >= 12, `la fachada no está vacía (${colores} colores)`);
ok(
  await page.getByRole('list', { name: 'Pisos del edificio' }).isVisible(),
  'lista accesible de pisos',
);
await foto('03-edificio-3d');

// 4) Clic en un piso: la cámara entra y carga esa oficina
await page.getByRole('button', { name: /Piso 3 · Noticias del sector/ }).click();
await page.waitForURL((u) => !u.search.includes('vista=edificio'), { timeout: 10000 });
await page.waitForTimeout(3000);
ok(
  (await page.evaluate(() => localStorage.getItem('oficina.activa'))) === 'noticias-del-sector',
  'el piso activo global es el elegido',
);
ok(
  await page.getByRole('heading', { name: 'Ver oficina' }).isVisible(),
  'abre «Ver oficina» del piso',
);
const info = await page.evaluate(() => window.__oficina3d);
ok(
  info?.salas === 2 && info?.agentes === 0,
  `planta mínima generada (salas ${info?.salas}, agentes ${info?.agentes})`,
);
await foto('04-piso-vacio-3d');

// 5) Cambio de piso con PageDown y selector
await page.keyboard.press('PageDown');
await page.waitForTimeout(3500);
ok(
  (await page.evaluate(() => localStorage.getItem('oficina.activa'))) === 'prospeccion-norte',
  'PageDown baja al piso de abajo',
);
ok(
  (await page.evaluate(() => window.__oficina3d?.agentes)) === 12,
  'el piso duplicado trae sus 12 personajes',
);
await foto('05-piso-duplicado-3d');
await page.getByLabel('Piso del edificio').first().selectOption('prospeccion');
await page.waitForTimeout(3500);
ok(
  (await page.evaluate(() => window.__oficina3d?.agentes)) === 12,
  'la oficina de prospección sigue intacta',
);
ok(
  await page.getByRole('link', { name: 'Prospectos' }).isVisible(),
  'Prospectos visible solo en prospección',
);
await foto('06-prospeccion-3d');

// 6) Piso nuevo: Prospectos no aparece
await page.getByLabel('Piso del edificio').first().selectOption('noticias-del-sector');
await page.waitForTimeout(1500);
ok(
  (await page.getByRole('link', { name: 'Prospectos' }).count()) === 0,
  'Prospectos oculto en otros pisos',
);
await page.goto(`${base}/oficina?vista=edificio`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await foto('07-edificio-3d-activo-resaltado');

ok(
  errores.filter((e) => !/removeChild/.test(e)).length === 0,
  `sin errores de página: ${errores.join(' | ')}`,
);
await browser.close();
process.exit(fallas.length ? 1 : 0);
