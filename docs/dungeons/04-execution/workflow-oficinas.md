# Oficinas y workflows (P5) — cómo se define una oficina

Una **oficina** es una carpeta `crm/config/offices/<office_id>/`:

```
office.json        nombre, descripción
workflow.json      el flujo (datos, validado con zod al arrancar)
agents/_comun.md   bloque común de prompts
agents/<rol>.md    un prompt por rol
```

Código propio de la oficina (solo si hace falta): `crm/src/server/offices/<office_id>.ts` con sus **candados** (texto fijo que se añade al final de cada prompt) y sus **ganchos** (funciones con nombre que el workflow invoca, p. ej. `finalizar_prospecto`). `src/server/offices/index.ts` carga toda carpeta con `workflow.json`.

## Motor genérico (`crm/src/server/runner`)

No conoce prospectos ni empresas. Interpreta el workflow y:
- lanza cada paso con el motor (`ejecutarAgente`), con herramientas MCP mínimas (`CRM_TOOLS`) y mensajes cortos con ids;
- **verifica contra la base** (consultas SQL de solo lectura del workflow) y reintenta una vez;
- aplica topes, timeout por paso, circuit breaker, pausa por límite de plan/cuota, detener (mata el árbol de procesos);
- escribe eventos (`actividad_agentes`, con `office_id`) y `salidas_agente`.

## Estructura de `workflow.json`

| Campo | Significado |
|---|---|
| `office_id`, `titulo`, `coordinador`, `entidad_item` | identidad; `entidad_item` es el nombre de entidad con que se enlazan los eventos |
| `tope_items` | parámetro de la corrida que limita los elementos (se usa como `:meta`) |
| `topes` | `pasos_por_item`, `pasos_extra`, `max_repeticiones_paso` (circuit breaker de bucles) |
| `capacidades` | servicios externos apagables: `{nombre: {env: VARIABLE}}`; apagada = la variable se vacía para los agentes y las fuentes que la `requiere` se omiten |
| `variables` | SQL escalar → variables de plantilla (`{prospecto_id}`) |
| `mensajes.item` | plantilla del mensaje; `[ ... ]` se descarta si una variable interna queda vacía |
| `resultados` | resultados posibles por elemento (`incompleta` es obligatorio) con su etiqueta |
| `progreso` | contadores para la UI (SQL con `:corrida`) |
| `pasos` | `agente` (CRM_AGENT), `roles` (visibles en "Ver oficina"), `prompts`, `herramientas`, `web`, `max_turnos` |
| `fases` | secuencia: `descubrir` (fuentes con rondas, capacidad requerida y consulta de cuota agotada), `lote` (un paso para todos los pendientes), `por_item` |

`por_item`: `items` (SQL → id, nombre), `terminales` (SQL → resultado; se evalúan antes de cada nodo), `flujo` = nodos:
- `paso`: `si` (SQL), `tarea`, `verifica` (SQL verdadero) o `aumenta` (SQL numérico que debe subir), `falta` (texto para el reintento), `pasa_salida`, `sin_agrupar` (variante cuando `agrupar_pasos: false`);
- `ciclo` (revisión con devoluciones): `devolucion.consulta` devuelve `(id, pendiente, origen, destino, motivos)`; `mapa` traduce el destino libre a un paso; `defecto` por origen; `etapas` en orden con su `si`; `cierre.gancho`. El máximo de devoluciones lo aplican las herramientas/servidor de la oficina (en prospección: a la 3ª pasa a Revisión humana) y se refleja en un `terminal`.

Parámetros SQL con nombre: `:corrida`, `:meta`, `:item`.

## Crear otra oficina (ej. "noticias")

1. Copiar `config/offices/prospeccion/` a `config/offices/noticias/` y editar `workflow.json`, `office.json` y `agents/*.md`.
2. Sus herramientas MCP (si necesita nuevas) se registran en `src/mcp/` y se listan en `herramientas` de cada paso.
3. Si necesita cierre en código: `src/server/offices/noticias.ts` (gancho + candados) y registrarlo en `offices/index.ts`.
4. Iniciar corrida con `office_id: "noticias"` (`POST /api/corridas`).

## Cerebro de la oficina (P6, hecho)
- **Prompts en tablas** (`prompt_global`, `prompts_agente`, versiones inmutables): `PromptsBd` implementa `PromptSource`; los archivos `agents/*.md` solo siembran la v1. Composición: global + rol + lecciones aprobadas + habilidades activas + contexto + candados fijos (código).
- **Biblioteca** (`kb_documentos`, `kb_versiones`, `kb_productos`) por `office_id`, sin precios, consultada por los agentes con `kb_buscar`/`kb_leer` (fragmentos con tope). La siembra de una oficina nueva va en `src/server/offices/` (hoy `semilla-prospeccion.ts`).
- **Habilidades** y asignación a agentes (`agente_habilidades`); **agentes** (`agentes`: persona, género, rol, área) listos para el 3D.
- **Salidas** por rol y consumo (`salidas_agente`), **registro de cambios** (`cambios_log`).
- Una oficina nueva con carpeta propia recibe sus prompts y agentes de forma automática en `sembrarOficina`.

Pendiente (P6.5/P7): lecciones y reflexión, desempeño, vista de edificio/pisos y 3D, parámetros de corrida por oficina en la UI (hoy el formulario es el de prospección).
