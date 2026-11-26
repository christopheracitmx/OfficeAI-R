# Auditoría UX/UI y 3D (capa 01) — OfficeAI-R / ACITMX

Fecha: 2026-11-26. Alcance: frontend (`crm/src/web`, ~8,100 líneas en páginas, ~2,000 en escena 3D). Método: capturas reales de 11 rutas con Edge (`tools/pw-shot`), lectura de `styles.css`, `ui.tsx`, `Sidebar.tsx` y la escena. Esta auditoría es **de diagnóstico**: no se cambió código. La auditoría con skills (impeccable `audit`/`critique`, hallmark, deslop, ui-ux-pro-max) se ejecuta en D1 con la dirección ya decidida.

Nota: las capturas se tomaron de la copia Roesch (misma base de código, base de datos vacía); la estructura y los defectos son idénticos en la de ACITMX.

## 1. Diagnóstico general («por qué se ve a IA genérica»)
| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| G1 | **Sin identidad visual propia.** Paleta teal + neutros fríos, tarjetas blancas con borde fino y esquina redondeada en todas partes: es el patrón por defecto de «dashboard con Tailwind». | `styles.css` (10 tokens, 1 sola familia de color), 9 ocurrencias literales de `rounded-lg border border-line bg-white` | Alta |
| G2 | **Tipografía plana.** Una sola familia (Inter/Segoe), cuerpo 14 px, títulos de página casi del mismo peso que el cuerpo; sin escala tipográfica, sin contraste de personalidad entre título, cifra y etiqueta. Inter no se carga (cae a Segoe UI): la tipografía depende de la PC del usuario. | `--font-sans`, sin `@font-face` ni fuente en `index.html` | Alta |
| G3 | **Navegación saturada y sin jerarquía.** 16 ítems en una lista plana de un solo nivel, mezclando uso diario (Prospectos, Embudo) con administración (Prompts, Habilidades, Aprendizaje, Salidas, Actividad, Datos). Iconos son glifos unicode (◧ ▦ ◉ ✦ ✿) de tamaños y pesos dispares, no un set de iconos. | `Sidebar.tsx` `ITEMS` | Alta |
| G4 | **Banner de aviso permanente en el sidebar** (amarillo saturado) compite con la navegación en todas las páginas. | capturas inicio/prospectos | Media |
| G5 | **Espaciado sin ritmo.** Páginas con mucho vacío debajo del contenido (Inicio, Prospectos, Embudo) y bloques pegados entre sí en otras (Edificio: botones a dos líneas con enlaces sueltos). Sin sistema de espaciado declarado. | capturas | Media |
| G6 | **Estados vacíos desaprovechados.** Un recuadro punteado con una frase y un botón; no enseñan ni muestran el valor del producto. | inicio, prospectos, embudo, corrida | Media |
| G7 | **Movimiento casi inexistente en la interfaz 2D.** Solo `transition-colors` en botones; sin entradas de página, sin listas escalonadas, sin feedback al cambiar de estado, sin skeletons con carácter. | 11 archivos con `transition/animate`, ninguno de coreografía | Media |
| G8 | **Datos sin protagonismo.** El producto trata de prospectos con score A/B/C, pero la UI no tiene un componente de score/nivel memorable, ni gráficas, ni indicadores clave en Inicio. | Inicio vacío de métricas | Alta |
| G9 | **Formularios y tablas genéricos.** `select` nativos con estilos del navegador, sin tabla con jerarquía ni densidad pensada. | prospectos, corrida | Media |
| G10 | **Configuración con 11 pestañas en una fila** que se parte a dos líneas y no escala (ya se añadió «Motor de IA»). | configuracion.png | Media |
| G11 | Sin modo oscuro propio ni preferencias de usuario; el sidebar oscuro y el contenido claro no forman un sistema. | `styles.css` | Baja |
| G12 | Accesibilidad: foco visible existe (bien); pendiente auditar contraste (texto `muted` sobre `ice`, chips de nivel), objetivos táctiles y `prefers-reduced-motion` fuera de la escena 3D. | por verificar | Media |

## 2. Escena 3D (Ver oficina, Edificio, Personalizar)
Estado: funciona bien (cámara isométrica, 12 agentes con rutinas, día/noche, calidad, modo presentación, edificio multipiso). Detalle de diseño:
| # | Hallazgo | Severidad |
|---|---|---|
| E1 | **Todo es geometría primitiva** (cajas, cilindros) ensamblada en código (`kit.ts`, `muebles.ts`, `utileria*.ts`, `figura.ts`). Personajes tipo «muñeco de bloques», sin siluetas distintas ni detalle que los haga memorables. | Alta |
| E2 | **Paleta de salas muy saturada y plana**, cada sala de un color pastel distinto sin una dirección de arte común; el piso azul punteado exterior parece un grid de depuración. | Alta |
| E3 | **Iluminación y materiales básicos**: sombras suaves pero sin ambiente, sin glow en pantallas/monitores, sin sensación de profundidad de campo; hay `postprocessing` instalado pero con uso mínimo. | Media |
| E4 | **Etiquetas de sala como pastillas planas de colores** que tapan geometría y no siguen la jerarquía de información (estado, actividad). | Media |
| E5 | **Controles de la vista** como fila de `select`/botones nativos arriba del lienzo; poco cinematográficos. Falta una barra de controles integrada y estados de «agente trabajando» con más presencia (partículas, rayos entre agentes, burbujas). | Media |
| E6 | **Sin momento de entrada**: la escena aparece sin transición ni preloader ni cámara de bienvenida. | Media |
| E7 | **Rendimiento**: aviso en consola `THREE.Clock deprecated` (migrar a `THREE.Timer`); falta medir draw calls/instancing con la skill `threejs-performance` antes de añadir detalle. | Media |
| E8 | **Identidad por empresa**: el logo y la paleta de ACITMX no gobiernan la escena (es genérica); las apariencias son presets, no una dirección de arte. | Media |

## 3. Por página (capturas)
| Ruta | Problema principal | Oportunidad |
|---|---|---|
| Inicio | Cuando hay datos solo lista; vacío = recuadro; sin KPIs | Panel de mando: prospectos A hoy, embudo, última corrida, plan, motor activo |
| Prospectos | Filtros en fila con `select` nativos; tabla sin identidad de score | Tabla densa con chip de nivel, barra de score, vista tarjetas, atajos |
| Detalle prospecto | Largo y plano (secciones apiladas) | Cabecera con score, pestañas, línea de tiempo de evidencia, acciones fijas |
| Embudo | Pantalla casi vacía | Kanban real con arrastre y conteos |
| Directorio / Datos | Tablas genéricas | Búsqueda global, filtros guardados |
| Corrida | Formulario correcto pero sin sensación de «lanzamiento»; el motor de IA se añadió como fila suelta | Tarjeta de misión: configuración clara, estimado destacado, progreso en vivo con agentes |
| Edificio | Tarjeta con 5 botones a dos líneas y enlaces pequeños | Vista tipo plano del edificio con piso como objeto; acciones secundarias en menú |
| Biblioteca, Prompts, Habilidades, Aprendizaje, Salidas, Actividad | Listas de texto largas sin jerarquía | Layout de lectura, buscador, vistas de diff, tipografía de lectura |
| Configuración | 11 pestañas; formularios planos | Navegación lateral por secciones con búsqueda |
| Personalizar | Editor 3D potente pero con paneles densos | Panel lateral con vista previa y presets visuales |

## 4. Lo que está bien y se conserva
Contenido y flujos probados (307 pruebas), foco visible, tokens centralizados en `@theme`, animaciones solo con `transform/opacity`, escena con calidad ajustable y modo presentación, `prefers-reduced-motion` en la escena, español claro. El rediseño **no cambia funcionalidad ni API**.

## 5. Brechas de método
- No existe `PRODUCT.md`/`DESIGN.md` (contexto de diseño). Se crean en D0.
- No hay regresión visual: se añade captura de referencia por ruta (antes/después) para no romper nada.
- Los skills de diseño no se han ejecutado todavía contra la app: se hace en D1.
