# Capa 15 — Arquitectura de Datos (borrador v1)

Fecha: 2026-11-25. Esquema: `schema-v1.sql`.

## Principio: el CRM es la fuente de verdad; el correo es solo una alerta

Orden obligatorio al final del flujo (patrón outbox, en una transacción + paso posterior):
1. QA-2 aprueba.
2. **Guardar** todo el expediente en SQLite (`prospectos.reporte_md`, `borrador_correo`, paquetes, contactos...) y crear filas `envios_email` en `pendiente` por cada destinatario activo.
3. **Enviar** por Resend; actualizar cada fila a `enviado` o `fallido` (con error).
4. Si el correo falla, el prospecto igual existe. En el CRM aparece con insignia "Correo no enviado" y botón "Reenviar".

Consecuencias en la UI:
- El CRM muestra el reporte completo (`reporte_md`) y el borrador de correo: es el respaldo si el correo no llega.
- Bandeja "Nuevos sin ver" (`visto_por_dueno = 0`) para que nada dependa del email.
- Un fallo de Resend nunca bloquea ni pierde el guardado.

## Places solo para descubrir; el resto lo hacen los agentes (gratis)

Decisión del dueño (2026-11-25): no depender de Places para todo.
- **Places (SKU Pro, descubrimiento):** solo `place_id`, nombre y dirección (field mask mínimo). Nada de sitio web ni teléfono desde Places (esos campos podrían cambiar la solicitud a un SKU con límite gratuito mucho menor).
- **Sitio web:** el Rastreador lo busca por nombre + dirección con `web_search` del motor y el MCP de Obscura (su propio navegador). Costo en dinero: cero. Costo en plan de IA: tokens, controlados con lotes pequeños.
- **Zonas:** `municipio`, `codigo_postal`, `ciudad`, `estado_mx` y `zona` se derivan por código (regex + catálogo de alcaldías/municipios) desde la dirección de Places. Sin llamadas extra, sin IA.
- **Tope:** límite gratuito Pro 5,000/mes (Google, desde marzo 2025; no abrí la página de precios, confirmar en tu consola) - 100 = **4,900/mes**. Contador local en `places_uso`, más cuotas diarias bajas y alerta de presupuesto en Google Cloud. Cuenta en México (precios globales, no India).
- **Piloto:** solo CDMX y Estado de México (`configuracion.zonas_piloto`). El Cartógrafo rechaza zonas fuera de esa lista hasta que el dueño la amplíe en Configuración.
- **Riesgo clave: homónimos.** Buscar por nombre puede devolver el sitio de otra empresa. El Rastreador debe confirmar que el sitio coincide (dirección, teléfono o municipio en el sitio) antes de poner `sitio_verificado = 1`; QA-1 lo revisa. Sin verificación, no se guardan contactos como confiables.
- `web_search` depende del motor activo (Claude Code lo trae; OpenCode/Gemini pueden variar) y Obscura es el respaldo. El `web_search` opcional de Obscura envía consultas a un tercero (Keenable) y viene apagado: no activarlo salvo decisión del dueño.

## Directorio propio + descubrimiento multi-método ("buscaba cobre y encontré oro")

Decisión del dueño (2026-11-25): Places es solo UNA fuente. Los agentes deben actuar como una persona que investiga, y toda empresa encontrada se guarda en nuestro directorio.

**Métodos de descubrimiento** (`empresas.metodo_descubrimiento`):
| Método | Ejemplo |
|---|---|
| `places` | Búsqueda por giro y alcaldía/municipio (cuota limitada) |
| `nicho_web` | web_search de nichos afines al catálogo: "plantas manufactureras en Tlalnepantla", "corporativos en Santa Fe", "colegios particulares en Naucalpan", "clínicas privadas", "centros logísticos Cuautitlán" |
| `directorio_publico` | Listados públicos de cámaras y asociaciones, leídos con Obscura |
| `parque_industrial` | Empresas listadas en parques industriales del Edomex/CDMX |
| `noticia_expansion` | Notas públicas de aperturas, nuevas plantas, sucursales o contrataciones TI (señal de compra) |
| `hallazgo_oportunista` | Una empresa distinta aparece mientras se investiga otra (homónimo, proveedor, vecino, cliente) |
| `referido` / `manual` | Lo agrega el dueño |

Reglas: solo páginas públicas, `--obey-robots`, sin iniciar sesión ni evadir bloqueos. No se extrae de redes sociales ni de sitios cuyos términos lo prohíban (ej. LinkedIn). `origen_url` y `origen_nota` son obligatorios para saber de dónde salió cada empresa.

**Hallazgos oportunistas:** cualquier agente que encuentre otra empresa interesante (incluido un homónimo del Rastreador) la registra con `crm_registrar_hallazgo` (barato: nombre, dirección/web si la ve, nota, URL) y SIGUE con su tarea. No la investiga a fondo en ese momento. El Guardián la evalúa después.

**Directorio como activo:** `empresas.etapa` = descubierta → filtrada → enriquecida → analizada → prospecto (o descartada). Descubrir es barato; procesar con IA es lo caro. Se pueden acumular cientos de empresas "descubiertas" y trabajar solo lotes pequeños en cada corrida, priorizando las de mejor señal. `busquedas_realizadas` evita repetir consultas.

## Eficiencia de tokens: código primero, IA solo para decidir
- Navegar y extraer lo hace código local, no el LLM. Método principal (decisión del dueño, "plan B"): CLI `obscura fetch <url> --dump text` (simple, local, rápido). Playwright por CDP (`obscura serve` en 127.0.0.1) queda como segundo nivel para páginas que necesiten JavaScript o clics, y se prueba en el spike. El LLM no "ve" páginas, solo recibe un resumen compacto.
- Herramienta `obscura_extract(url)` (a construir): devuelve JSON {titulo, texto_compacto (recortado), correos y teléfonos extraídos por regex, enlaces a Contacto/Nosotros}. Cache en `paginas_cache`.
- Antes de cualquier búsqueda: `crm_directorio_buscar` (¿ya la tenemos? ¿ya hicimos esta consulta?).
- Dedupe, filtros de gobierno, validación de formato, derivación de zona y envío: código sin LLM.
- La IA se reserva para: decidir si un sitio es el de esa empresa, clasificar, proponer productos, armar paquetes, QA, calificar y redactar.
- **Por verificar (spike P0 antes de construir):** que `obscura fetch` y luego Playwright (`connectOverCDP`) funcionen bien en Windows con sitios reales de México. El README los da por compatibles, pero eso viene de su documentación, no lo he probado.

## Cadena de lectura con fallbacks (nunca quedarse atorado)
Para obtener información de una empresa o una página, `obscura_extract` y los agentes siguen este orden y pasan al siguiente nivel en cuanto uno falla:
1. **Caché local** (`paginas_cache`): si ya la leímos, no se vuelve a pedir.
2. **`obscura fetch`** (CLI, texto): rápido y barato.
3. **Playwright sobre Obscura (CDP)**: solo si la página necesita JavaScript o interacción.
4. **`web_search` del motor**: cuando Obscura falla, no carga o no devuelve datos útiles; lee los fragmentos de los resultados.
5. **Dar por cerrada la fuente**: se registra `sin_datos` con el motivo (en `actividad_agentes`) y el agente sigue con la siguiente empresa o método. Nunca reintenta en bucle.

Límites anti-atasco (en código, no en prompts): timeout por página (~20 s), máximo 2 reintentos por URL, máximo 8 páginas por sitio, máximo de tiempo/empresa por corrida; si una empresa no rinde, pasa a `descartada` con motivo "sin_datos" o vuelve a `descubierta` para otra corrida. Si Obscura no está disponible (no inicia o se cae), la corrida degrada automáticamente a `web_search` y avisa en el panel de corrida en vez de detenerse.


## Términos de almacenamiento de Google
- Diseño conservador: de Places solo se guarda `place_id`, nombre y dirección (con municipio/CP/zona derivados). **No se guardan lat/lng** (los términos archivados permiten cachearlos hasta ~30 días).
- Sitio web, teléfonos y correos se obtienen de internet (web_search + Obscura) con su `fuente_url`, no de Places.
- `place_id` se puede cachear según los términos, pero la política exacta no pude confirmarla en la búsqueda: pendiente de leer las Places API Policies vigentes antes de la implementación.

## Entidades (15 tablas)
configuracion, destinatarios_internos, no_contactar, taxonomia_giros, corridas, places_uso, empresas, contactos, necesidades, prospectos, propuestas_producto, paquetes, revisiones_qa, envios_email, actividad_agentes.

Notas de diseño:
- Sin columnas de precio en ninguna tabla.
- `contactos.fuente_url` obligatorio.
- Sin tabla de vendedores: `prospectos.canalizado_a` es texto libre del dueño.
- Estados de prospecto: Nuevo → Calificado → Reportado → Canalizado → En contacto → Propuesta → Ganado | Perdido; además Descartado y Revision humana.
- Los agentes no pueden poner Canalizado/En contacto/Propuesta/Ganado/Perdido (solo el dueño), lo valida la API.

## Analíticas del dashboard (consultas SQL, sin IA)
Prospectos por semana; por nivel A/B/C; por giro; por zona (estado_mx); embudo por estado; tasa Reportado→Canalizado→Ganado; tiempo promedio entre etapas; motivos de descarte; cuota de Places usada del mes; corridas recientes y su resultado; correos fallidos.

## Migraciones
Archivos SQL numerados (`001_init.sql`, ...) aplicados al arrancar; la capa de acceso a datos queda aislada (repositorios) para poder pasar de SQLite a otra base sin tocar la API.
