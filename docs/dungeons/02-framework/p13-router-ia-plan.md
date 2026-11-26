# P13 — Ruteador inteligente de IA (planeación)

Estado: **PLANEADO, sin código.** Se ejecuta cuando haya créditos de Claude (ver «Disciplina de créditos»). Metodología: Master Dungeons, capas 17 → 02 → 03; ejecución en la 04 con gates por paso.

## 1. Objetivo (pedido del dueño)
1. Claude sigue siendo el proveedor principal.
2. Proveedores adicionales: **OpenCode con DeepSeek Flash**, **Gemini**, **OpenAI**.
3. Al agotarse Claude: cambio automático a Gemini u OpenCode (orden configurable). Al agotarse esos: ruteo **entre cuentas**.
4. **Por oficina**, desde el frontend: elegir proveedor, cuenta y modelo principal (p. ej. oficina A = Claude Haiku, B = Claude Sonnet, C = Gemini) y su cadena de respaldo.

## 2. Estado actual (base sobre la que se construye)
- `runner/motor.ts`: `crearEjecutor(cfg, ctx)` devuelve **un** adaptador por `engine` global (`engine.yaml`). Adaptadores `claude.ts` (verificado en vivo) y `alternos.ts` (OpenCode y Gemini: **solo argumentos probados con CLI simulado, nunca en vivo**). No existe adaptador de OpenAI.
- Contrato común ya apto para ruteo: `EjecutarAgenteFn → ResultadoAgente {ok, salida, limite_plan?, reset_en?, requiere_creditos?, plan?}`.
- `modelo` por paso en `workflow.json`; global en `engine.yaml`. No hay motor/cuenta por oficina.
- Medidor de plan (`runner/plan.ts`) es **específico de Claude** (`rate_limit_event`: five_hour / seven_day) con reserva y estado `pausada_reserva_plan`. Cola global: una llamada de IA a la vez en todo el edificio.
- Los agentes dependen de: bucle de agente + herramientas MCP del CRM + (algunos) búsqueda web. Solo los **CLI de agente** dan eso sin reescribir el runner.

## 3. Decisiones de diseño propuestas
**D1. Proveedor = CLI de agente.** `claude-code`, `opencode`, `gemini` (Gemini CLI), `openai` (Codex CLI). No se reimplementa el bucle de herramientas sobre APIs HTTP. *Atajo posible:* OpenCode puede hablar con DeepSeek, OpenAI y Gemini por API key; si el spike muestra que los CLI propios fallan con MCP, OpenCode sirve de puerta única.

**D2. Cuenta** = credencial/perfil de un proveedor. Claude: un `CLAUDE_CONFIG_DIR` por cuenta (el dueño hace `claude auth login` en cada uno). Gemini/OpenAI/DeepSeek: API key en `.env` (o archivo local no versionado). La BD guarda solo metadatos y el *nombre* de la variable; **nunca** la llave, ni se muestra, ni llega a un agente.

**D3. Perfil de motor por oficina** = lista ordenada de `{cuenta, modelo, esfuerzo}`; el primero es el principal, el resto, respaldo. Una oficina sin perfil hereda el global (hoy `engine.yaml`), así nada existente cambia.

**D4. Ruteador** (`runner/router.ts`) envuelve `EjecutarAgenteFn`. Por llamada: toma los candidatos de la oficina → descarta los agotados (`motor_estado.agotado_hasta > ahora`) → ejecuta → clasifica el resultado:
- `limite_plan` / `requiere_creditos` / 429 / saldo → marca ese candidato agotado hasta `reset_en` (o cooldown por defecto) y **reintenta el mismo paso con el siguiente**.
- error de autenticación → marca la cuenta «requiere atención» (no se reintenta sola) y sigue.
- fallo transitorio (timeout/5xx) → un reintento en el mismo candidato, luego el siguiente.
- sin candidatos → se usa la pausa existente (`pausada_reserva_plan`) con el reset más cercano.
- **Recuperación:** en cada llamada se vuelve a probar en orden de prioridad, así el principal retoma apenas pasa su reset.
Los pasos ya son verificables por SQL (`verifica`) y los MCP son idempotentes en lo esencial, por lo que reintentar un paso en otro proveedor es seguro.

**D5. Calidad por rol, no solo disponibilidad.** Haiku ya se descartó por degradar calidad. Cada candidato lleva un nivel (`aprobado` / `solo_apoyo`) obtenido con una evaluación sobre los casos dorados (`services/evaluacion.ts`). Roles críticos (QA-1, QA-2, Calificador) solo se rutean a candidatos `aprobado`; si no hay, la corrida **pausa** en vez de degradar la calidad.

**D6. Dinero y privacidad.** Los respaldos de pago (OpenAI, DeepSeek por API) son **opt-in por proveedor**, con **tope mensual en USD** (se detiene al llegar). Gemini en capa gratuita y Claude Pro no cuestan por llamada. Aviso visible: los datos del prospecto salen a terceros al usar respaldos.

**D7. Medidor generalizado.** `consumo_motor` registra por llamada proveedor/cuenta/modelo/tokens/costo estimado. Claude conserva su medidor real (`rate_limit_event`); los demás usan tope configurado + señales 429. La reserva (70 %/90 %) aplica por cuenta.

**D8. Registro.** Cada salida guarda proveedor/cuenta/modelo; evento `motor_cambio` en la Actividad y en el panel de Corrida («Claude agotado → Gemini hasta 15:40»).

## 4. Modelo de datos (migración 012, aditiva)
- `motor_cuentas(id, proveedor, nombre, estado[activa|requiere_atencion|desactivada], config_json, secreto_ref, permite_pago, tope_mensual_usd, creado_en)`
- `motor_oficina(office_id, orden, cuenta_id, modelo, esfuerzo, UNIQUE(office_id, orden))`
- `motor_estado(cuenta_id, modelo, agotado_hasta, motivo, actualizado_en, PRIMARY KEY(cuenta_id, modelo))`
- `consumo_motor(id, ts, office_id, cuenta_id, modelo, tokens_in, tokens_out, costo_usd_est, ok)`
- Salidas de agente: columnas `proveedor`, `cuenta_id`.
- Respaldo automático previo y `foreign_key_check` (mecanismo existente). Los paquetes de oficina exportan el perfil **sin** cuentas ni llaves.

## 5. Frontend
- **Configuración → Motor de IA:** cuentas por proveedor (alta, probar conexión, estado, consumo/tope, activar pago), sin mostrar llaves; guía de pasos manuales.
- **Por oficina** (Edificio/Piso → pestaña «Motor»): principal + respaldos con orden, modelo por proveedor, esfuerzo, «probar», presets (p. ej. «Económico Haiku», «Equilibrado Sonnet», «Gemini»). Aviso si un rol crítico queda sin candidato aprobado.
- **Corrida/medidor:** insignia «sirviendo: proveedor · cuenta · modelo», lista de agotados con hora de recuperación, historial de cambios.
- El Constructor de oficinas ofrece el preset al crear un piso.

## 6. Micro-pasos (P13)
| Paso | Contenido | Gate |
|---|---|---|
| P13-1 Spike en vivo | Probar OpenCode+DeepSeek Flash, Gemini CLI y Codex CLI con el MCP del CRM y un caso dorado corto; medir tokens, calidad y forma de errores/límites. Doc `18-ai-setup/spike-proveedores.md` | Decide D1 y qué proveedores pasan |
| P13-2 Datos y cuentas | Migración 012, servicio de cuentas/perfiles, manejo de secretos, API del dueño, pruebas | tests + migración con datos |
| P13-3 Núcleo del ruteador | `router.ts` puro con adaptadores falsos: orden, cooldown, recuperación, pausa total, roles críticos, idempotencia del reintento | tests unitarios exhaustivos |
| P13-4 Adaptadores | Endurecer OpenCode/Gemini, nuevo adaptador OpenAI, clasificador de errores por proveedor con fixtures reales del spike | CLI simulado + 1 llamada real por proveedor |
| P13-5 Medidor, topes y reserva | Generalizar `plan.ts`, topes USD, `consumo_motor`, eventos | tests |
| P13-6 Integración en el runner | `crearEjecutor` usa el perfil de la oficina; hereda el global si no hay; salidas con proveedor | regresión de las 300 pruebas |
| P13-7 UI | Pantallas de §5, humo de UI en 4099 con capturas | humo + react-doctor 0 critical |
| P13-8 Calidad por proveedor | Evaluación por casos dorados y nivel `aprobado/solo_apoyo` | evidencia por proveedor |
| P13-9 Cierre | `PASOS-MANUALES-PROVEEDORES.md`, Quality Gate, pre-deploy, Save Point | gates |

## 7. Riesgos
- **Términos de uso:** rutear entre varias cuentas del mismo proveedor para esquivar límites puede violarlos. Confirmar que son cuentas propias/autorizadas y revisar los términos antes de P13-4. Gemini/OpenAI por API de proyectos propios no tiene ese problema.
- **Adaptadores no verificados:** hoy solo Claude está probado en vivo; por eso el spike va primero.
- **Calidad dispar:** mitigada por D5 (pausar antes que degradar).
- **Costo inesperado:** D6 (opt-in + tope USD).
- **Datos a terceros:** aviso + solo respaldos habilitados por el dueño.

## 8. Disciplina de créditos
Todo en **Sonnet** (nunca Opus salvo necesidad), pasos pequeños, el spike P13-1 con el mínimo de llamadas reales y el resto verificado con CLI simulado. Empezar por P13-1 y P13-3 (mayor valor, menor consumo).

## 9. Decisiones que necesito del dueño antes de P13-1
1. **OpenAI:** ¿con ChatGPT/Codex CLI (login) o con API key (pago por uso)?
2. **DeepSeek Flash vía OpenCode:** ¿con qué proveedor/llave (OpenCode Zen, OpenRouter, API de DeepSeek)?
3. **Gemini:** ¿capa gratuita o con facturación? ¿CLI o API key?
4. **Claude multi-cuenta:** ¿cuántas cuentas y son propias/autorizadas para este uso?
5. **Respaldos de pago:** ¿permitidos? Tope mensual USD sugerido.
6. **Orden de respaldo por defecto** (propuesta: Claude → Gemini → OpenCode/DeepSeek → OpenAI).
