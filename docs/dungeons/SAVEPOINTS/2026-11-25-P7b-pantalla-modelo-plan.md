# Save Point — P7b pantalla completa, modelo por paso, medidor del plan (2026-11-25)

## Estado

P7b completo. Segmentación en `03-segmentation/microsteps.yaml` (P7b_pantalla_modelo_plan, P7b-1..8), decisiones en `meta-dungeon.yaml` (decisiones_p7b), spike en `18-ai-setup/spike-limites-plan.md`, notas de la skill en `18-ai-setup/3dviz-notas.md`, evaluación de Haiku en `04-execution/consumo-tokens.md`, capturas en `04-execution/capturas-p7b/`.

## Qué hay (nuevo)

- Servidor: `runner/plan.ts` (límites, reserva, estimado, estimador), migración `004_plan.sql` (tabla `limites_plan`, `salidas_agente.modelo`, estado `pausada_reserva_plan` reconstruyendo `corridas`; `migrate()` apaga foreign_keys mientras migra), `claude.ts` lee `unifiedWindows`, `base.ts` guarda límites y revisa la reserva antes de cada llamada, rutas `GET /api/plan`, `GET /api/corridas/estimado`, `POST /api/corridas` con `confirmado`, `reanudar` ignora la reserva.
- Modelo por paso: `modelo` opcional en cada paso de `workflow.json` (enum haiku/sonnet/opus/fable), respaldo `modelo:` de `engine.yaml`. Hoy NINGÚN paso lo fija (todo Sonnet).
- UI: `PlanMedidor` (barra lateral y Corrida), pestaña Configuración > «Plan y reserva» (`ConfPlan.tsx`), estimador y confirmación en Corrida, estado «Pausada: reserva del plan», modelo visible en Prompts > «Prompt final compuesto».
- 3D: `PantallaCompleta.tsx` (Fullscreen API, F, controles mínimos), `Perimetro.tsx` (paredes con ventanas y corte dinámico), selector «Vista» (encuadre por área), rótulos de tamaño constante, nombres siempre visibles, burbujas descriptivas, puestos de la fila norte mirando al sur.
- Pruebas: `test/p7b-plan.test.ts` (12), +1 en `p7-oficina3d.test.ts`, CLI simulado con `plan`, `plan_por_agente`, `credito`; humo 3D ampliado (pantalla completa, F, salir): 14/14 OK. `p5-live.test.ts` acepta `LIVE_ETIQUETA` y `LIVE_HAIKU` y guarda el estado de la corrida en `data/live-<etiqueta>.txt|json`.

## Gates (final)

tsc 0 · eslint --max-warnings 0 limpio · prettier OK · vitest 137 pasan (+2 skipped LIVE) · vite build OK (chunk 3D 300 kB gzip; principal 142 kB gzip) · npm audit 0 · depcheck limpio · madge sin ciclos · react-doctor 0 errores, 24 advertencias (score 73; sin nuevas, igual que la línea base) · archivos <= 300 líneas · humo 3D 14/14.

## Endurecimiento de datos (incidente «los datos desaparecieron»)

Causa: un servidor DEMO de P7a quedó vivo en el puerto 4010 y el navegador hablaba con él (BD temporal), no con `data/crm.db` (que conservaba todo). Cambios (pruebas en `test/p7b-datos.test.ts`, 7):

1. Demo y humo usan el puerto 4099 (la demo rechaza 4010 y rechaza `crm.db`), se cierran con SIGINT/SIGTERM; una prueba verifica que ningún test apunte a `data/crm.db` ni al puerto 4010.
2. `src/server/arranque.ts`: puerto ocupado = «Puerto N ocupado: otro proceso lo usa», salida 1; `iniciar-crm.bat` lo detecta con netstat y no abre el navegador.
3. `/api/estado` trae `base_datos {ruta, modo}`; Configuración muestra la ruta y el modo; aviso naranja en la barra lateral si es demo (solo el servidor real fija `dbModo: 'real'`). Rutas resueltas desde la raíz `crm` (no el cwd) y logueadas al arrancar.
4. `migrate()`: respaldo `VACUUM INTO` a `data/backups/crm-pre-<migración>-<fecha>.db` (checkpoint WAL, últimos 5), cada migración en transacción con `foreign_keys` OFF fuera de ella y `foreign_key_check` dentro (revierte y avisa el respaldo si falla). Pruebas con BD de archivo con datos antes/después y una migración defectuosa.
5. Prueba de persistencia: datos creados por la API sobreviven a cerrar y reabrir; cierre limpio (checkpoint + close) en SIGINT/SIGTERM del servidor.
6. `data/runner/`, `data/runner-test/` y `data/agent.token` fuera del índice de git y en `.gitignore`.
   Limitación: el cierre limpio por señal no se probó con un proceso real en Windows (Ctrl+C en consola sí dispara SIGINT; terminar el proceso a la fuerza no). Al cierre, el puerto 4010 estaba libre (la demo que lancé en P7b la cerré yo con Stop-Process antes de recibir la indicación de no hacerlo; el servidor demo de P7a que reportó el coordinador ya no escuchaba).

## Qué datos de límites expone el CLI (resumen)

`rate_limit_event.rate_limit_info.unifiedWindows.{five_hour,seven_day}` con `utilization` (0..1), `resetsAt` y `status`. `claude auth status` solo da cuenta/plan. `/usage` no funciona en `-p` (lo manda al modelo). `total_cost_usd` es costo de lista, no % del plan.

## Haiku vs Sonnet (resumen; detalle en consumo-tokens.md)

3 corridas LIVE, 165,787 tokens ponderados en total. Haiku: QA-1 degradó (bloqueó el flujo exigiendo entregables de pasos posteriores), Guardián divergió (descartó donde Sonnet filtró), Calificador+Redactor NO se evaluó (el flujo no llegó). Todo sigue en Sonnet.

## No verificado

- Calificador+Redactor con Haiku (cero evidencia). Motivo del descarte del Guardián Haiku (no se guardó; el harness ya lo registra).
- La comparación de tokens Haiku/Sonnet no es concluyente (la caché cambia el ponderado entre corridas y el ponderado no pesa por modelo); el delta de `utilization` está contaminado por la sesión de Claude del orquestador.
- Reserva/estimado solo con CLI simulado; el CLI real nunca llegó a la reserva por defecto (el uso real estuvo en 29-48 %). El estado `rejected` real del plan (límite alcanzado) tampoco se provocó.
- Un `removeChild` de página apareció UNA vez en una captura combinada (calidad Baja + noche + giro) y no se pudo reproducir en 5 reintentos; posible carrera del portal de `Html` de drei al cambiar la calidad.
- Pantalla completa solo probada en Edge headless (Chrome/Firefox y Safari no).
- El `descartada_motivo` del Guardián, cruces de caminantes en el pasillo y el Personalizador UI siguen pendientes.

## Qué debe hacer el dueño

1. Abrir el CRM, correr una vez (1-3 empresas) y mirar el medidor: debe mostrar % de 5 h y semanal. Si dice «sin datos» tras una corrida, avisar.
2. Ajustar la reserva en Configuración > Plan y reserva (70 % por defecto) según cuánto uso quiera reservar para su otro trabajo.
3. Mantener Sonnet. Si quiere intentar ahorrar con Haiku, probar primero Calificador+Redactor (instrucciones en consumo-tokens.md).
4. Revisar la oficina en pantalla completa en su navegador habitual (tecla F).

## Prompt de reanudación

"Retoma ACITMX Prospecting Office tras P7b. Lee docs/dungeons/SAVEPOINTS/2026-11-25-P7b-pantalla-modelo-plan.md, 00-meta-dungeon/meta-dungeon.yaml (decisiones_p7a y decisiones_p7b) y 00-meta-dungeon/p6-p8-oficina-3d-spec.md. Pendientes: Personalizador UI (persistir `apariencia` por office_id), evaluar Haiku en Calificador+Redactor (con Guardián en Sonnet), cruces de caminantes, P6.5 Aprendizaje. Verifica cada cambio visual con tools/pw-shot/shot.mjs y test/p7-humo-3d.mjs contra test/p7-demo-servidor.ts (BD temporal). Gates obligatorios: tsc, eslint --max-warnings 0, prettier, vitest, build, audit, depcheck, madge, react-doctor."
