# Spike P7a-1 — Captura real del canvas 3D (2026-11-25)

## Problema
Obscura (navegador de extracción) no ejecuta WebGL: no sirve para juzgar la escena 3D. Hace falta una captura del canvas real para iterar el aspecto visual y para la prueba de humo.

## Solución verificada
- `playwright-core@1.65.1` (Apache-2.0) instalado en carpeta aislada `tools/pw-shot/` (NO es dependencia del CRM; no descarga navegadores, no tiene postinstall).
- Usa el **Microsoft Edge del sistema** (`channel: 'msedge'`, v145) en modo headless; alternativa `--channel=chrome` (v158).
- Flags: `--enable-gpu --ignore-gpu-blocklist --enable-unsafe-swiftshader` (si no hay GPU cae a SwiftShader).
- Resultado en este equipo: `renderer: ANGLE (AMD Radeon(TM) Graphics, Direct3D11)` → WebGL2 con la GPU real, 60 fps de rAF en headless.

## Uso
```bash
export PATH="<raiz>/tools/node22:$PATH"
cd tools/pw-shot
node shot.mjs http://127.0.0.1:5174/oficina <salida.png> --wait=6000 --w=1440 --h=900 [--fps] [--click=x,y] [--eval="js"] [--reduced]
```
- `--fps` mide fps de requestAnimationFrame durante 3 s (indicativo; headless no es igual al navegador visible).
- `--eval` ejecuta JS en la página (ganchos de prueba `window.__oficina3d`).
- `--reduced` emula `prefers-reduced-motion: reduce`.
- Imprime consola y errores de la página (útil para detectar shaders rotos o context lost).

## Prueba de humo
`test/p7-humo-3d.mjs` (fuera de vitest, requiere servidor levantado y Edge) abre «Ver oficina», espera el canvas, comprueba que no esté vacío (píxeles distintos del fondo) y lee `window.__oficina3d` (agentes renderizados, calidad, fps). Ver GUIA-PUESTA-EN-MARCHA.md.

## Límites
- Depende de Edge/Chrome instalados. Sin ellos: instalar Chromium aislado con `npx playwright-core install chromium` dentro de `tools/pw-shot` (no se hizo: no hizo falta).
- Las capturas se guardan en el scratchpad de la sesión (temporal); no se versionan.
