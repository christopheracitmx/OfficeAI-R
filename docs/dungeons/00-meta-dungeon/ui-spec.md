# UI Spec — ACITMX Prospecting Office (capa 00.5, borrador v2)

Fecha: 2026-11-25. Idioma de la UI: español (México). Escritorio primero (el dueño trabaja en PC); responsive básico hasta tablet, móvil solo lectura.
Los UI Contracts por componente se generan en la capa 04 a partir de esta especificación.

## Principios
1. **El dueño no pierde tiempo.** Lo primero que ve es qué requiere su atención, no tablas.
2. **El CRM es la fuente de verdad.** Todo lo que llega por correo está completo en la app (reporte, contactos, borrador).
3. **Humano al mando.** Los agentes proponen; el dueño decide (estado, canalización, descartar). La UI nunca ofrece "enviar al prospecto": solo "Copiar borrador".
4. **Sin precios en ninguna pantalla.**
5. **Cero datos de relleno.** Estados vacíos con mensajes útiles; nada de mock data en runtime.
6. **Mostrar siempre de dónde salió un dato** (fuente con enlace) y separar evidencia de inferencia.
7. **Costos visibles:** cuota de Places y estado del plan de IA a la vista, para no gastar de más.

## Navegación (sidebar fijo, 220 px)
1. **Inicio**
2. **Prospectos** (con insignia de "sin ver")
3. **Embudo**
4. **Directorio**
5. **Ver oficina** (punto verde pulsante si hay agentes trabajando)
6. **Corrida** (punto verde si hay una en curso)
7. **Actividad**
8. **Configuración**

## Pantallas (9)

### 1. Inicio (dashboard del dueño)
Objetivo: en 10 segundos saber cómo va todo.
- Banda superior de atención (solo si aplica): "Tienes N prospectos nuevos sin ver" [Ver ahora]; "N correos no se enviaron" [Revisar]; "Cuota de Places al X %"; "La última corrida se pausó por límite del plan".
- 4 tarjetas KPI: Prospectos esta semana · Nivel A (listos para canalizar) · Canalizados (mes) · Ganados (mes). Cada una con comparación vs. periodo anterior.
- Gráfica: prospectos nuevos por semana (barras, últimas 8 semanas).
- Embudo compacto por estado (barras horizontales con conteo).
- Distribución por giro y por zona (top 5 de cada una).
- Lista corta: "Últimos prospectos" (5) con score, nivel y empresa.
- Directorio: empresas descubiertas sin procesar (para saber cuánto "inventario" hay).
Estados: cargando (skeletons), vacío ("Aún no hay prospectos. Inicia tu primera corrida." + botón), error ("No pudimos leer la base de datos" + reintentar).

### 2. Prospectos (lista)
- Tabla: Empresa · Giro · Zona (municipio) · Score (barra + número) · Nivel (A/B/C) · Estado · Canalizado a · Fecha · Correo (✓ enviado / ⚠ fallido).
- Filtros: estado, nivel, giro, zona, "solo sin ver", método de descubrimiento, rango de fechas. Búsqueda por nombre/dominio. Orden por defecto: sin ver primero, luego score descendente.
- Acciones masivas: marcar como visto, cambiar estado (solo estados permitidos al dueño).
- Clic en fila → Detalle.
Vacío con filtros: "Ningún prospecto coincide con estos filtros" + limpiar filtros.

### 3. Detalle de prospecto (panel lateral ancho o página)
Encabezado: nombre de la empresa, sitio web (enlace, con ✓ "sitio verificado" o ⚠ "sitio sin verificar"), badge de nivel y score, selector de estado, botón "Descartar" (con motivo).
Secciones (en este orden):
1. **Reporte** — el texto "Oye jefe..." completo (`reporte_md`).
2. **Contactos** — teléfonos, correos y persona (si existe); cada uno con su fuente (enlace) y fecha; botones "Copiar". Aviso si no hay contacto verificado.
3. **Paquetes sugeridos** — hasta 3, con componentes, argumento y a quién van dirigidos. Sin precios.
4. **Productos propuestos** — marca (Lenovo/Aruba), categoría, razón, prioridad.
5. **Ficha de la empresa** — giro, tamaño estimado, sucursales, resumen, dirección y zona, cómo se descubrió (método + origen).
6. **Necesidades detectadas** — chips "Evidencia" y "Inferencia" diferenciados.
7. **Score** — desglose por criterio y justificación.
8. **Borrador de correo para el vendedor** — texto con botón "Copiar borrador". Nunca "Enviar".
9. **Canalización del dueño** — campo "Canalizado a" (texto libre), notas, y botón "Marcar como canalizado".
10. **Historial** — revisiones QA (aprobado/devuelto y motivos), actividad de agentes, envíos de correo (con "Reenviar" si falló).
Al abrir un prospecto se marca como visto.

### 4. Embudo (Kanban)
Columnas: Reportado · Canalizado · En contacto · Propuesta · Ganado · Perdido. (Nuevo/Calificado/Descartado/Revisión humana se ven en Prospectos.) Tarjetas arrastrables entre columnas (solo el dueño); cada tarjeta: empresa, nivel, score, canalizado a, antigüedad. Al soltar en Perdido/Descartado pide motivo. Contadores por columna.

### 5. Directorio (empresas descubiertas)
- Tabla de todas las empresas conocidas: Nombre · Giro · Zona · Método de descubrimiento · Etapa (descubierta → prospecto/descartada) · Origen (enlace) · Fecha.
- Filtros: método, etapa, giro, zona, motivo de descarte. Búsqueda.
- Acciones del dueño: "Priorizar para la próxima corrida", "Descartar", "Agregar empresa manual".
- Resumen arriba: total, por etapa y por método (qué método rinde más).

### 6. Ver oficina (espejo visual de los agentes)
Objetivo: que se vea el equipo trabajando; es la pantalla "de impacto" para mostrar a socios y clientes. Es SOLO lectura: no controla nada (para eso está Corrida).
- **Escena:** una oficina estilizada con un escritorio por agente (Cartógrafo, Explorador, Guardián, Rastreador, Analista, Estratega, Armador, QA-1, Calificador, Redactor, QA-2 y Coordinador). Cada agente tiene nombre, rol y un personaje animado con estados visibles: inactivo (en su lugar, tenue), buscando (lupa/globo), leyendo página (pantalla con el dominio), analizando, escribiendo, en revisión QA, error (⚠), esperando.
- **Flujo visible:** cuando un agente termina, el expediente viaja (tarjeta animada) al escritorio del siguiente; las devoluciones de QA regresan la tarjeta con un aviso corto. Cada agente muestra en un globo lo que hace en ese momento, p. ej. "Leyendo ejemplo-empresa.mx · contacto".
- **Marcador lateral:** corrida actual (zona, giro), empresas descubiertas / analizadas / aprobadas / reportadas, cuota de Places, tiempo transcurrido.
- **Feed inferior:** últimas acciones en lenguaje humano. Clic en un agente abre su actividad reciente.
- **Estado inactivo:** la oficina "dormida" (luces tenues, agentes en reposo) con el mensaje "La oficina está en pausa. Inicia una corrida para verla en acción." y botón hacia Corrida. Esto refleja que solo trabaja cuando se le indica.
- **Modo presentación:** pantalla completa sin menús ni datos sensibles (sin contactos ni correos), para mostrarla a terceros.
- **Rendimiento y accesibilidad:** animación ligera (CSS/SVG/Canvas, solo transform y opacity), pausa si la pestaña está oculta, respeta `prefers-reduced-motion` (versión estática con indicadores), y alternativa textual del estado de cada agente.
- **Estilo visual:** v1 en 2D estilizado con la paleta de marca. Como la escena es nuestra, una versión 3D tipo Lego (three.js) queda como fase posterior opcional, sin necesidad de modificar Munder Difflin.

**Cómo se alimenta (decisión de arquitectura):**
- Fuente principal: nuestros propios eventos. Cada herramienta del CRM que usan los agentes (`crm_*`, `obscura_extract`) escribe un evento en `actividad_agentes` (agente, acción, empresa, detalle, hora), y la API los transmite a la pantalla en vivo (SSE sobre 127.0.0.1). Así la vista no depende de los internos de Munder y funciona con cualquier motor (Claude, OpenCode o Gemini).
- Fuente opcional futura: leer el `log.jsonl` del "hive" de Munder (solo lectura) para enriquecer la escena. Según la documentación de diseño de Munder ese archivo existe, pero no está verificado en el código, la ubicación (`harnessHome`) no está documentada, y no hay API oficial de lectura. Se evalúa en el spike de la capa 18; no es requisito.
- No se incrusta la ventana de Munder en el CRM: es una app de escritorio (Electron) sin interfaz web documentada.
- Limitación: la vista mostrará lo que los agentes reporten por herramientas del CRM (alto nivel), no su terminal completa. Se puede añadir un evento "latido" (agente activo) desde cada herramienta para que la escena no se vea congelada durante pasos largos.

### 7. Corrida (control de agentes)
Es el panel de gasto controlado: nada corre sin que el dueño lo pida.
- Formulario: zona (solo las de `zonas_piloto`), giro (taxonomía o "Cualquiera"), métodos de descubrimiento (casillas), máximo de empresas (default 10, tope 50). Botón "Iniciar corrida".
- Indicadores antes de iniciar: cuota de Places usada/tope; motor de IA activo; aviso "Una corrida consume plan de IA".
- En vivo: línea de tiempo por agente (pendiente · en curso · listo · error), contadores (descubiertas, filtradas, analizadas, aprobadas, reportadas), botón "Detener" (termina limpiamente tras la empresa actual).
- Historial de corridas: fecha, zona, giro, resultado, motivo de fin (terminada, detenida, pausada por límite del plan, pausada por cuota de Places, error).
- Pregunta abierta de integración (se resuelve en capa 18): cómo "Iniciar corrida" activa a los agentes en Munder Difflin. Opción por defecto: el CRM registra la corrida como `solicitada` y el dueño le pide a Michael que la ejecute (cero gasto automático). Opción alternativa: un disparador (webhook) de Munder, aún sin verificar que sirva para esto.

### 8. Actividad (bitácora)
Lista cronológica de lo que hicieron los agentes (agente, acción, empresa, detalle, hora) con filtro por corrida, agente y tipo (descubrimiento, QA, error, `sin_datos`). Sirve para auditar y detectar dónde se atoran.

### 9. Configuración
Pestañas:
1. **Correos de reportes** — lista de destinatarios (CRUD): agregar, editar, activar/desactivar, eliminar; botón "Enviar correo de prueba" a uno; validación de formato; no permite dejar cero destinatarios activos sin aviso. Inicial: christopher.rodriguez@acitmx.com. Muestra el remitente (info@mail.acitmx.net) como dato de solo lectura y estado de la conexión con Resend (la API key NO se muestra ni se edita aquí; vive en `.env`).
2. **Corridas** — máximo de empresas por defecto, zonas piloto activas (CDMX, Estado de México; ampliar después).
3. **Cuotas y costos** — tope mensual de Places (4,900), uso actual, reinicio mensual. Motor de IA activo (solo lectura; se cambia en `config/engine.yaml`) con explicación de cómo cambiarlo.
4. **No contactar** — lista (dominio, correo, teléfono, nombre) con motivo; agregar/quitar.
5. **Giros** — catálogo de giros (editable).

## Roles y permisos en la UI (sin login en v1)
- Cualquiera que abra la app local es "el dueño". La API escucha solo en 127.0.0.1.
- Estados que solo el dueño puede poner: Canalizado, En contacto, Propuesta, Ganado, Perdido, Descartado. La API los rechaza si vienen de un agente.

## Componentes compartidos
Sidebar · KPICard · Badge de nivel (A verde, B ámbar, C gris) · ScoreBar · EstadoSelect · FuenteLink (enlace con favicon y fecha) · Chip evidencia/inferencia · DataTable (filtros, orden, paginación) · KanbanBoard · EmptyState · ErrorBanner · Skeleton · ConfirmDialog (con motivo) · CopyButton · Toast.

## Identidad visual (aprobada por el dueño, 2026-11-25)
Logo: `assets-descarga/logo/logo-acit.png` (PNG 231×102, descargado de acitmx.net; teal `#00ADA9` con texto negro "INTEGRATION TECHNOLOGY"). Pendiente: versión vectorial (SVG) o PNG en blanco/transparente para fondos oscuros; mientras tanto el logo va sobre fondo claro (Ice White o una tarjeta clara dentro del sidebar). No lo redibujo ni lo recoloreo.

## Tokens de diseño (en `:root`)
Paleta de marca:
- **Ice White** `--ice: #F4F8FA` (fondo de la app).
- **Deep Teal** `--deep-teal: #0F3D47` (sidebar, encabezados, texto principal).
- **Brand Teal** `--brand-teal: #00ADA9` (color del logo: acento, botones primarios, enlaces con peso, gráficas).
- Apoyo derivado: `--brand-teal-strong: #007F7C` (texto y enlaces sobre fondo claro), `--brand-teal-soft: #D9F2F1` (fondos suaves, selección), `--deep-teal-2: #164E5A` (hover en sidebar), `--surface: #FFFFFF`, `--border: #DCE6EA`, `--text-2: #4B6670` (texto secundario).
- Semánticos: éxito `#1F9D6B`, aviso `#D98E04`, error `#D64545`. Niveles: A = Brand Teal oscuro (`#007F7C`), B = ámbar, C = gris azulado `#7A8F97` (siempre con la letra).

Contraste verificado (WCAG, calculado):
| Combinación | Ratio | Uso |
|---|---|---|
| Deep Teal sobre Ice White | 11.05:1 | Texto principal: AA/AAA ✓ |
| Ice White sobre Deep Teal | 11.05:1 | Texto en sidebar ✓ |
| `#007F7C` sobre Ice White | 4.54:1 | Enlaces y texto de acento ✓ (AA) |
| Blanco sobre `#007F7C` | 4.85:1 | Botón primario con texto blanco ✓ |
| Deep Teal sobre `#00ADA9` | 4.24:1 | Solo texto grande/negrita o iconos |
| `#00ADA9` sobre Ice White | 2.6:1 | ✗ NO usar para texto; solo rellenos, barras, líneas, iconos grandes |
| Blanco sobre `#00ADA9` | 2.78:1 | ✗ NO para texto pequeño |
Regla: el Brand Teal `#00ADA9` puro se usa como relleno/gráficas/acentos; para texto o botones con texto usar `#007F7C` o Deep Teal.

Layout y estilo:
- Sidebar Deep Teal con texto Ice White y activo con barra Brand Teal; logo en tarjeta clara arriba. Contenido sobre Ice White con tarjetas blancas.
- "Ver oficina": escena con base Deep Teal (profundidad) y acentos Brand Teal; los agentes en tonos de la paleta con un acento por rol. El ojo vende: es la pantalla más cuidada.
- Tipografía: sistema (Inter si está disponible); base 14 px, títulos 20/24 px; números tabulares en tablas y KPIs.
- Radios 8/12 px; un solo sistema de sombras (sm, md). Espaciado en múltiplos de 4.
- Animación: solo `transform` y `opacity`, 80–200 ms en microinteracciones (`cubic-bezier(0.4, 0, 0.2, 1)`); la escena de oficina usa bucles más lentos y se pausa en pestaña oculta; todo respeta `prefers-reduced-motion`.
- Accesibilidad: contraste AA, foco visible, teclado en tablas y Kanban (alternativa al arrastre: "Mover a…"), el color nunca es el único indicador.

## Copy base (ejemplos reales)
- Vacío Inicio: "Aún no hay prospectos. Inicia una corrida para que los agentes busquen empresas en CDMX y Estado de México."
- Vacío Prospectos: "Cuando los agentes aprueben un prospecto, aparecerá aquí."
- Correo fallido: "El correo no se envió, pero el prospecto está guardado aquí. [Reenviar]"
- Cuota: "Places: 1,240 de 4,900 solicitudes este mes."
- Límite del plan: "La corrida se pausó porque se alcanzó el límite del plan de IA. Puedes reanudarla más tarde o cambiar el motor en config/engine.yaml."
- Confirmar descarte: "¿Descartar esta empresa? Indica el motivo para no volver a trabajarla."

## Flujos clave
1. **Revisar y canalizar:** Inicio → "N sin ver" → Prospectos → Detalle → copiar borrador/contactos → escribir "Canalizado a" → marcar Canalizado.
2. **Iniciar corrida:** Corrida → elegir zona/giro/límite → Iniciar → seguir en vivo → ver resultados en Prospectos.
3. **Correo no llegó:** Inicio (banda de atención) o Detalle → el reporte ya está en el CRM → Reenviar.
4. **Cambiar destinatarios:** Configuración → Correos de reportes → agregar/editar → correo de prueba.

## Pendientes de esta capa
- Logo en versión vectorial o blanca para fondos oscuros (opcional; hoy se usa el PNG sobre fondo claro).
- Confirmar la integración de "Iniciar corrida" con Munder Difflin (capa 18).
- Revisar este spec contigo antes de generar UI Contracts.
