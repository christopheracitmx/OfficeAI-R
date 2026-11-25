# P7b — Revisión de la skill 3dviz-pro-max y qué se aplicó (2026-11-25)

Skill instalada en `.claude/skills/3dviz-pro-max` (MIT; Markdown, datos y plantillas, scripts Python sin red; ya autorizada por el dueño). Leído: `SKILL.md` completo, `references/subject-clarity-and-motion.md`, `templates/checklists/visual-anti-slop.md` (resto hojeado por título). NO se ejecutaron sus scripts (`search.py`, `capture.py`): el catálogo está orientado a escenas nuevas y objetos; para esta oficina ya existe captura real con `tools/pw-shot`.

## Qué aportó (y se aplicó)
| Idea de la skill | Cambio en la oficina | Costo |
|---|---|---|
| «Make the subject identifiable / spend detail where it survives the camera distance» | Los agentes eran ilegibles en la vista inicial: nombres siempre visibles (antes solo con zoom o selección) y rol al acercar; encuadre por área (selector «Vista»: la cámara centra y acerca la sala); puestos de la fila norte giran para mirar al sur y las caras se ven desde la cámara inicial | 0 draw calls nuevos |
| «Labels should track their subjects… check at the actual viewport size» | Rótulos de sala con tamaño constante en pantalla (98×25 px; el sprite se escala por 1/zoom) en vez de crecer con el zoom | un `useFrame` por rótulo (10) |
| «Tie motion/state to meaning; don't decorate» | Burbujas con significado: «Ficha de la empresa lista → Estratega», «Nueva tarea · Encuentra su sitio web oficial» (antes «Tarea terminada» / ids). Son seguras en modo presentación (sin datos de empresas) | ninguno |
| «Depth/context useful, not scenery for a check» + composición | Paredes perimetrales con ventanas: solo las 2 del fondo (corte dinámico según el giro) para no tapar la vista; vidrio claro de día y azul oscuro de noche; no proyectan sombra | 4 grupos × 2 mallas (2-4 visibles) |
| «Check overview and close-up; real output, never describe an unobserved frame» | Cada cambio validado con capturas reales (Edge/ANGLE D3D11) antes/después y la prueba de humo (`test/p7-humo-3d.mjs`) | — |

## Qué NO se aplicó (y por qué)
- Rediseño de materiales/iluminación: la escena ya tiene luz cálida direccional con sombras, hemisférica, bloom en pantallas y día/noche; cambiar exposición o paleta sin necesidad habría roto el look aprobado por el dueño.
- Blender/assets externos, kits T0-T4, recetas del catálogo: la oficina es 100 % procedural y fusionada en 2 draw calls; importar un kit habría aumentado el chunk (300 kB gzip) sin ganancia.
- Cruces de caminantes en el pasillo: no se resolvió (sigue pendiente como pulido).
