# OfficeAI-R: guía de instalación desde cero (Windows)

Esta guía te lleva de un equipo sin nada instalado a tener el CRM funcionando en tu navegador y tu primer piso (oficina de agentes) creado. Está escrita para una persona con nivel técnico intermedio en **Windows 10 u 11**.

> macOS y Linux **no están verificados**: esta guía y `iniciar-crm.bat` son solo para Windows. Es probable que la app (Node + SQLite) funcione en otros sistemas, pero nadie lo ha comprobado.

Todos los comandos se escriben en **PowerShell** (menú Inicio → «PowerShell»), salvo que se indique otra cosa. No necesitas ser administrador, excepto para instalar Git o Node si tu empresa lo exige.

## 0. Qué vas a instalar (resumen)

| Pieza | Para qué | Obligatoria |
| --- | --- | --- |
| Git | Descargar y actualizar la app | Sí |
| Node.js 22 LTS | Ejecuta el servidor y compila la interfaz | Sí |
| Claude Code + cuenta Claude Pro o Max | Es el «cerebro» de los agentes (usa tu suscripción) | Sí para que los agentes trabajen. El CRM abre sin él y avisa |
| Obscura (0.2.7) | Lee páginas web de forma barata para los agentes | No. Sin él los agentes usan solo la búsqueda web de Claude |
| Resend | Envía correos de aviso | No |
| Google Places, DENUE | Descubrir empresas (solo piso de Prospección) | No |

## 1. Requisitos

### 1.1 Git

1. Descarga **Git for Windows** de <https://git-scm.com/download/win> e instálalo con las opciones por defecto (también sirve `winget install Git.Git`).
2. Abre una PowerShell **nueva** y comprueba:

```powershell
git --version
```

Debe imprimir algo como `git version 2.5x.x.windows.x`.

### 1.2 Node.js 22 LTS

La app declara en `crm\package.json` el motor `"node": ">=22 <25"`: sirven **Node 22, 23 y 24**. Se verificó con **Node 22.23.5** (recomendado). Aunque en nodejs.org la «LTS» más nueva sea una versión 26, **no la uses**: queda fuera del rango declarado y `iniciar-crm.bat` la rechaza.

Instalación (elige una):

- Instalador oficial: abre <https://nodejs.org/en/download/archive/v22.23.5> y descarga el instalador de Windows de 64 bits (`node-v22.23.5-x64.msi`). Si ya hay una 22.x más reciente, puedes usarla (<https://nodejs.org/en/about/previous-releases> lista las versiones). Ejecuta el instalador con las opciones por defecto. No marques la casilla opcional de herramientas nativas (Chocolatey/Visual Studio): no hace falta.
- O con winget: `winget install OpenJS.NodeJS.22`

Cierra y abre PowerShell, y comprueba:

```powershell
node -v
npm -v
```

`node -v` debe empezar con `v22.` (o `v23.`/`v24.`).

### 1.3 Herramientas de compilación de Windows (normalmente NO hacen falta)

El único módulo nativo es `better-sqlite3`. La versión fijada (13.2.0) **trae su binario precompilado** para Windows x64 y ARM64 dentro del paquete, así que `npm ci` no compila nada. El repositorio incluye `crm\.npmrc` con `ignore-scripts=true` justo para que npm no intente compilar con Visual Studio (sin ese archivo, `npm ci` falla en equipos sin «Build Tools» con errores `gyp ERR! find VS`).

Solo si `npm ci` termina bien pero al arrancar ves un error al cargar `better-sqlite3` (por ejemplo en una arquitectura sin binario), instala **Visual Studio Build Tools** (<https://visualstudio.microsoft.com/downloads/>, sección «Herramientas para Visual Studio» → carga de trabajo «Desarrollo para el escritorio con C++») y ejecuta en `crm`: `npm rebuild better-sqlite3 --ignore-scripts=false --build-from-source`. (Este camino de respaldo no se pudo probar en la verificación.)

### 1.4 Claude Code y tu cuenta

Necesitas una suscripción **Claude Pro o Max** (el plan gratuito no incluye Claude Code). Planes: <https://claude.com/pricing>.

Instala Claude Code con el instalador oficial (documentación: <https://code.claude.com/docs/en/setup>):

```powershell
irm https://claude.ai/install.ps1 | iex
```

(Alternativa: `winget install Anthropic.ClaudeCode`.) Cierra y abre PowerShell y comprueba:

```powershell
claude --version
```

Inicia sesión con tu cuenta (se abre el navegador):

```powershell
claude auth login
claude auth status
```

`claude auth status` debe mostrar `"loggedIn": true` y `"authMethod": "claude.ai"`. Si dice otra cosa, repite `claude auth login`.

**Cuida tu plan.** Los agentes gastan de **tu** suscripción, la misma que usas para chatear con Claude:

- El CRM usa el modelo **claude-sonnet-5-5** con esfuerzo bajo (`crm\config\engine.yaml`).
- Hace **una llamada de IA a la vez en todo el edificio**: si dos pisos corren a la vez, esperan turno.
- Tiene una **reserva** (Configuración → «Plan y reserva»): la corrida se pausa sola al 70 % de la ventana de 5 horas y al 90 % de la semanal. Puedes reanudar cuando quieras.
- Antes de iniciar una corrida ves un consumo **estimado**; si pasa del umbral, pide confirmación.
- Nada corre solo: sin pulsar «Iniciar corrida» (o sin mandar un mensaje al asistente de «Nuevo piso») no se gasta plan.
- El asistente de «Nuevo piso» gasta unos 4,000-6,000 tokens por mensaje. El modo formulario no gasta nada.

### 1.5 Obscura 0.2.7 (opcional, recomendado)

Obscura es un navegador sin interfaz que los agentes usan para leer sitios web. Fuente oficial: <https://github.com/h4ckf0r0day/obscura/releases/tag/v0.2.7> (versión verificada contra la API de GitHub el 2026-11-26; es la última publicada). El archivo para Windows es **`obscura-x86_64-windows.zip`** (la variante sin «stealth» ni «no-render»), cuyo SHA-256 publicado es:

```
be983b663552e11faf8c1e07696578bad622dbeb48afb9f59036032ca8e97fb3
```

Descárgalo a una carpeta temporal, **verifica el checksum** y extráelo en `tools\obscura\` dentro de la carpeta del proyecto (ver 2; esa carpeta no viene en el repositorio y git la ignora). Los comandos completos están en el paso 3.3.

## 2. Descarga la app

Elige una carpeta **corta y sin acentos**, fuera de OneDrive (por ejemplo `C:\OfficeAI-R`):

```powershell
git clone https://github.com/christopheracitmx/OfficeAI-R.git C:\OfficeAI-R
cd C:\OfficeAI-R
```

A esa carpeta la llamamos la **raíz del proyecto**. Dentro verás `crm\` (la app), `docs\`, `iniciar-crm.bat`, `liberar-puerto.ps1` y esta guía.

## 3. Instalación

### 3.1 Dependencias

```powershell
cd C:\OfficeAI-R\crm
npm ci
```

Tarda entre 30 segundos y 2 minutos. Debe terminar con `found 0 vulnerabilities` (o un resumen de paquetes sin errores). Puede aparecer un aviso `EBADENGINE` si tu Node está fuera del rango 22-24: corrígelo con la sección 1.2.

### 3.2 Compilar la interfaz

```powershell
npm run build
```

Revisa los tipos (`tsc`) y genera `crm\dist\web`. Debe terminar con `built in ...ms` y sin errores.

### 3.3 Obscura (si lo quieres)

Desde la raíz del proyecto:

```powershell
cd C:\OfficeAI-R
New-Item -ItemType Directory -Force tools\obscura | Out-Null
$zip = "$env:TEMP\obscura-x86_64-windows.zip"
Invoke-WebRequest -Uri "https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.7/obscura-x86_64-windows.zip" -OutFile $zip
(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
```

El resultado **debe ser idéntico** a `be983b66...fb3` (arriba). Si no coincide, borra el archivo y no lo uses. Si coincide:

```powershell
Expand-Archive $zip -DestinationPath tools\obscura -Force
Remove-Item $zip
.\tools\obscura\obscura.exe --version
```

Debe imprimir `obscura 0.2.7`. La carpeta debe conservar los cuatro archivos juntos: `obscura.exe`, `obscura-worker.exe`, `vcruntime140.dll` y `vcruntime140_1.dll`.

El CRM busca Obscura en `tools\obscura\obscura.exe` (en la raíz del proyecto) por defecto. Para usar otra ubicación, pon en `crm\.env` la variable `OBSCURA_BIN` (ruta absoluta, o relativa a la carpeta `crm`):

```
OBSCURA_BIN=D:\herramientas\obscura\obscura.exe
```

Si el archivo no existe, **el CRM arranca igual**: muestra un aviso naranja en la barra lateral y en Configuración → «Cuotas y motor», y los agentes leen la web solo con la búsqueda web de Claude.

### 3.4 Configura `crm\.env`

Si no existe, el primer arranque con `iniciar-crm.bat` lo crea desde `crm\.env.example` y abre el Bloc de notas. También puedes hacerlo a mano:

```powershell
cd C:\OfficeAI-R\crm
Copy-Item .env.example .env
notepad .env
```

**Todas las variables son opcionales**: puedes arrancar con el archivo tal cual y completarlo después (reinicia el CRM al cambiarlo). Escribe `NOMBRE=valor` sin comillas ni espacios alrededor del `=`.

| Variable | Obligatoria | Qué hace y cómo obtenerla |
| --- | --- | --- |
| `RESEND_API_KEY` | No | Llave de [Resend](https://resend.com) para enviar correos de aviso. Crea una cuenta gratis, entra a <https://resend.com/api-keys> → «Create API Key» (permiso «Sending access») y pégala. Sin llave, los correos fallan de forma controlada y todo lo demás funciona. |
| `RESEND_FROM` | No | Remitente. Vacío = `onboarding@resend.dev`, un remitente de pruebas que **solo entrega al correo con el que creaste la cuenta de Resend**. Para escribir a otras personas, verifica un dominio propio en <https://resend.com/domains> (te pide agregar registros DNS) y usa por ejemplo `alertas@tudominio.com`. |
| `CRM_DESTINATARIO_INICIAL` | No | Correo del primer destinatario de reportes. **Solo se lee al crear la base por primera vez** y solo si aún no hay destinatarios. Vacío = no se siembra ninguno y el CRM muestra «Sin destinatarios». Después se administran en Configuración → «Correos de reportes». No altera bases existentes. |
| `GOOGLE_PLACES_API_KEY` | No | Solo piso de Prospección. Ver advertencia abajo. Vacío = descubrimiento con búsqueda web y fuentes gratuitas. |
| `DENUE_TOKEN` | No | Token gratuito del DENUE (INEGI) para consultas en vivo: se solicita en <https://www.inegi.org.mx/app/api/denue/tokenVerify/tokenverify.html>. El DENUE descargado (CSV) no lo necesita. Detalle en `PASOS-MANUALES-FUENTES.md`. |
| `OVERPASS_URL` | No | (Comentada por defecto.) Otra instancia de Overpass/OpenStreetMap si no quieres la pública. |
| `OBSCURA_BIN` | No | Ruta a `obscura.exe` (ver 3.3). |
| `CRM_PORT` | No | Puerto local. Por defecto 4010. Cámbialo si ya lo usa otro programa. |
| `CRM_DB_PATH` | No | Dónde vive la base SQLite. Por defecto `./data/crm.db` (relativa a `crm`). |

**Advertencia sobre Google Places.** Se usa la API «Places API (New)» y **exige una cuenta de facturación** en Google Cloud (<https://console.cloud.google.com/apis/library/places.googleapis.com>; llaves en <https://console.cloud.google.com/apis/credentials>). Google da un uso gratuito mensual limitado y cobra por encima de él: revisa las tarifas vigentes en <https://developers.google.com/maps/billing-and-pricing/pricing>. Antes de pegar la llave: restríngela a «Places API (New)», fija una **cuota diaria baja** en la página de cuotas de esa API y crea una **alerta de presupuesto** en Facturación. El CRM aplica además un tope mensual propio (4,900 por defecto, ajustable en Configuración → «Cuotas y motor»), pero ese tope no sustituye a las cuotas de Google. Si no tienes por qué usarla, déjala vacía.

Nunca subas `.env` a git (ya está en `.gitignore`) ni lo pegues en chats o correos.

### 3.5 Primer arranque

**Con el script:** doble clic en `iniciar-crm.bat` (en la raíz). Hace, en orden: usa `tools\node22` si existe o el Node del sistema (y comprueba que sea 22-24; si no, te explica qué instalar), crea `crm\.env` si falta, avisa si no encuentra `claude`, ejecuta `npm ci` y `npm run build` si faltan, libera el puerto si quedó una instancia previa de ESTE proyecto, abre el navegador y arranca el servidor. **Deja esa ventana abierta**: los agentes trabajan dentro de ella.

**Con comandos manuales (equivalente):**

```powershell
cd C:\OfficeAI-R\crm
npm start
```

y abre <http://127.0.0.1:4010> en el navegador.

Qué pasa solo la primera vez: se crea `crm\data\crm.db`, se aplican las migraciones (hasta la 009), se siembran los giros, el piso «Oficina de prospección» con su Biblioteca, prompts y habilidades, y se genera `crm\data\agent.token`. Cuando una actualización trae migraciones nuevas, el servidor hace antes un respaldo en `crm\data\backups\` (se conservan los últimos 5). En la consola verás las líneas «CRM OfficeAI-R escuchando…» y «Base de datos (real): …», y los avisos `AVISO:` de lo que falte (Obscura, Claude, destinatarios).

> El piso «Oficina de prospección» que viene sembrado es el ejemplo de la empresa que creó la app (ACITMX: Lenovo y Aruba). Si tu área no prospecta, ignóralo o archívalo en Edificio. Los pisos que crees **no heredan** su contenido.

### 3.6 Comprueba la salud

Con el servidor corriendo, en otra PowerShell:

```powershell
curl.exe -s http://127.0.0.1:4010/api/health
curl.exe -s http://127.0.0.1:4010/api/estado
```

- `/api/health` debe responder `{"ok":true}`.
- `/api/estado` devuelve JSON con `base_datos` (`ruta` y `modo`), `resend_configurado`, `remitente` y un bloque `diagnostico` con `claude`, `obscura` y `destinatarios` (cada uno con `aviso: null` si todo está bien).

En la interfaz: **Configuración → «Cuotas y motor»** muestra la ruta de la base, el modo y el «Diagnóstico de instalación».

**Real o demostración.** Tu base real se llama `crm\data\crm.db` y el modo dice `real`. Si ves el aviso naranja «BASE DE DEMOSTRACIÓN» en la barra lateral, ese servidor usa una base de pruebas: ciérralo y abre `iniciar-crm.bat`. Si el puerto lo ocupa otro programa, el script se detiene con un mensaje claro y no abre el navegador.

## 4. Tu primer piso

Un **piso** es una oficina de agentes de IA con su flujo, Biblioteca, datos y herramientas.

1. Menú lateral → **Edificio** → **Nuevo piso**.
2. Elige cómo empezar:
   - **Con asistente (IA)**: conversas con la «Arquitecta de oficinas». Requiere `claude auth status` correcto; cada mensaje gasta un poco de tu plan.
   - **Formulario guiado (sin IA)**: las mismas 9 fases llenando campos. No gasta plan y es la opción para probar la instalación sin Claude.
   - **Desde una plantilla** de la galería (Vacía, Base de datos, Archivos/CRM, Noticias del sector).
3. Recorre las fases (objetivo, datos, agentes, herramientas, Biblioteca inicial, candados, vista previa 3D, prueba controlada opcional) y marca **Apruebo este borrador** para crearlo. Nada se crea antes.
4. El piso aparece en el Edificio. Selecciónalo en el selector de piso (barra lateral) para trabajar en él.

**Archivos y correo por piso** (Configuración → «Herramientas del piso», solo pisos nuevos): ambos vienen **apagados**.

- *Archivos*: autoriza carpetas con ruta absoluta (por ejemplo `C:\Documentos\Facturas`) y actívalo. Los agentes solo listan y leen texto dentro de esas carpetas; «mover» manda a `_cuarentena` y **nunca borra**.
- *Correo de avisos*: requiere Resend (3.4) y al menos un destinatario activo; envía solo a destinatarios internos, máximo 10 por hora.

**Personalizar** (barra lateral): apariencia de personajes, salas y oficina, con vista previa 3D, deshacer, versiones y presets.

**Correr un piso**: selecciónalo, ve a **Corrida**, escribe la tarea, revisa el estimado de consumo y confirma. Puedes **Detener** cuando quieras. Más detalle de la operación diaria en `GUIA-PUESTA-EN-MARCHA.md`.

## 5. Límites del plan y qué hacer si se agota

| Estado | Significado | Qué hacer |
| --- | --- | --- |
| Pausada: reserva del plan | Llegó a tu reserva (70 % / 90 %) | Espera a que se reinicie la ventana o pulsa **Reanudar de todos modos** |
| Pausada: límite del plan de IA (`pausada_limite_plan`) | Tu suscripción llegó a su límite | Espera a que se libere (la pantalla muestra la hora si Claude la informa) y pulsa **Reanudar**: sigue donde se quedó |
| Error | Pasos fallidos seguidos o tiempo máximo | Revisa «Actividad» y pulsa **Reanudar** |

Configuración → «Plan y reserva» permite cambiar la reserva y poner un presupuesto de tokens si Claude no informa el porcentaje.

## 6. Respaldos y restauración

- **Automáticos**: antes de cada migración, en `crm\data\backups\crm-pre-<migración>-<fecha>.db` (últimos 5).
- **Manual**: Configuración → «Respaldos» → crear respaldo. Para restaurar desde ahí, escribe `RESTAURAR` (antes se respalda el estado actual).
- **A mano**: cierra el CRM (Ctrl+C en su ventana), copia el respaldo elegido sobre `crm\data\crm.db` y borra `crm\data\crm.db-wal` y `crm\data\crm.db-shm` si existen. Vuelve a abrir.
- Para pasar tu base a otro equipo, copia `crm\data\crm.db` (con el CRM cerrado) a la misma ruta del otro equipo.

## 7. Actualizar la app

Cierra el CRM y, en PowerShell:

```powershell
cd C:\OfficeAI-R
git pull
cd crm
npm ci
npm run build
```

Vuelve a abrir con `iniciar-crm.bat`. Las migraciones se aplican solas (con respaldo previo) y tus pisos, datos y `.env` no se tocan porque no están en git. Si `git pull` se queja de cambios locales, no edites archivos del repositorio: la personalización de pisos se hace dentro de la app.

## 8. Seguridad

- El servidor escucha **solo en 127.0.0.1**: accesible únicamente desde ese equipo. **No lo expongas** a la red (ni con túneles, port-forwarding ni cambiando el código): no tiene inicio de sesión.
- **No subas** `crm\.env` ni `crm\data\` (base, respaldos, `agent.token`) a git, correo o chats. Ya están en `.gitignore`.
- **Rotar `agent.token`** (el secreto entre el servidor y los agentes): cierra el CRM, borra `crm\data\agent.token` y vuelve a abrir; se genera uno nuevo.
- Los agentes no contactan a nadie externo ni mencionan precios; los correos salen solo a destinatarios internos.
- Si una llave (Resend, Google, DENUE) se expone, revócala en el sitio del proveedor y crea otra.
- El contenido de la web y de los archivos que leen los agentes es texto no confiable: no pegues en la app instrucciones que no entiendas.

## 9. Solución de problemas

**El puerto 4010 está ocupado.** `iniciar-crm.bat` cierra solo una instancia anterior de ESTE proyecto. Si es otro programa, te lo dice. Para ver quién lo usa:

```powershell
powershell -ExecutionPolicy Bypass -File C:\OfficeAI-R\liberar-puerto.ps1 -Puerto 4010 -SoloListar
Get-NetTCPConnection -LocalPort 4010 -State Listen
```

Cierra ese programa, o pon `CRM_PORT=4020` en `crm\.env`. El mensaje del servidor es «Puerto 4010 ocupado: otro proceso lo usa».

**`claude` no se reconoce / «no se encontró el comando claude».** Cierra y abre PowerShell tras instalar. Si sigue, revisa `claude --version` y el PATH (el instalador nativo usa `%USERPROFILE%\.local\bin`; guía: <https://code.claude.com/docs/en/troubleshoot-install>). Alternativa: escribe la ruta completa en `bin:` de `crm\config\engine.yaml` y reinicia. Si la sesión expiró, `claude auth login`.

**`npm ci` falla con `gyp ERR! find VS`.** Falta el archivo `crm\.npmrc` (ver 1.3). Restáuralo con `git checkout crm/.npmrc` o ejecuta `npm ci --ignore-scripts`.

**Error al cargar `better-sqlite3` al arrancar.** Comprueba `node -v` (22-24, 64 bits) y repite `npm ci`. Si persiste, ver 1.3 (Build Tools).

**`EBADENGINE` o `iniciar-crm.bat` dice que tu Node no sirve.** Instala Node 22 (1.2). Puedes tener varias versiones con `winget`, pero solo una primero en el PATH.

**Windows SmartScreen o el antivirus bloquea `obscura.exe`.** Obscura es un binario sin firma de editor conocido. Si verificaste el checksum (3.3) y confías, desbloquéalo: `Unblock-File C:\OfficeAI-R\tools\obscura\*.exe`; si el antivirus lo pone en cuarentena, restáuralo y agrega una exclusión para la carpeta `tools\obscura`. Si prefieres no usarlo, déjalo sin instalar: el CRM funciona con el aviso.

**Faltan `vcruntime140.dll`.** Instala el paquete «Visual C++ Redistributable» de Microsoft: <https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist>.

**Importar el CSV del DENUE falla o salen 0 filas.** Revisa que sea el CSV de **datos** (no el diccionario), que esté descomprimido y que la ruta sea correcta. Los pasos y el comando `npm run datasets:importar` están en `PASOS-MANUALES-FUENTES.md`. El lector tolera nombres de columnas alternativos; si no reconoce el archivo, no importa nada y lo dice.

**Los correos no salen.** Configuración → «Correos de reportes» → **Enviar prueba**. Revisa `RESEND_API_KEY`, que haya destinatarios activos y, si usas `onboarding@resend.dev`, que el destinatario sea el correo de tu cuenta de Resend (si no, Resend responde 403).

**La pantalla se queda en blanco.** Comprueba que corriste `npm run build` y que abres `http://127.0.0.1:4010` (no `localhost` de otro puerto). Presiona Ctrl+F5.

## 10. Desinstalación

1. Cierra el CRM (Ctrl+C en su ventana) y su navegador.
2. Si quieres conservar tus datos, copia antes `crm\data\` y `crm\.env`.
3. Borra la carpeta del proyecto: `Remove-Item -Recurse -Force C:\OfficeAI-R`. No se instaló nada fuera de ella (salvo Git, Node y Claude Code).
4. Opcional: `winget uninstall OpenJS.NodeJS.22`, `winget uninstall Git.Git`, y para Claude Code: `claude auth logout` y después `Remove-Item "$env:USERPROFILE\.local\bin\claude.exe"; Remove-Item -Recurse "$env:USERPROFILE\.local\share\claude"` (ver <https://code.claude.com/docs/en/setup#uninstall-claude-code>).
5. Revoca las llaves de Resend, Google y DENUE si las creaste solo para esto.

## 11. Lista de verificación final («todo bien si…»)

- [ ] `git --version` y `node -v` (v22 a v24) responden.
- [ ] `claude --version` responde y `claude auth status` dice `loggedIn: true`.
- [ ] `npm ci` y `npm run build` terminaron sin errores en `crm`.
- [ ] (Opcional) `tools\obscura\obscura.exe --version` imprime `obscura 0.2.7` y el SHA-256 del zip coincidía.
- [ ] `iniciar-crm.bat` (o `npm start`) muestra «CRM OfficeAI-R escuchando en http://127.0.0.1:4010» y «Base de datos (real): …\crm\data\crm.db».
- [ ] `curl.exe -s http://127.0.0.1:4010/api/health` devuelve `{"ok":true}`.
- [ ] `/api/estado` muestra `"modo":"real"` y el `diagnostico` sin avisos de lo que instalaste (los avisos de lo opcional que omitiste son normales).
- [ ] El navegador abre el CRM sin la franja «BASE DE DEMOSTRACIÓN».
- [ ] Configuración → «Correos de reportes» → **Enviar prueba** llega (si configuraste Resend).
- [ ] Creaste un piso de prueba desde **Edificio → Nuevo piso** y aparece en el Edificio.
- [ ] `crm\.env` y `crm\data\` no aparecen en `git status`.
