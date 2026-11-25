# Spec P6–P8 — Oficina virtual propia (3D) + conocimiento + aprendizaje

Estado: BORRADOR para capa 17/00 → 03 (se ejecuta DESPUÉS de P5 "runner propio"). Fecha: 2026-11-25.
Motor base: **Claude Sonnet 5.5** (`claude-sonnet-5-5`) vía **Claude Code plan Pro** (suscripción, sin API de pago). Fijar `--model claude-sonnet-5-5` en el adaptador. Pro tiene límites ajustados: TODO lo nuevo debe ser barato en tokens (leer solo fragmentos de la base de conocimiento, reflexiones solo a petición, nada automático).

## Principios
- Los candados de seguridad NO son editables desde la UI: se añaden en código al final de cada prompt (no contactar prospectos, no precios, solo correos internos, solo CDMX/Edomex, sin gobierno). La UI edita lo demás.
- El aprendizaje propone, el dueño aprueba. Ningún agente reescribe sus propias instrucciones solo.
- Todo versionado con historial y rollback (prompts, base de conocimiento, habilidades, lecciones).

## P6 — Cerebro de la oficina (backend + pantallas de gestión)
### 6.1 Fuente única de verdad (Base de conocimiento, "Biblioteca")
Tablas: `kb_documentos` (id, tipo, titulo, contenido_md, tags, activo, version), `kb_versiones`, `kb_productos` (marca Lenovo|Aruba, familia/categoría, descripción, casos de uso, giros ideales, argumentos de valor, advertencias; SIN precios). Tipos de documento: productos, giros objetivo e ICP, oficinas y cobertura, voz y tono, objeciones/FAQ, reglas de negocio, glosario, listas (excluir).
UI «Biblioteca»: crear/editar/archivar con vista previa Markdown, historial y restaurar, importar CSV de productos, búsqueda.
MCP: `kb_buscar(texto, tipo?)` y `kb_leer(id)` devuelven fragmentos cortos (tope de caracteres). Cada prompt de agente indica qué tipos puede consultar.
### 6.2 Prompts editables
Tablas `agentes` (id, nombre_ui, persona, genero, rol, area, activo, skills[]), `prompts_agente` (agente, version, texto, activo), `prompt_global` (version, texto). Prompt final = global + del agente + lecciones aprobadas (tope N tokens) + habilidades activas + candados fijos (código).
UI: editor por agente y editor global, diff entre versiones, rollback, vista «prompt final compuesto» con estimado de tokens, botón «probar con caso de ejemplo» (gasta plan; confirmar).
### 6.3 Habilidades (skills)
Una habilidad = documento Markdown de instrucciones/procedimiento reutilizable (ej. «Cómo verificar que un sitio es el oficial»), asignable a uno o varios agentes, con activar/desactivar y versiones. Sin ejecutar código ni instalar paquetes desde la UI. Biblioteca de habilidades base incluida.
### 6.4 Salidas por agente
Tabla `salidas_agente` (corrida, agente, empresa_id/prospecto_id, tipo, resumen, contenido, tokens_estimados, duración, resultado). El runner la llena en cada paso. Alimenta el panel del agente («lo que ha generado»).
### 6.5 Retroalimentación y aprendizaje
- Captura automática: rechazos y aprobaciones de QA, resultados del dueño (Canalizado/Ganado/Perdido/Descartado + motivo), mejores y peores scores.
- Captura manual en el detalle del prospecto: 👍/👎 por etapa (contactos, ficha, paquetes, reporte) + etiqueta + nota; «error de agente X».
- `lecciones` (agente, tipo: acierto|error, texto corto, evidencia, estado: propuesta|aprobada|archivada, origen). Solo las aprobadas se inyectan (máx. ~10 por agente, ~600 tokens).
- «Reflexión» (a petición, 1 llamada por agente con datos agregados): propone lecciones nuevas y fusiona duplicadas; el dueño aprueba/edita/descarta en la pantalla «Aprendizaje».
- Métricas por agente: tasa de aprobación QA, devoluciones, aciertos del dueño, tiempo medio, tokens por empresa. Tablero «Desempeño».
- Conjunto de prueba (casos dorados, 5–10): permite ver si un cambio de prompt/lecciones empeora el resultado antes de usarlo en corridas reales.
### 6.6 Otros faltantes
Estimador de consumo por corrida (pasos × tokens medios) con aviso si es alto; respaldo/restauración de la base (copiar `crm.db`); exportar prospectos a CSV; registro de cambios (quién/cuándo cambió qué).

## P7 — Oficina 3D (Three.js)
Tecnología: `three` + `@react-three/fiber` + `@react-three/drei`; cámara ortográfica isométrica fija con paneo/zoom limitado y rotación en pasos de 90°; geometría procedural estilo Lego (cajas, cilindros con «studs»), SIN modelos externos (sin riesgos de licencia ni descargas). Carga diferida (chunk aparte); modo bajo consumo (`frameloop="demand"`, DPR limitado); respaldo automático al 2D actual si no hay WebGL o con `prefers-reduced-motion`. Skills de Three.js: revisar completas en carpeta aislada antes de instalarlas.
### Plantilla de la oficina (planta única, piso de cuadrícula, paredes bajas cortadas para ver el interior)
- **Recepción** con logo ACITMX (textura del logo existente) y pantalla «Oficina en pausa / en operación».
- **Área Descubrimiento**: Cartógrafa, Explorador (pizarrón con mapa de CDMX/Edomex).
- **Área Investigación**: Guardiana, Rastreador, Analista (pared de monitores).
- **Área Estrategia**: Estratega, Armadora (mesa de maquetas con laptops/switches/APs en miniatura).
- **Área Calidad**: QA-1, QA-2 (escritorios con sellos de aprobado/rechazado).
- **Área Reporte**: Calificadora (medidor de score), Redactor (impresora que saca el reporte).
- **Sala de juntas / Dirección**: Michael (coordinador) con pantalla de progreso de la corrida.
- **Biblioteca (KB)**: estantes con libros por tipo; al hacer clic abre la Biblioteca del CRM.
- **Sala de aprendizaje**: pizarrón de lecciones y buzón de retroalimentación (abre «Aprendizaje»).
- Cafetería/descanso, plantas, lámparas, alfombras, cables, ventanas, luz cálida; día/noche opcional.
Cada puesto: cubículo o mini-oficina por área, escritorio, silla, monitor(es), lámpara, taza, plantita; rótulo con nombre y rol.
### Personajes (12, mitad y mitad — 6 mujeres y 6 hombres; nombres editables)
Mujeres: Camila (Cartógrafa), Gabriela (Guardiana), Ana (Analista), Alejandra (Armadora), Carla (Calificadora), Valeria (QA-2).
Hombres: Michael (Coordinador), Mateo (Explorador), Rodrigo (Rastreador), Esteban (Estratega), Iván (QA-1), Hugo (Redactor).
Estilo minifigura Lego: cabeza cilíndrica con cara, cabello y accesorio distintos, torso/piernas de bloques en colores de marca (Deep Teal, Brand Teal) más acentos por área; variedad de tonos de piel.
Animaciones (solo transform): inactivo (respiración leve), trabajando (tecleo, monitor encendido, burbuja con la tarea), entregando (camina con folder al siguiente puesto), alerta (devolución QA), pausa. Trayecto de expedientes entre áreas según los eventos reales del runner (SSE).
### Interacción
Clic en un agente → panel lateral con pestañas: **Estado** (qué hace ahora, empresa actual, tiempo), **Salidas** (lo que ha generado, enlazado al prospecto), **Prompt** (editor propio + vista del global), **Habilidades** (activar/crear), **Aprendizaje** (lecciones aprobadas/propuestas, métricas), **Historial**. Clic en salas especiales abre su pantalla. Modo presentación (pantalla completa sin datos sensibles).
Rendimiento objetivo: 60 fps en laptop común con 12 personajes; chunk 3D < ~700 kB gzip.

## P8 — Cierre
Pruebas (lógica de prompts compuestos, versiones/rollback, KB, lecciones, candados inamovibles; pruebas de humo del canvas 3D), accesibilidad (alternativa 2D y lista textual de agentes), gates 04.5/10, react-doctor, guía actualizada, Save Point.

## Plataforma reutilizable y vendible (requisito añadido 2026-11-25)
Objetivo: que el producto sirva a otros negocios y que un mismo cliente tenga VARIAS oficinas (ej. prospección, alimentación de base de datos, organización de archivos/CRM, vigilancia de noticias relevantes).
- **Edificio → Pisos → Oficinas → Agentes.** La vista 3D muestra un edificio con corte por pisos (elevador/selector de piso); cada piso es una oficina con su propia planta, agentes, flujo, base de conocimiento y corridas. Una oficina puede crearse, duplicarse, archivar.
- **Todo dirigido por datos:** una oficina = `office` (nombre, ícono, colores) + `agentes` (persona, género, rol, área, posición en la planta) + `workflow` (pasos, devoluciones de QA, topes) + `prompts` + `habilidades` + `kb` + `herramientas MCP permitidas`. La oficina ACITMX de prospección es solo la primera definición.
- **Plantillas de oficina:** exportar/importar una oficina como paquete (JSON/ZIP sin datos del cliente ni secretos) y galería de plantillas (Prospección, Base de datos, Archivos/CRM, Noticias del sector, Vacía). Editor de plano (elegir distribución de áreas/cubículos, 4–20 puestos) para oficinas nuevas.
- **Marca blanca:** nombre, logo y paleta configurables por instalación; textos de la UI sin menciones a ACITMX fuera de la configuración. Candados de seguridad configurables por oficina pero siempre en código y no editables desde los prompts.
- **Datos por oficina:** `office_id` en corridas, salidas, lecciones, KB y eventos; KB compartida a nivel edificio opcional.
- **Venta:** instalación local por cliente (como hoy) con archivo de licencia opcional; documentación de instalación. Decisión comercial/licencias queda para después (revisar licencias de dependencias).

## Asistente de nuevo piso ("Constructor de oficinas") — requisito añadido 2026-11-25
Desde la UI, botón «Nuevo piso»: un asistente conversacional (misma suscripción Claude Pro, modelo claude-sonnet-5-5; agente meta "Arquitecta de oficinas" con un prompt tipo Master Interviewer) entrevista al dueño paso a paso, resuelve dudas y propone la especificación completa; el dueño revisa y aprueba. NO se reescribe la app: solo se genera la definición de la oficina.
Fases del asistente: 1) objetivo del piso y qué entrega (resultado esperable); 2) datos de entrada/salida y dónde se guardan; 3) agentes sugeridos (roles, género/nombres, áreas, QA si aplica) y flujo (workflow con devoluciones y topes); 4) herramientas del catálogo que necesita; 5) base de conocimiento inicial (preguntas guiadas + importar archivos/texto); 6) candados y límites (qué NUNCA debe hacer, topes de consumo); 7) vista previa 3D del piso con el plano propuesto; 8) prueba controlada de 1–3 elementos con estimado de consumo; 9) crear piso.
Salida: paquete de oficina (office + agentes + workflow + prompts + habilidades + KB + herramientas + colecciones), validado con esquema (zod) antes de guardarse; versionado y editable después con los mismos editores de P6.
### Catálogo de herramientas genéricas (lo que hace posible crear pisos SIN programar)
- `kb_*` (biblioteca de la oficina), `web`: `obscura_extract` + `web_search` del motor.
- `coleccion_*`: tablas definidas por el usuario en la UI (campos tipados, validación, historial, deduplicación por clave, fuente por registro) — así un piso «alimentar base de datos» o «noticias» guarda sus resultados; vista de tabla y exportación CSV automáticas.
- `archivos_*`: leer/ordenar/renombrar SOLO dentro de carpetas autorizadas por el dueño (sandbox, sin borrar; mover = a carpeta de cuarentena reversible).
- `notificar_interno`: correo a destinatarios internos (allowlist) y avisos en la UI.
- `crm_*` de ACITMX: específicas del piso de prospección.
Límite honesto: integraciones nuevas (un API externo, otro CRM, WhatsApp, etc.) requieren desarrollo de una herramienta nueva; el asistente lo detecta, lo marca como «requiere herramienta nueva» y deja la especificación lista para implementarla.
### Reglas
Todo piso nace con los candados base (sin contacto externo, sin borrado, solo destinos internos, topes de consumo); relajarlos exige confirmación explícita del dueño y queda en el registro de cambios. Nada corre solo: cada corrida la inicia el dueño. El asistente gasta plan: mostrar estimado y pedir confirmación antes de la prueba.

## Personalizador de personajes, salas y oficinas — requisito añadido 2026-11-25
Principio: TODO lo visual es un parámetro (JSON `apariencia` validado con zod, guardado por personaje/sala/oficina, incluido en el paquete exportable de la oficina). La escena 3D se construye solo a partir de esos parámetros (procedural), así cada cambio se ve al instante en una vista previa en vivo. Cada parámetro tiene: valor por defecto, botón «aleatorio» y «restablecer». Presets listos para quien no quiera personalizar; todo abierto para quien sí.
### Personaje
Tono de piel (paleta de 8+), peinado (mín. 3: corto, largo, rizado/afro o calvo; ampliable por catálogo), color de cabello, color de ojos, color de camisa, color de pantalón, calzado, accesorio opcional (lentes, gorra, audífonos, corbata), expresión base, altura leve (±10 %), nombre y género (cuerpo base). Botones: «Aleatorio» (respeta paridad 50/50 al generar equipos), «Default de la plantilla», «Duplicar apariencia». Presets de equipo (uniforme de oficina con colores de marca, casual, formal).
### Sala / área
Tamaño (ancho × fondo en celdas de la cuadrícula, con mínimos/máximos), número y distribución de puestos, color y material de piso (madera, alfombra, concreto, cuadros), color de paredes, altura de paredes, mobiliario (escritorios, cubículos o mini-oficina, estantes, sofás, plantas, pizarrón), estilo de iluminación, rótulo (texto y color). Reubicar/redimensionar arrastrando en un editor de plano con rejilla (arrastrar y soltar, rotar 90°), con validación de que no se traslapen ni bloqueen pasillos.
### Oficina / edificio
Paleta de la oficina (preset: ACITMX Teal, Corporativo azul, Cálido, Oscuro, Pastel, o personalizada), logo y nombre (marca blanca), ciclo día/noche y hora fija, clima de luz, tamaño total de planta, número de pisos, fachada y color del edificio, calidad gráfica (Alta/Media/Baja).
### UI
Pantalla «Personalizar» con tres pestañas (Personajes, Salas, Oficina), lista de elementos a la izquierda, controles a la derecha y vista previa 3D en vivo con cámara giratoria; guardar como preset propio, importar/exportar presets (JSON), deshacer/rehacer, comparar con default. Accesibilidad: rótulos y nombres siempre con contraste suficiente aunque el usuario elija colores extremos (se ajusta automáticamente el color del texto del rótulo).
### Datos
`apariencias` (office_id, entidad: personaje|sala|oficina, entidad_id, json, version), `presets_apariencia` (tipo, nombre, json, builtin). Cambios versionados y revertibles. Rendimiento: instancias/materiales compartidos por color para no multiplicar draw calls.

## 3D siempre
La vista de oficina es SIEMPRE 3D (Three.js). Se elimina el 2D como experiencia alterna; solo queda una lista textual accesible de agentes/estados para lectores de pantalla y un modo de bajo consumo del mismo 3D (menos efectos, sin sombras suaves). Calidad visual objetivo: espectacular — iluminación cálida con sombras, materiales plásticos tipo Lego (brillo, bordes biselados), post-proceso sutil (bloom en pantallas, SSAO opcional), partículas ligeras (polvo, vapor del café), transiciones de cámara suaves al seleccionar agente/piso, animaciones con carácter, ciclo día/noche, detalles de utilería por área.

## Orden de ejecución propuesto
P5 runner (en curso) → P6.1–6.4 (KB, prompts, habilidades, salidas) → P7 (3D, ya con panel funcional) → P6.5/P8 (aprendizaje y desempeño) → cierre.
