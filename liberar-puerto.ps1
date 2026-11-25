# Cierra una instancia anterior de ESTE proyecto que ocupe el puerto del CRM.
# Solo mata procesos cuya línea de comandos pertenezca a esta carpeta (crm\...). Cualquier otro proceso se respeta.
param([int]$Puerto = 4010, [switch]$SoloListar)
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$conex = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
if (-not $conex) { Write-Host "Puerto $Puerto libre."; exit 0 }
$ocupado = $false
foreach ($pid_ in ($conex | Select-Object -ExpandProperty OwningProcess -Unique)) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$pid_" -ErrorAction SilentlyContinue
  $cmd = if ($p) { [string]$p.CommandLine } else { '' }
  $esNuestro = $cmd -and ($cmd -like "*$raiz*")
  if ($esNuestro -and -not $SoloListar) {
    Write-Host "Cerrando instancia anterior del CRM (PID $pid_)..."
    # También sus procesos padre del mismo proyecto (npm/tsx) y sus hijos.
    $padre = $p.ParentProcessId
    $ids = @($pid_)
    while ($padre) {
      $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$padre" -ErrorAction SilentlyContinue
      if (-not $pp -or ([string]$pp.CommandLine) -notlike "*$raiz*") { break }
      $ids += $padre; $padre = $pp.ParentProcessId
    }
    foreach ($i in $ids) { & taskkill /PID $i /T /F | Out-Null }
  } elseif ($esNuestro) {
    Write-Host "Instancia anterior de este proyecto en el puerto $Puerto (PID $pid_)."; $ocupado = $true
  } else {
    Write-Host "El puerto $Puerto lo usa otro programa (PID $pid_) que no es de este proyecto. No se cierra."; $ocupado = $true
  }
}
Start-Sleep -Milliseconds 800
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) { exit 1 }
exit 0
