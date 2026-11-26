# Save Point P9-personalizador (2026-11-26)

Commits: 0d7ab46, 9841484, ff25b66, 9424ca9 (+ docs). Sin push.

## Hecho
Esquema ampliado, composición por capas, migración 007 (apariencias/presets con versiones y rollback), API del dueño, presets import/export, aleatorio con semilla y paridad, copia al duplicar piso, escena con apariencias (luz por sala, marca blanca, fachada), UI Personalizar (3 pestañas, vista previa 3D, plano numérico, equipo, versiones).

## Gates
tsc 0, eslint 0 warnings, vitest 212 ok/2 skipped, vite build ok, npm audit 0, depcheck ok, madge sin ciclos, react-doctor 0 críticos/altos (sin warnings nuevos de bugs; quedan avisos de estilo, p. ej. prefer-html-dialog en Dialogos.tsx), archivos <=300 líneas. Prettier ok salvo `.depcheckrc.json` (preexistente).
Humo 3D real (Edge headless, puerto 4099, BD temporal): crm/test/p9-humo-personalizar.mjs, todo OK. Capturas: docs/dungeons/04-execution/capturas-p9/.

## No verificado
Migración 007 sobre la BD REAL (no se tocó; probada con BD temporal con datos previos); corridas con Claude real; solo Edge headless.

## Pendiente / mejoras
Arrastrar/soltar y rotación 90° de salas; Constructor de oficinas.

## Prompt de reanudación
Lee este Save Point y meta-dungeon.yaml (decisiones_p9). P9 completo. Siguiente: Constructor de oficinas (según p6-p8-oficina-3d-spec.md). Puerto 4010 es el CRM real: usa 4099 y BD temporal (test/p7-demo-servidor.ts). Commits con trailer Co-Authored-By Claude Sonnet 5.5, sin push.
