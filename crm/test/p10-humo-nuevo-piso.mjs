// Prueba de humo REAL (WebGL) del Constructor «Nuevo piso»: conversación completa con el asistente SIMULADO
// hasta crear un piso, vista previa 3D, prueba controlada y verificación en el Edificio. Con capturas.
// Requiere `npm run build` y el servidor de demostración (puerto 4099, BD temporal, CLI simulado):
//   npx tsx test/p10-demo-servidor.ts <bd-temporal>
// Uso: node test/p10-humo-nuevo-piso.mjs [url-base] [carpeta-capturas] [--channel=msedge|chrome]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const canal = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'msedge';
const base = args[0] ?? 'http://127.0.0.1:4099';
const dir = resolve(args[1] ?? 'capturas-p10');
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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => {
  errores.push(e.message);
  console.info(
    'PAGEERROR en',
    page.url(),
    String(e.stack ?? '')
      .slice(0, 600)
      .replace(/\s+/g, ' '),
  );
});
const foto = (n) => page.screenshot({ path: join(dir, `${n}.png`), fullPage: true });
const apiGet = async (p, oficina = 'prospeccion') =>
  (await fetch(`${base}/api${p}`, { headers: { 'x-office-id': oficina } })).json();

const turno = async (texto, esperado) => {
  await page.getByLabel('Tu mensaje').fill(texto);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByText(esperado).first().waitFor({ timeout: 20000 });
};

// 1) Edificio -> Nuevo piso
await page.goto(`${base}/edificio`, { waitUntil: 'networkidle' });
await foto('01-edificio');
await page.getByRole('button', { name: 'Nuevo piso' }).click();
await page.getByRole('heading', { name: 'Nuevo piso' }).waitFor();
ok(page.url().includes('/edificio/nuevo'), 'el botón Nuevo piso abre el Constructor');
await page.getByText('Formulario guiado (sin IA)').waitFor();
ok(true, 'ofrece el modo formulario sin IA');
await page
  .getByText(/Plantilla:/)
  .first()
  .waitFor();
ok((await page.getByText(/Plantilla:/).count()) === 4, 'ofrece las 4 plantillas de la galería');
await foto('02-inicio-constructor');

// 2) Conversación con el asistente simulado (3 turnos)
await page.getByRole('button', { name: 'Empezar conversación' }).click();
await page.getByText('Hola, soy la Arquitecta').waitFor();
ok(await page.getByText(/UNA llamada de IA/).isVisible(), 'muestra el consumo estimado por turno');
await turno('#T1 Quiero clasificar las facturas del mes', '¿Qué datos recibe el piso');
await foto('03-turno-1');
await turno(
  '#T2 Entran PDFs de una carpeta y salen a una tabla',
  'Te propongo un equipo de cuatro',
);
await page.getByRole('button', { name: /3\. Agentes y flujo/ }).click();
ok(
  await page.evaluate(() =>
    [...document.querySelectorAll('input')].some((i) => i.value === 'Clasificadora'),
  ),
  'el equipo propuesto aparece en el formulario de la fase 3',
);
await foto('04-agentes');
await turno('#T3 Se ve bien', 'Listo: revisa la vista previa');

// 3) Fase 7: vista previa 3D
await page.getByRole('button', { name: /7\. Vista previa 3D/ }).click();
await page.locator('[data-testid=vista-previa]').waitFor({ timeout: 20000 });
await page.waitForTimeout(4000);
await foto('05-vista-previa-3d');
await page.locator('[data-testid=vista-previa]').screenshot({ path: join(dir, '06-3d-solo.png') });
ok(
  await page.getByText('Clasificadora').first().isVisible(),
  'la vista previa lista a los agentes con su rol',
);
ok(
  await page.getByText(/Requiere herramienta nueva/).isVisible(),
  'marca «requiere herramienta nueva» con su especificación',
);
ok(
  (await page.getByText('enviar_whatsapp').count()) > 0,
  'la integración fuera del catálogo queda registrada, no como herramienta',
);
const oficinasAntes = (await apiGet('/oficinas')).length;

// 4) Prueba controlada con estimado y confirmación
const boton = page.getByRole('button', { name: 'Ejecutar prueba' });
ok(await boton.isDisabled(), 'la prueba no se puede ejecutar sin confirmar el consumo');
await page.getByLabel('Confirmo el consumo estimado').check();
await boton.click();
await page.getByRole('status').getByText('Tomaría cada factura').waitFor({ timeout: 20000 });
ok(true, 'la prueba controlada devolvió su resultado (CLI simulado)');

// 5) Crear: solo con aprobación
const crear = page.getByRole('button', { name: 'Crear el piso', exact: true });
ok(await crear.isDisabled(), 'Crear está deshabilitado hasta aprobar el borrador');
ok((await apiGet('/oficinas')).length === oficinasAntes, 'todavía no se creó nada');
await page.getByLabel('Apruebo este borrador').check();
await foto('07-antes-de-crear');
await crear.click();
await page.waitForURL('**/oficina', { timeout: 20000 });
await page.waitForTimeout(500);
const oficinas = await apiGet('/oficinas');
const nuevo = oficinas.find((o) => o.nombre === 'Facturas del mes');
ok(!!nuevo, 'el piso nuevo existe en el edificio');
ok(oficinas.length === oficinasAntes + 1, 'se creó exactamente un piso');

// 6) El piso nuevo en la escena 3D
const def = await apiGet(`/oficinas/${nuevo.id}/definicion`);
const generos = def.agentes.map((a) => a.genero);
const f = generos.filter((g) => g === 'f').length;
ok(
  Math.abs(f - (generos.length - f)) <= 1,
  `paridad 50/50 en el equipo (${f} F / ${generos.length - f} M)`,
);
await page.waitForFunction(() => window.__oficina3d?.listo, null, { timeout: 25000 });
await page.waitForTimeout(3500);
await foto('08-piso-nuevo-oficina-3d');
const colecciones = await apiGet('/colecciones', nuevo.id);
ok(
  colecciones.some((c) => c.nombre === 'Facturas'),
  'la colección «Facturas» quedó creada en el piso nuevo',
);
await page.goto(`${base}/edificio`, { waitUntil: 'networkidle' });
ok(
  await page.getByText('Facturas del mes').first().isVisible(),
  'el Edificio muestra el piso nuevo',
);
await foto('09-edificio-con-piso-nuevo');
await page.goto(`${base}/oficina?vista=edificio`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await foto('10-edificio-3d');
await page.goto(`${base}/prompts`, { waitUntil: 'networkidle' });
await foto('11-prompts-del-piso-nuevo');

// Defecto PREVIO (P7+, también al salir de /oficina o /personalizar): el desmontaje del Canvas 3D lanza
// «removeChild» en React 19 + R3F; no bloquea la app. Se informa pero no se cuenta como falla de P10.
const conocidos = errores.filter((e) => e.includes('removeChild'));
const nuevos = errores.filter((e) => !e.includes('removeChild'));
console.info(`INFO errores conocidos de desmontaje 3D (previos a P10): ${conocidos.length}`);
ok(nuevos.length === 0, `sin errores de página nuevos (${nuevos.slice(0, 2).join(' | ')})`);
await browser.close();
if (fallas.length > 0) {
  console.info(`\n${fallas.length} FALLA(S)`);
  process.exit(1);
}
console.info('\nHUMO P10 OK');
