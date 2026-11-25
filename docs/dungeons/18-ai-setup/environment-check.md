# Capa 18 — Diagnóstico del entorno (2026-11-25)

Equipo: Windows 11, AMD64, 15.3 GB RAM.

| Herramienta | Estado |
|---|---|
| Node | v26.13.0 (**no soportado por Munder Difflin**: pide Node 22, acepta 20, rechaza 26) |
| npm | 11.20.0 |
| git | 2.56.0 |
| Python | 3.15.2 |
| Claude Code | 2.1.332 (motor principal) |
| OpenCode | v2.3.2 (instalado vía pnpm) |
| Gemini CLI | no instalado (opcional) |
| Obscura | no instalado |
| Munder Difflin | DESCARTADO (decisión 2026-11-25): reemplazado por runner propio; `tools/munder-difflin` queda solo como referencia |
| Visual Studio Build Tools | presente (necesario para compilar node-pty) |

## Hallazgos
1. Munder necesita Node 22 (o 20). Con Node 26 global, `npm install` de Munder falla o rompe node-pty. Hay que usar Node 22 solo para Munder.
2. El CRM (better-sqlite3) también conviene en Node 22 LTS: los binarios precompilados de better-sqlite3 pueden no existir para Node 26.
3. Gemini no hace falta ahora (motores: Claude Code y OpenCode ya están).
4. Build Tools ya está: node-pty debería compilar.

## Pasos de la capa 18 (cada uno con aprobación del dueño)
1. Resolver Node 22 sin romper el Node 26 global.
2. Clonar e instalar Munder Difflin (carpeta aparte, fuera del repo del CRM).
3. Descargar Obscura (zip x86_64 de Releases, build SIN stealth) en `tools/obscura/`; spike de `obscura fetch` sobre sitios reales de México.
4. Spike de Playwright (`connectOverCDP`) sobre `obscura serve` (solo si el fetch no basta).
5. Crear `config/engine.yaml` y `.env.example` (Resend, Places) sin secretos.
6. Definir cómo Munder invoca las herramientas del CRM (MCP) y cómo se dispara una corrida.
7. Configurar el roster de agentes en Munder con los system prompts de `14-ai-native/agent-roster.md`.

## Progreso (2026-11-25)
- [x] Paso 1: Node 22.23.5 portátil en `tools/node22/` (SHA256 verificado contra nodejs.org). El Node 26 global no se tocó. Para usarlo: anteponer `tools/node22` al PATH solo en la sesión.
- [x] Paso 2a: Munder Difflin clonado en `tools/munder-difflin/` (HEAD 156a0da, v0.6.0, `engines: node >=20 <25`). Scripts de postinstall revisados (`ensure-pty-perms.cjs`: no-op en Windows; `patch-node-pty-conpty.cjs`: parche local de node-pty, sin red ni procesos). `postinstall` también corre `electron-rebuild -f` (compila node-pty con Build Tools).
- [ ] Paso 2b: `npm install` en Munder con Node 22 (descarga Electron y dependencias; ejecuta scripts de instalación de terceros) — pendiente de OK del dueño.
- [ ] Pasos 3-7 pendientes.

## Actualización 2026-11-25 — runner propio (P5)
- Munder Difflin ya no se usa: los pasos 2b y 6-7 de arriba quedan obsoletos. `iniciar-oficina.bat` se eliminó; `CONFIGURACION-MUNDER.md` queda como referencia histórica (los prompts vivos están en `crm/config/offices/prospeccion/agents/`).
- Claude Code 2.1.332 autenticado por suscripción (`claude auth status` → `authMethod: claude.ai`): es el motor del runner. Spike completo en `spike-runner.md`.
- Motor, modelo y topes: `crm/config/engine.yaml` (engine, modelo=claude-sonnet-5-5, esfuerzo=low, agrupar_pasos, capacidades_off, timeouts).
- OpenCode v2.3.2 instalado y Gemini CLI ausente: sus adaptadores existen pero NO están verificados en vivo.
