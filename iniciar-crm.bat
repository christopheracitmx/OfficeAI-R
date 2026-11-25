@echo off
setlocal
set "RAIZ=%~dp0"
set "PATH=%RAIZ%tools\node22;%PATH%"
cd /d "%RAIZ%crm"
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Se creo crm\.env: agrega ahi RESEND_API_KEY y GOOGLE_PLACES_API_KEY y vuelve a abrir.
  notepad ".env"
)
where claude >nul 2>&1
if errorlevel 1 echo AVISO: no se encontro el comando "claude" (Claude Code). Los agentes no podran trabajar hasta instalarlo e iniciar sesion.
if not exist "dist\web\index.html" call npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File "%RAIZ%liberar-puerto.ps1" -Puerto 4010
if errorlevel 1 (
  echo ERROR: Puerto 4010 ocupado por otro programa que no es de este proyecto. No se abrio el navegador.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4010"
echo Los agentes trabajan dentro de esta ventana cuando inicias una corrida. Si la cierras, el CRM se detiene.
call npm start
