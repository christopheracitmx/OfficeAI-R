@echo off
setlocal
set "RAIZ=%~dp0"
cd /d "%RAIZ%crm"

rem --- 1) Node: usa tools\node22 si existe (instalacion portable del dueno); si no, el node del sistema ---
if exist "%RAIZ%tools\node22\node.exe" (
  set "PATH=%RAIZ%tools\node22;%PATH%"
  echo Usando Node portable: tools\node22
) else (
  where node >nul 2>&1
  if errorlevel 1 (
    echo ERROR: no se encontro Node.js en este equipo.
    echo Instala Node 22 LTS ^(enlaces en GUIA-INSTALACION.md, seccion 1.2^) y abre una ventana nueva.
        pause
    exit /b 1
  )
)
set "NODE_MAJOR="
for /f %%v in ('node -p "parseInt(process.version.slice(1))"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 22 goto :nodemalo
if %NODE_MAJOR% GTR 24 goto :nodemalo
goto :nodeok
:nodemalo
echo ERROR: esta app requiere Node 22, 23 o 24 y tienes Node %NODE_MAJOR%. Recomendado: Node 22 LTS.
echo Instala Node 22 LTS desde https://nodejs.org/en/download/archive/v22.23.5 ^(ver GUIA-INSTALACION.md, seccion 1.2^) y vuelve a abrir.
pause
exit /b 1
:nodeok

rem --- 2) Configuracion ---
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Se creo crm\.env desde .env.example. Todo es opcional: el CRM arranca sin llaves y avisa que falta.
  echo Edita el archivo si quieres correo, Google Places, etc. ^(ver GUIA-INSTALACION.md^). Cierra el Bloc de notas para continuar.
  notepad ".env"
)
set "PUERTO=4010"
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /c:"CRM_PORT=" ".env"`) do if not "%%b"=="" set "PUERTO=%%b"

rem --- 3) Claude Code (aviso, no bloquea) ---
where claude >nul 2>&1
if errorlevel 1 echo AVISO: no se encontro el comando "claude" (Claude Code). El CRM abre, pero los agentes no podran trabajar hasta instalarlo e iniciar sesion ^(GUIA-INSTALACION.md^).

rem --- 4) Dependencias y compilacion (solo la primera vez o tras actualizar) ---
if not exist "node_modules" (
  call npm ci
  if errorlevel 1 (
    echo ERROR: fallo "npm ci". Revisa la seccion "Solucion de problemas" de GUIA-INSTALACION.md.
    pause
    exit /b 1
  )
)
if not exist "dist\web\index.html" (
  call npm run build
  if errorlevel 1 (
    echo ERROR: fallo "npm run build". Revisa GUIA-INSTALACION.md.
    pause
    exit /b 1
  )
)

rem --- 5) Puerto y arranque ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%RAIZ%liberar-puerto.ps1" -Puerto %PUERTO%
if errorlevel 1 (
  echo ERROR: Puerto %PUERTO% ocupado por otro programa que no es de este proyecto. No se abrio el navegador.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:%PUERTO%"
echo Los agentes trabajan dentro de esta ventana cuando inicias una corrida. Si la cierras, el CRM se detiene.
call npm start
