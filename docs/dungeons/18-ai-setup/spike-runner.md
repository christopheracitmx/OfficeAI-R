# Spike P5-1 — CLI headless como motor del runner (2026-11-25)

Objetivo: lanzar UN agente con el CLI del motor activo, usando la suscripción (sin API key de pago), contra el MCP `acitmx-crm`, y saber exactamente cómo leer su resultado y detectar límites.

Versión probada: **Claude Code 2.1.332**, autenticado por `claude.ai` (`claude auth status` → `loggedIn: true, authMethod: claude.ai`). OpenCode v2.3.2 instalado (sin probar en vivo). Gemini CLI no instalado.

## Receta verificada (funciona)

```
claude -p --output-format stream-json --verbose
  --mcp-config <archivo.json> --strict-mcp-config
  --append-system-prompt "<prompt>"
  --allowedTools mcp__acitmx-crm__crm_corrida_actual [WebSearch ...]
  --tools "" | WebSearch          (herramientas BUILT-IN disponibles; "" = ninguna)
  --permission-mode dontAsk       (lo no permitido se niega, jamás pregunta)
  --max-turns N
  --no-session-persistence --disable-slash-commands --setting-sources ""
  < mensaje por stdin
```

Notas medidas, no supuestas:

| Tema | Hallazgo |
|---|---|
| Autenticación | Usa la sesión de la suscripción (OAuth del CLI). NO usar `--bare` (solo acepta ANTHROPIC_API_KEY). |
| Mensaje | Por **stdin**. `--allowedTools`/`--tools`/`--mcp-config` son variádicos y se tragan un prompt posicional. Sin stdin redirigido el CLI espera 3 s y avisa. |
| MCP | `--mcp-config` + `--strict-mcp-config` carga SOLO nuestro servidor (sin conectores claude.ai ni plugins). Herramienta aparece como `mcp__acitmx-crm__<tool>`. |
| Rutas Windows en el JSON | Se lanzan con shell: las rutas con espacios necesitan JSON bien escapado (`\\`) o `/`. Una ruta con `\U` sin escapar rompió el arranque (`CONNECTION_CLOSED`). El runner genera el JSON por código. |
| Contexto base | Por defecto (todas las skills/herramientas/slash commands) ~27 k tokens por llamada. Con `--disable-slash-commands --setting-sources "" --tools ... --strict-mcp-config` baja a ~9 k. Cada paso es una llamada nueva: es el costo fijo por paso. |
| Permisos | `--permission-mode dontAsk` + `--allowedTools` explícito: el MCP corre sin prompts y lo demás se niega. Resultado de la herramienta trae `permission_decision: accept` por regla. |
| `--max-turns` | Funciona aunque no aparece en `--help`. Al excederlo: `result.subtype = "error_max_turns"`, `terminal_reason = "max_turns"`, `is_error: true`, **exit code 1**. |
| Salida | NDJSON (una línea JSON por evento): `system/init` (lista de tools y estado de cada MCP: `status: "failed"` si el MCP no arrancó), `assistant` (bloques `text` y `tool_use`), `user` (`tool_result`), `rate_limit_event`, y al final `result`. |
| `result` | `{type:"result", subtype:"success"\|"error_max_turns"\|"error_during_execution", is_error, result:"<texto final>", num_turns, total_cost_usd, api_error_status, terminal_reason, usage}`. `total_cost_usd` es costo de lista (referencia), no se cobra con suscripción. |
| `rate_limit_event` | Llega varias veces por llamada: `rate_limit_info.status` (`allowed` en la prueba), `rateLimitType` (`five_hour`/`seven_day`), `resetsAt` (epoch s) y `unifiedWindows.<ventana>.utilization` (0–1). Uso observado durante el spike: 5 h = 0.32→0.34 por llamada pequeña. |
| Exit codes | `0` éxito; `1` cualquier error (incluye max-turns y límite de plan). El código no distingue causas: hay que leer el `result`. |

## Detección de límite de plan (diseño; no se pudo provocar uno real)

El límite no se puede forzar sin gastar el plan, así que la detección es defensiva y está probada con CLI simulado. Se considera límite de plan si ocurre CUALQUIERA:

1. un `rate_limit_event` con `status` distinto de `allowed`/`allowed_warning` (p. ej. `rejected`);
2. `result.is_error` con `api_error_status` 429;
3. `result.is_error` cuyo texto coincide con `/usage limit|limit reached|rate.?limit|too many requests|out of (extra )?usage|quota/i`.

`allowed_warning` NO detiene (solo se registra la utilización). Errores transitorios (529 overloaded, red) NO son límite: cuentan como fallo del paso para el circuit breaker.

## Otros motores (adaptadores sin verificación en vivo)

- **OpenCode** (v2.3.2): `opencode run --format json --auto "<mensaje>"`; no tiene flag de system prompt (se antepone al mensaje); MCP por `OPENCODE_CONFIG_CONTENT` (`mcp.<nombre> = {type:"local", command:[...], environment:{...}}`). Solo se probó la construcción de argumentos.
- **Gemini CLI**: no instalado. `gemini -p "<mensaje>" --output-format json --yolo`, MCP por `.gemini/settings.json` en el cwd de la corrida y system prompt por `GEMINI_SYSTEM_MD`. Solo construcción de argumentos.
Ambos detectan límite por texto (`rate limit`, `quota`, `429`, `resource exhausted`) y quedan marcados `verificado: false`.

## Decisiones derivadas

- Aislamiento: el agente corre con cwd en una carpeta vacía propia (`data/runner/`), sin herramientas de archivos ni shell: solo MCP del CRM y, según el agente, `WebSearch`.
- Mínimo privilegio verificable en el MCP: variable `CRM_TOOLS` hace que el servidor MCP registre solo las herramientas del agente (además de `--allowedTools`). Esto también reduce tokens y sirve igual en los otros motores.
- Hueco detectado en el diseño Munder: los agentes de revisión/redacción no tenían cómo LEER el expediente. Se agrega la herramienta `crm_expediente(empresa_id)`.
- Los resultados se verifican contra la BASE DE DATOS (etapa, prospecto, QA), no contra el texto del agente.
