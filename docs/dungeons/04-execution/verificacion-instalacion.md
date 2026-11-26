# Verificación de instalación desde cero (P12)

Fecha: 2026-11-26. Se siguió `GUIA-INSTALACION.md` en un clon nuevo del repositorio (`git clone` de la carpeta local, equivalente al estado publicado más los commits de P12) en una carpeta temporal fuera del proyecto, **sin `tools\` y sin `crm\.env`**. Node: se usó el Node 22.23.5 de `tools\node22` del dueño solo como «Node 22 instalado en el sistema» (PATH reducido); el Node 26 real del sistema se usó para probar el rechazo. Puerto 4099 y BD temporal; el puerto 4010 y `crm\data\crm.db` del dueño no se tocaron. Sin llamadas a Claude.

## Resultados

| Paso | Resultado |
| --- | --- |
| `git clone`; `Test-Path tools` / `Test-Path crm\.env` | False / False |
| `npm ci` (Node 22.23.5, npm 10.9.9) | **Falló la primera vez** (ver Hallazgos). Con `crm\.npmrc`: OK, `found 0 vulnerabilities`, sin compilar nada |
| `npm run build` | OK (`built in ~690ms`) |
| `npx tsc --noEmit` | 0 errores |
| `npx vitest run` | 290 passed, 2 skipped (1 fallo intermitente al inicio, ver Hallazgos) |
| Obscura (guía 3.3): descarga, SHA-256, extracción, `--version` | SHA-256 `be983b66...fb3` coincide con el publicado por GitHub (API del release v0.2.7, última versión); `obscura 0.2.7`; 4 archivos |
| Arranque real `npm start` (4099, BD temporal, sin llaves) | «CRM OfficeAI-R escuchando…», migra (9 migraciones, última 009_fuentes) y siembra (13 giros, 1 piso, 8 documentos de Biblioteca, 11 prompts, 6 habilidades, 0 destinatarios) |
| `/api/health` | `{"ok":true}` |
| `/api/estado` | `modo: real`, `remitente: onboarding@resend.dev`, `resend_configurado: false`, bloque `diagnostico` |
| Sin Obscura | aviso claro con la ruta esperada y `OBSCURA_BIN` (consola y UI); tras instalarlo según la guía el aviso desaparece |
| Sin destinatarios | aviso en consola, barra lateral y Configuración; con `CRM_DESTINATARIO_INICIAL` en `.env` siembra 1 y no avisa |
| Sin `claude` en PATH (PATH reducido) | aviso en `iniciar-crm.bat` y `diagnostico.claude.aviso`; con `claude` presente: `2.1.332 (Claude Code)` |
| UI | carga en Edge headless sin errores de página; barra lateral con avisos y «Diagnóstico de instalación» en Configuración (capturas en `capturas-p12/`) |
| Piso nuevo («Finanzas») | sin Biblioteca heredada (`/api/kb/docs` = `[]`), barra lateral con «OfficeAI-R» y sin logo ACITMX; Prospección conserva su logo |
| `iniciar-crm.bat` sin `tools\` y Node 26 del sistema | `ERROR: esta app requiere Node 22, 23 o 24 y tienes Node 26...` y sale |
| `iniciar-crm.bat` sin Node en PATH | `ERROR: no se encontro Node.js en este equipo...` y sale |
| `iniciar-crm.bat` con Node 22 en PATH (copia sin la línea que abre el navegador) | lee `CRM_PORT` de `.env`, omite `npm ci`/build si ya existen, revisa el puerto, arranca; `/api/health` OK |

## Hallazgos y correcciones

1. **`npm ci` fallaba en una instalación limpia** con `gyp ERR! find VS` (npm 10 y npm 11): intentaba compilar `better-sqlite3` aunque el paquete 13.2.0 trae binarios precompilados (`prebuilds/win32-x64.node`, `win32-arm64.node`). Corrección: `crm/.npmrc` con `ignore-scripts=true` (solo `esbuild` y `fsevents` tenían scripts; no se necesitan). Verificado: `npm ci` limpio, build, tsc y 290 pruebas. Ya no se requieren Build Tools de Visual Studio; la guía los deja como respaldo (sin verificar).
2. **`iniciar-crm.bat`** dependía de `tools\node22` y arrastraba el `errorlevel` de `where claude` hacia el chequeo de `npm ci` (habría abortado siempre que faltara `claude`). Reescrito con bloques `if (...)`.
3. **Mensajes con `\.`**: en JS, `crm\.env` salía como `crm.env`; ahora «el archivo crm/.env».
4. **Prueba intermitente** `p8-edificio-runner` (carrera con sleeps de 40 ms) fallaba de forma repetida en el clon; se subió la holgura a 250 ms (3 corridas seguidas OK, suite completa OK).
5. `PASOS-MANUALES-FUENTES.md` tenía un carácter BEL en lugar de `\a` en una ruta (`denue\archivo.csv`): corregido.
6. Node: la «LTS» actual de nodejs.org es 26, fuera de `engines` (`>=22 <25`). La guía indica Node 22 y el `.bat` rechaza 25 o superior. Con Node 26 las pruebas p0/p12 pasaron en una comprobación aparte, pero no se declara soportado.

## No verificado

- macOS/Linux; Windows ARM; instalación de Git/Node/Claude Code desde cero en un equipo virgen (se comprobaron enlaces, versiones y IDs de winget con `winget search`, no se instalaron).
- Rama del `.bat` que abre el Bloc de notas al crear `.env` (interactiva) y la apertura del navegador.
- `npm rebuild better-sqlite3 --build-from-source` (camino de respaldo con Build Tools).
- Resend (envío real), Google Places, DENUE (token), asistente de «Nuevo piso» con IA (sin llamar a Claude).
- SmartScreen/antivirus sobre `obscura.exe` (el binario se ejecutó sin bloqueo en esta máquina).
