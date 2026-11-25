# Consumo de tokens del runner — medición y reducciones (P6-F)

Motor: Claude Code, `claude-sonnet-5-5`, `--effort low`, plan Pro. Prueba LIVE = 1 empresa sembrada, sin Places, correo falso (`LIVE=1 npx vitest run test/p5-live.test.ts`). El resultado se guarda en `crm/data/live-last.txt`.

## Cómo se mide
`salidas_agente` guarda por paso: `tokens_brutos` (suma de todo lo que reporta el CLI, **incluida la caché leída en cada turno**), `tokens_estimados` (ponderado por costo: entrada + salida + 1.25 x caché escrita + 0.1 x caché leída), `prompt_tokens` (tamaño del prompt de la oficina), `turnos` y las herramientas usadas. La pantalla **Salidas** y `GET /api/salidas-resumen` muestran el consumo por agente.

Por qué «283 k tokens» era engañoso: la cifra bruta cuenta el contexto completo en cada turno (un paso de 6 turnos cuenta su prefijo 6 veces) aunque casi todo es lectura de caché, que pesa ~10 % del costo. El número útil para el plan es el ponderado.

## Resultados (1 empresa, 9 llamadas al CLI)
| Medición | Base P5 | + system prompt propio y topes | + sin `crm_actividad` |
|---|---|---|---|
| Tokens brutos | 282,729 | 214,242 | 207,874 (-26 % vs base) |
| Tokens ponderados | (no medido) | 98,658 | 91,768 |
| Turnos del CLI (7 llamadas) | (no medido) | 39 | 32 |
| Tiempo | 103 s | 91 s | 90 s |

Nota: las 3 corridas son de 1 empresa y el consumo varía entre corridas (el Rastreador depende de cuántas páginas lee), así que la diferencia entre las dos últimas columnas está dentro del ruido; el ahorro de turnos sí es estructural.

Mayor gasto: Rastreador (≈ 18.5 k ponderados; 2 lecturas web + 3 contactos), Analista (≈ 14 k), QA-1 y QA-2 (≈ 12-13 k cada uno), Guardián (≈ 7.6 k). Estratega+Armador y Calificador+Redactor (agrupados) cuestan 5.7 y 7.1 k juntos.

## Reducciones aplicadas
1. **System prompt propio** (`--system-prompt` en vez de `--append-system-prompt`, `prompt_modo: reemplazar` en `engine.yaml`): medido con una llamada trivial, 3,262 → 664 tokens de entrada base (-2.6 k por llamada y por turno de caché). Si el modelo se comportara peor, `prompt_modo: agregar` lo revierte.
2. **Sin `crm_actividad` obligatorio**: el sistema ya registra la actividad (eventos del runner y de cada guardado). Ahorra 1 turno por llamada (39 → 32 turnos en la prueba).
3. **Topes de lectura web** por llamada (`max_lecturas` en el workflow: Rastreador 8, Explorador 10, Analista 4, Guardián 3) y texto devuelto por página recortado a 3,500 caracteres (la página completa queda en la caché local de 7 días).
4. **Expediente por secciones y recortado**: `crm_expediente` acepta `secciones` y recorta resumen/justificación/reporte/borrador largos.
5. **Biblioteca por fragmentos**: `kb_buscar` devuelve máximo 5 fragmentos de ≤ 420 caracteres y ≤ 1,500 en total; `kb_leer` entrega tramos de 2,500 caracteres.
6. **Prompt de ahorro** en el bloque global (pide pocas lecturas, secciones mínimas y respuesta de una línea).
7. Ya existentes desde P5: agrupación de pasos, Guardián en lote, caché de páginas, herramientas mínimas por agente, `--effort low`, `--max-turns`.

## Pendiente / ideas no aplicadas
- Los agentes **no usaron** `kb_buscar` en la prueba (los prompts ya traen lo esencial); el ahorro de la Biblioteca se verá al editarla y al mover contenido largo de los prompts a documentos.
- Reducir el costo fijo por turno (esquemas de las herramientas MCP ≈ 3 k tokens): acortar descripciones o dividir herramientas por rol.
- Pre-inyectar el expediente en el mensaje ahorraría 1 turno por paso pero contradice «mensajes solo con ids»; se deja como decisión del dueño.
- Estimador de consumo por corrida (pasos x tokens medios con aviso): P6.5.

---

# P7b — modelo por paso, evaluación de Haiku y medidor del plan (2026-11-25)

## Modelo por paso (cómo se configura)
- Valor por defecto: `modelo:` en `crm/config/engine.yaml` (hoy `claude-sonnet-5-5`).
- Por paso: campo opcional `"modelo"` en `crm/config/offices/<oficina>/workflow.json` (dentro de cada paso de `pasos`). Valores válidos (verificados con el CLI real, ver `18-ai-setup/spike-limites-plan.md`): `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`; `claude-fable-5-2` está permitido por el esquema pero en este plan Pro la API exige créditos de uso (no funciona). Otro nombre = el servidor no arranca.
- La pantalla Prompts > «Prompt final compuesto» muestra el modelo efectivo de cada paso (solo lectura; se edita en el archivo). `salidas_agente.modelo` guarda el modelo de cada llamada.
- Solo aplica a `claude-code` (los otros motores usan el `modelo` global).

## Evaluación de Haiku: 3 corridas LIVE (1 empresa sembrada «ACIT México (empresa de prueba)», sin Places, correo falso)
Mismo código y misma empresa en las tres. Se guardó el estado completo de cada corrida en `crm/data/live-r*.txt|json` (ignorado por git).

| Corrida | Modelos | Resultado | Ponderados | Brutos |
|---|---|---|---|---|
| R1 control | todo Sonnet | Reportado (score 50, nivel B). QA-2 devolvió una vez a Calificador (score 45 vs desglose 50: error real que Sonnet atrapó) y aprobó la segunda | 97,292 (12 filas, 116 s) | 267,959 |
| R2 | Guardián Haiku + Calificador/Redactor Haiku | El Guardián Haiku DESCARTÓ la empresa (Sonnet la había aceptado) → corrida terminó en 1 paso. Calificador/Redactor nunca se ejecutaron | 7,719 | 14,274 |
| R3 | Calificador/Redactor, QA-1 y QA-2 Haiku (resto Sonnet) | QA-1 Haiku devolvió 3 veces al Analista exigiendo score, reporte y borrador (que todavía no existen en esa etapa: los produce el paso siguiente) → circuit de devoluciones → «Revisión humana». Calificador/Redactor nunca se ejecutaron | 60,776 (10 filas, 105 s) | 237,142 |

### Calidad
- **Guardián en lote (Haiku)**: divergió del control (descartó donde Sonnet filtró). Con una sola muestra no se sabe quién tuvo razón (la empresa de prueba es la propia ACIT; descartarla es defendible), pero un filtro que descarta distinto sin motivo guardado no se puede aprobar. Se añadió `etapa` y `descartada_motivo` al informe de la prueba LIVE para la próxima vez.
- **QA-1 (Haiku)**: DEGRADÓ. Aplicó mal el criterio de la etapa (pidió entregables de pasos posteriores) y bloqueó el flujo. QA se queda en Sonnet (como pedía el encargo).
- **Calificador + Redactor (Haiku)**: NO EVALUADO. En R2 no llegó (el Guardián descartó) y en R3 no llegó (QA-1 bloqueó). Con el tope de 3 corridas LIVE no hubo oportunidad de repetir. No hay evidencia de calidad ni de reporte sin precios para Haiku.
- Reglas de reporte (sin precios, fuentes): solo se pudo revisar el reporte de R1 (Sonnet): cumple (sin montos, con URL de fuente).

### Tokens (por qué la comparación de tokens NO es concluyente)
- Los tokens ponderados dependen de la caché: el mismo paso Sonnet costó 15.6 k ponderados en R1 y 6.2 k en R3 (Rastreador, mismas 8 vueltas y 52 k brutos) solo porque en R3 la caché del prompt ya estaba caliente. R2/R3 corrieron minutos después de R1.
- Además «token ponderado» no pesa por modelo: un token de Haiku consume menos plan que uno de Sonnet, y esa proporción no la publica el CLI. La medición correcta es el cambio de `utilization` de la ventana de 5 h, pero en estas corridas está contaminada por el uso de la propia sesión de Claude del orquestador: 0.29 → 0.45 (R1) → 0.46 (R2) → 0.48 (R3). No se puede atribuir.
- Consumo total de la evaluación: 165,787 tokens ponderados en las 3 corridas (+ ~11 llamadas de spike triviales).

### Decisión
**Ningún paso queda en Haiku por defecto**: ninguno demostró no degradar la calidad. Todo sigue en `claude-sonnet-5-5` (Rastreador, Analista, QA-1 y QA-2 también, como se pidió). El mecanismo queda listo: para probar Haiku en un paso, añade `"modelo": "claude-haiku-5-5"` a ese paso en `workflow.json` y corre una empresa con `LIVE=1 LIVE_ETIQUETA=prueba LIVE_HAIKU=calificador_redactor npx vitest run test/p5-live.test.ts` (los pasos de `LIVE_HAIKU` se ponen en Haiku solo para esa prueba). Candidato pendiente con mejor relación riesgo/beneficio: **Calificador + Redactor**, probándolo con el Guardián en Sonnet para que la corrida sí llegue a ese paso.

## Medidor del plan y reserva (qué cambia para el consumo)
- La reserva (default 70 % de la ventana de 5 h, 90 % semanal) pausa la corrida ANTES de la siguiente llamada, no a mitad de un paso.
- El estimador previo (`GET /api/corridas/estimado`) usa el promedio por empresa de las últimas 5 corridas (`salidas_agente`) y, sin historial, la referencia medida en P6 (95,000 ponderados por empresa). Sobre 600,000 (editable) pide confirmación: con la referencia, 7 o más empresas la piden.
