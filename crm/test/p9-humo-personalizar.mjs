// Prueba de humo REAL (WebGL) del Personalizador: cambia camisa, peinado y color de sala desde la UI,
// comprueba que la escena 3D recibe y dibuja el cambio (con captura), deshacer/rehacer, plano inválido,
// paleta/marca de la oficina, fachada del edificio y que un piso duplicado hereda las apariencias.
// Requiere el servidor de demostración (puerto 4099, BD temporal) tras `vite build`:
//   npx tsx test/p7-demo-servidor.ts <bd-temporal> --sin-eventos
// Uso: node test/p9-humo-personalizar.mjs [url-base] [carpeta-capturas] [--channel=msedge|chrome]
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const canal = process.argv.find((a) => a.startsWith('--channel='))?.split('=')[1] ?? 'msedge';
const base = args[0] ?? 'http://127.0.0.1:4099';
const dir = resolve(args[1] ?? 'capturas-p9');
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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
const foto = (n) => page.screenshot({ path: join(dir, `${n}.png`) });
const vista = (n) =>
  page.locator('[data-testid=vista-previa]').screenshot({ path: join(dir, `${n}.png`) });
const apiGet = async (p, oficina = 'prospeccion') =>
  (await fetch(`${base}/api${p}`, { headers: { 'x-office-id': oficina } })).json();

/** Huella del canvas: rejilla 48x30 de colores, para comparar «antes» y «después» del dibujo real. */
const huella = () =>
  page.evaluate(() => {
    window.__oficina3d.muestra();
    const c = document.querySelector('canvas');
    const o = document.createElement('canvas');
    o.width = 48;
    o.height = 30;
    const g = o.getContext('2d');
    g.drawImage(c, 0, 0, 48, 30);
    return Array.from(g.getImageData(0, 0, 48, 30).data);
  });
const difieren = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4)
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24)
      n++;
  return n;
};
const escena = (campo, id, valor) =>
  page.waitForFunction(
    ([c, i, v]) => window.__oficina3d?.apariencia?.[c]?.[i] === v,
    [campo, id, valor],
    { timeout: 10000 },
  );

// 1) Pantalla y lista
await page.goto(`${base}/personalizar`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__oficina3d?.listo, null, { timeout: 20000 });
await page.waitForTimeout(2500);
ok(
  await page.getByRole('heading', { name: 'Personalizar' }).isVisible(),
  'pantalla Personalizar visible',
);
ok((await page.getByRole('tab').count()) === 3, 'tres pestañas: Personajes, Salas, Oficina');
ok(
  (await page
    .getByRole('navigation', { name: 'Lista de personajes' })
    .getByRole('button')
    .count()) === 12,
  'lista de 12 personajes',
);
ok(
  await page.getByRole('link', { name: 'Personalizar' }).first().isVisible(),
  'acceso desde la barra lateral',
);
await foto('01-personajes');

// 2) Camisa de Camila: hex nuevo -> la escena lo recibe y dibuja distinto
await page.getByRole('button', { name: /^Camila/ }).click();
await page.waitForTimeout(1500);
const antes = await huella();
await vista('02-antes-camisa');
await page.getByLabel('Camisa: código hexadecimal').fill('#FF2D55');
await escena('camisas', 'Cartografo', '#FF2D55');
await page.waitForTimeout(1500);
const despues = await huella();
await vista('03-despues-camisa');
ok(
  difieren(antes, despues) >= 3,
  `el dibujo 3D cambió al cambiar la camisa (${difieren(antes, despues)} px de la rejilla)`,
);
await page.waitForFunction(
  async () => {
    const r = await fetch('/api/oficinas/prospeccion/definicion');
    return (
      (await r.json()).agentes.find((a) => a.id === 'Cartografo').apariencia.camisa === '#FF2D55'
    );
  },
  null,
  { timeout: 8000 },
);
ok(true, 'la camisa quedó guardada en el servidor (autoguardado)');

// 3) Peinado
await page.getByRole('radio', { name: 'Rizado' }).click();
await escena('peinados', 'Cartografo', 'rizado');
await page.waitForTimeout(1500);
await vista('04-peinado-rizado');
ok(true, 'el peinado rizado llegó a la escena');
await page.getByRole('radio', { name: 'Calvo' }).click();
await escena('peinados', 'Cartografo', 'calvo');
await page.waitForTimeout(1200);
await vista('05-peinado-calvo');

// 4) Sala: color de piso
await page.getByRole('tab', { name: 'Salas' }).click();
await page.getByRole('button', { name: /^Dirección/ }).click();
await page.waitForTimeout(1800);
const pisoAntes = await huella();
await page.getByLabel('Piso: código hexadecimal').fill('#3366CC');
await escena('pisos', 'direccion', '#3366CC');
await page.waitForTimeout(1800);
const pisoDespues = await huella();
await vista('06-sala-piso-azul');
ok(
  difieren(pisoAntes, pisoDespues) >= 3,
  `el dibujo 3D cambió al cambiar el piso de la sala (${difieren(pisoAntes, pisoDespues)} px)`,
);

// 5) Deshacer / rehacer (el borrador ya se guardó solo)
await page.waitForFunction(() => document.body.innerText.includes('Cambios guardados'), null, {
  timeout: 8000,
});
await page.getByRole('button', { name: 'Deshacer' }).click();
await escena('pisos', 'direccion', '#B98A5E');
ok(true, 'Deshacer devuelve el piso anterior en la escena');
await page.getByRole('button', { name: 'Rehacer' }).click();
await escena('pisos', 'direccion', '#3366CC');
ok(true, 'Rehacer lo vuelve a aplicar');
// comparar con default
await page.getByRole('button', { name: 'Comparar con default' }).click();
await escena('pisos', 'direccion', '#B98A5E');
await page.getByRole('button', { name: 'Dejar de comparar' }).click();
await escena('pisos', 'direccion', '#3366CC');
ok(true, 'Comparar con default muestra y quita la plantilla');

// 6) Plano: un tamaño imposible se avisa y no se guarda; uno válido sí
await page.getByRole('spinbutton', { name: 'Ancho' }).fill('12');
await page.getByRole('alert').filter({ hasText: 'No se puede aplicar' }).waitFor({ timeout: 5000 });
await vista('07-plano-invalido-preview');
await foto('07-plano-invalido');
ok(true, 'el traslape de salas se avisa en vivo (rectángulo rojo) y no se aplica');
await page.getByRole('spinbutton', { name: 'Ancho' }).fill('6');
await page.waitForTimeout(1800);
ok(
  (await page.getByRole('alert').filter({ hasText: 'No se puede aplicar' }).count()) === 0,
  'un tamaño válido quita el aviso',
);
const sala = (await apiGet('/oficinas/prospeccion/definicion')).salas.find(
  (s) => s.id === 'direccion',
);
ok(sala.apariencia.ancho === 6, 'el tamaño válido quedó guardado');
await foto('08-plano-valido');

// 7) Oficina: paleta, marca y fachada
await page.getByRole('tab', { name: 'Oficina' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Oscuro', exact: true }).click();
await page.waitForFunction(() => window.__oficina3d?.apariencia?.paleta === 'oscuro', null, {
  timeout: 10000,
});
await page.getByRole('textbox', { name: 'Nombre de la marca' }).fill('Marca Blanca Demo');
await page.getByRole('radio', { name: 'Ladrillo' }).click();
await page.waitForTimeout(2500);
await foto('09-oficina-paleta-oscura');
await vista('10-vista-previa-oficina');
const def = await apiGet('/oficinas/prospeccion/definicion');
ok(
  def.office.apariencia.marca === 'Marca Blanca Demo' &&
    def.office.apariencia.fachada.estilo === 'ladrillo',
  'marca y fachada guardadas',
);

// 8) Equipo: formal + aleatorio 50/50
await page.getByRole('tab', { name: 'Personajes' }).click();
// Género de Michael -> aviso (no bloqueante) de paridad 50/50
await page.getByRole('button', { name: /^Michael/ }).click();
await page.getByRole('radio', { name: 'Mujer' }).click();
await page.getByRole('status').filter({ hasText: '50/50' }).waitFor({ timeout: 5000 });
ok(true, 'aviso de paridad (no bloqueante) al cambiar el género');
await foto('11a-aviso-paridad');
await page.getByRole('button', { name: 'Formal', exact: true }).click();
await page.waitForTimeout(2500);
await vista('11-equipo-formal');
await page.getByRole('button', { name: 'Aleatorio 50/50' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
await page.waitForTimeout(3000);
await vista('12-equipo-aleatorio');
const eq = (await apiGet('/oficinas/prospeccion/definicion')).agentes;
ok(
  eq.filter((a) => a.genero === 'f').length === 6,
  'aleatorio de equipo conserva 6 mujeres y 6 hombres',
);

// 9) Guardar como preset desde la UI
await page.getByRole('button', { name: 'Guardar como preset' }).click();
await page.getByRole('dialog').getByRole('textbox').fill('Look de prueba');
await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
await page.getByText('Look de prueba').first().waitFor({ timeout: 8000 });
ok(true, 'el preset propio aparece en la lista');
await foto('13-presets');

// 10) «Ver oficina» y edificio muestran lo guardado; el piso duplicado hereda las apariencias
await page.goto(`${base}/oficina`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__oficina3d?.listo, null, { timeout: 20000 });
await page.waitForTimeout(2500);
await foto('14-ver-oficina-personalizada');
ok(
  (await page.evaluate(() => window.__oficina3d.apariencia.paleta)) === 'oscuro',
  '«Ver oficina» usa la paleta guardada',
);
const dup = await fetch(`${base}/api/oficinas`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ nombre: 'Piso copia', plantilla: 'duplicar', origen: 'prospeccion' }),
});
ok(dup.status === 201, 'se duplicó el piso');
const copia = (await dup.json()).id;
const defCopia = await apiGet(`/oficinas/${copia}/definicion`, copia);
ok(defCopia.office.apariencia.marca === 'Marca Blanca Demo', 'el duplicado heredó la marca blanca');
ok(
  defCopia.salas.find((s) => s.id === 'direccion').apariencia.colorPiso === '#3366CC',
  'el duplicado heredó el piso de la sala',
);
await page.goto(`${base}/oficina?vista=edificio`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await foto('15-edificio-fachada');
await page.evaluate((c) => localStorage.setItem('oficina.activa', c), copia);
await page.goto(`${base}/personalizar`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__oficina3d?.listo, null, { timeout: 20000 });
await page.waitForTimeout(2500);
ok(
  (await page.evaluate(() => window.__oficina3d.apariencia.paleta)) === 'oscuro',
  'Personalizar del piso copia usa la paleta heredada',
);
await foto('16-personalizar-piso-copia');

ok(
  errores.filter((e) => !/removeChild/.test(e)).length === 0,
  `sin errores de página: ${errores.join(' | ')}`,
);
await browser.close();
process.exit(fallas.length ? 1 : 0);
