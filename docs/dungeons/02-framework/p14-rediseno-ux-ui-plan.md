# P14 — Rediseño UX/UI y 3D (planeación, capa 02)

Estado: **PLANEADO, sin código.** Entrada: `01-audit/audit-ux-ui.md`. Alcance: solo frontend (`crm/src/web`, estilos, escena 3D). **No** cambia API, base de datos, agentes ni lógica; las 307 pruebas deben seguir en verde. Aplica primero a ACITMX; la copia Roesch Studio hereda el sistema cambiando solo tokens y logo.

## 1. Combo de skills (rol de cada una)
Instaladas el 2026-11-26 en `~/.claude/skills`: frontend-design (Anthropic), impeccable (P. Bakaus), ui-ux-pro-max, frontend-design-deslop (samber), threejs-r3f, threejs-performance, 3d-web-experience, premium-3d-website. Ya estaban: design-taste-frontend (taste v2.5), hallmark, design-motion-principles, designer-md, 3dviz-pro-max.

| Etapa | Skill principal | Apoyo |
|---|---|---|
| Dirección y contexto (PRODUCT.md, DESIGN.md) | impeccable `init`/`shape`/`document`, designer-md | hallmark, frontend-design |
| Auditoría con criterio | impeccable `audit` + `critique` | frontend-design-deslop (anti-slop), taste |
| Sistema (tokens, tipografía, color, espaciado) | ui-ux-pro-max (pares tipográficos, paletas) | impeccable `typeset`/`colorize`/`layout` |
| Componentes y páginas | taste + impeccable `polish` | hallmark para piezas estrella (Inicio) |
| Movimiento | design-motion-principles + impeccable `animate` | — |
| Escena 3D | threejs-r3f, premium-3d-website, 3d-web-experience | 3dviz-pro-max (modelado/materiales), **threejs-performance como gate** |
| Cierre | impeccable `audit`, react-doctor, pw-shot | — |

No instaladas: `interactive-3d-hero-designer` (no existe en skills.sh) y `EnzeD/r3f-skills` (existe como `r3f-interaction`, 3.6K instalaciones; se instala solo si D8-D10 lo necesitan). `premium-3d-website` tiene solo 91 instalaciones: se usa como referencia, no como autoridad.

## 2. Decisiones de dirección que necesita el dueño (D0)
1. **Mundo visual de ACITMX**: sobrio-corporativo (consola de operaciones, oscuro-premium), claro editorial, o híbrido (sidebar y escena oscuros, contenido claro). Se presentan 3 propuestas con capturas antes de elegir.
2. **Tipografía**: par con carácter (display + texto + mono para cifras) cargado en local, sin depender de la PC.
3. **Densidad**: cómoda vs compacta (los analistas usan tablas largas).
4. **Intensidad 3D**: low-poly con luz y glow vs ilustrado (cel-shading). Afecta modelos y rendimiento.
5. **Movimiento**: sobrio (80-200 ms) o expresivo en pantallas estrella.

## 3. Fases y micro-pasos
Cada micro-paso con gate: tsc, eslint, 307 pruebas, build, capturas antes/después y react-doctor 0 critical.

| Fase | Contenido | Entregable |
|---|---|---|
| **D0 Dirección** | PRODUCT.md + DESIGN.md; 3 propuestas visuales; elegir; congelar tokens | DESIGN.md aprobado |
| **D1 Auditoría con skills** | Correr audit/critique/deslop/ui-ux-pro-max sobre las rutas; lista priorizada P0-P3 con captura | `01-audit/audit-skills.md` |
| **D2 Fundaciones** | Tokens (color OKLCH, escala tipográfica, espaciado 4/8, radios, sombras, z-index), fuentes locales, set de iconos (reemplaza glifos), modo oscuro, `prefers-reduced-motion` global | `styles.css` + guía de tokens |
| **D3 Componentes base** | Button, Card, Badge de nivel y score, Input/Select propios, Tabla, Tabs, Dialog, Toast, Skeleton, EmptyState con valor | `ui.tsx` reescrito, mismos props |
| **D4 Navegación y shell** | Sidebar agrupado (Operar / Conocimiento / Sistema), colapsable, buscador de comandos (Ctrl+K), migas, aviso de instalación descartable, selector de piso | Sidebar + layout |
| **D5 Páginas clave** | Inicio (panel de mando con KPIs), Prospectos (tabla densa + tarjetas), Detalle (cabecera de score, pestañas, línea de tiempo), Embudo (kanban), Corrida (misión + progreso en vivo) | 5 páginas |
| **D6 Páginas de gestión** | Edificio, Directorio, Datos, Biblioteca, Prompts, Habilidades, Aprendizaje, Salidas, Actividad, Configuración (navegación lateral), Motor de IA | resto de páginas |
| **D7 Movimiento** | Entradas de página, listas escalonadas, transiciones de estado, contadores, micro-feedback; tabla de duraciones y easing | guía de movimiento |
| **D8 Escena 3D: dirección de arte** | Paleta única por empresa (logo/colores ACITMX), iluminación y ambiente, glow en pantallas, etiquetas y HUD nuevos, preloader y cámara de entrada, migrar `THREE.Clock` a `Timer` | escena base renovada |
| **D9 3D: modelos y personajes** | Nueva familia de personajes (siluetas por rol, accesorios, animaciones idle/trabajo/caminar), muebles y utilería con más detalle, instancing | catálogo 3D v2 |
| **D10 3D: vida y datos** | Efectos de actividad (rayos entre agentes, burbujas, partículas), conexión con el estado de la corrida, edificio multipiso renovado, controles integrados | escena viva |
| **D11 Rendimiento y accesibilidad** | threejs-performance (draw calls, memoria, fps en equipos modestos, calidad automática), contraste AA, teclado, lector de pantalla, reduced-motion | informe |
| **D12 Cierre** | Quality Gate, pre-deploy, capturas finales, guía de diseño, Save Point | SP |

## 4. Reglas de ejecución
- Una fase por sesión; no avanzar sin gate verde y revisión del dueño de las capturas.
- Rama aparte (`rediseno-ux`), commits por micro-paso; nada se sube sin pedirlo.
- Cambios solo visuales: no renombrar props de API ni textos de prueba sin actualizar la prueba correspondiente.
- Presupuesto de plan: Sonnet, capturas con `pw-shot`, sin llamadas a agentes de IA.
- Cada fase actualiza `microsteps.yaml` y deja Component Spec Cards en `04-execution/components/`.

## 5. Riesgos
- **Alcance enorme**: mitigado por fases y por priorizar Inicio, Prospectos, Detalle, Corrida y escena (80 % del impacto).
- **Rendimiento 3D** al subir el detalle: gate D11 y calidad por niveles.
- **Regresiones**: capturas de referencia por ruta antes de empezar (D1).
- **Skills externas**: son instrucciones de terceros que corren con permisos del agente; se eligieron por reputación (instalaciones) y se tratan como guía, no como autoridad.
