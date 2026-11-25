# Spike P7b: qué datos reales expone el CLI sobre los límites del plan

Fecha: 2026-11-25. CLI: Claude Code 2.1.332, cuenta con suscripción Pro (`claude auth status`: `subscriptionType: pro`). Todo lo de abajo se observó con llamadas reales del CLI (`claude -p --output-format stream-json --verbose`), no se supone.

## Qué SÍ expone

| Fuente | Dato | Observado |
|---|---|---|
| `rate_limit_event` (stream-json, llega varias veces por llamada) | `rate_limit_info.unifiedWindows.five_hour` y `.seven_day`: `utilization` (0..1, resolución de 1 %), `resetsAt` (epoch en segundos), `status` | Sí. Ejemplo real: `five_hour {utilization: 0.29, resetsAt: 1795662000, status: "allowed"}`, `seven_day {utilization: 0.19, resetsAt: 1796090400}` |
| mismo evento | `status` global (`allowed`, `allowed_warning`, `rejected`), `rateLimitType`, `overageStatus`, `isUsingOverage` | Sí (`allowed`; la cuenta tiene overage deshabilitado por la organización) |
| JSON `result` | `usage` (entrada, salida, caché), `modelUsage` por modelo y `total_cost_usd` | Sí, pero `total_cost_usd` es costo de LISTA (referencia), no porcentaje del plan |
| `claude auth status` | cuenta, método, `subscriptionType`, `planTier` | Sí; NO trae uso ni límites |

Lo que se emite es el uso de TODA la suscripción (también otras sesiones de Claude del dueño), no solo el de la oficina. Es justo lo que interesa para no agotar el plan, pero hay que decirlo en la UI (ya se dice).

## Qué NO expone

- `/usage` no sirve en modo headless: `claude -p "/usage"` NO ejecuta el comando local, lo manda al modelo como texto (gasta una llamada de ~35 k tokens con el prompt por defecto). No se usa.
- Antes de la primera llamada no hay dato: el porcentaje solo se conoce cuando corre un agente (o cualquier llamada `claude -p`). Por eso la UI muestra «última actualización» y, sin datos, «sin datos».
- No informa tokens restantes ni el tamaño absoluto de la ventana: solo el porcentaje. Por eso el estimador (tokens ponderados contra presupuesto del dueño) es aparte y siempre rotulado «estimado».

## Modelos aceptados por `--model` (probados con una llamada trivial cada uno)

| Modelo | Resultado |
|---|---|
| `claude-haiku-5-5` | OK |
| `claude-sonnet-5-5` | OK |
| `claude-opus-5-5` | OK |
| `claude-fable-5-2` | El CLI lo acepta pero la API responde 429 `credits_required` («Fable 5.2 requires usage credits»): en este plan Pro NO se puede usar sin comprar créditos. El `rate_limit_event` trae `status: "rejected"` con `errorCode: "credits_required"`: ya NO se confunde con el límite del plan (antes habría pausado la corrida como `pausada_limite_plan`). |
| `bogus-model` | `unrecognized_model`, exit 1 |

El esquema del workflow (`modelo` por paso) solo acepta esos cuatro nombres; cualquier otro falla al arrancar el servidor.

## Cómo se usa en la app

1. `claude.ts` lee `unifiedWindows` de cada `rate_limit_event` y lo devuelve en `ResultadoAgente.plan`.
2. `base.ts` lo guarda tras cada llamada en la tabla `limites_plan` (una fila por ventana: utilización, reinicio, estado, modelo y `actualizado_en`).
3. `plan.ts` calcula `estadoPlan` (modo `cli` | `estimado` | `sin_datos`) y `motivoReserva`. Un dato cuya ventana ya se reinició (`reinicia_en` pasado) se ignora.
4. Antes de CADA llamada el runner revisa la reserva: ventana de 5 h >= `reserva_5h_pct` (default 70) o semanal >= `reserva_semanal_pct` (default 90) → la corrida termina como `pausada_reserva_plan` y se reanuda con «Reanudar de todos modos» (esa reanudación no vuelve a pausar por reserva).
5. Si el CLI no ha informado porcentaje y el dueño fijó `presupuesto_5h_tokens`, se usa un ESTIMADO (suma de `tokens_estimados` de `salidas_agente` de las últimas 5 h / presupuesto), rotulado «estimado» y que solo cuenta lo que gasta esta app. Sin presupuesto y sin datos: no se inventa ninguna cifra.
6. API: `GET /api/plan`, `GET /api/corridas/estimado?max_empresas=N`; `POST /api/corridas` exige `confirmado: true` si el estimado supera `umbral_confirmacion_tokens` (default 600,000).
