# P7a-2 — Revisión de skills de Three.js (2026-11-25)

## Qué se revisó (carpeta aislada `tools/_skills-review/`, NADA instalado en `.claude/skills`)
| Repo | Licencia | Contenido | Ejecutables |
|---|---|---|---|
| `CloudAI-X/threejs-skills` | MIT | 13 SKILL.md (fundamentos, geometría, materiales, luces, r3f, performance, postprocessing, shaders, texturas, loaders, animación, interacción, asset-pipeline) | ninguno (solo Markdown; comandos `npx @gltf-transform` documentados, no aplican: no usamos modelos) |
| `emalorenzo/three-agent-skills` (r3f-best-practices + three-best-practices) | MIT | SKILL.md + reglas `rules/*.md` + documento compilado | dos `.zip` con el mismo Markdown (no se abrieron ni ejecutaron) |
`improve-threejs` no se localizó con certeza; no se usó.

Leídos completos: `r3f-best-practices/SKILL.md`, `threejs-performance`, secciones Performance/Disposal/Common Mistakes de `threejs-react-three-fiber`, Selective Bloom y Common Mistakes de `threejs-postprocessing`. El resto se hojeó por encabezados (asset pipeline, loaders, GLTF y física no aplican: escena 100 % procedural).

Decisión: NO se instalan como skills (aportan, pero como referencia puntual basta; instalarlas añadiría contexto a cada sesión). Se adoptan estas notas:

## Reglas adoptadas en P7a
1. **Nunca `setState` en `useFrame`**: animaciones por refs (`ref.current.rotation.x = …`) y `delta`; el estado de React solo cambia con eventos SSE / selección.
2. `state.clock.elapsedTime` (no `getElapsedTime()`), animaciones con `delta` para que no dependan de la tasa de refresco.
3. **`frameloop="demand"` en pausa** + `invalidate()` tras mutaciones imperativas; `"always"` solo cuando hay actividad. Sin prioridad positiva en `useFrame`.
4. **Geometrías y materiales compartidos** (módulo con caché por color), `dispose={null}` donde se pasan por props; `InstancedMesh`/`Instances` para repetidos (studs, libros, sillas…).
5. `matrixAutoUpdate = false` en mobiliario estático cuando sea posible.
6. `shadows="percentage"` (PCFSoft está obsoleto desde r182); límites ajustados de la cámara de sombras; mapa 2048 en Alta, 1024 en Media, sin sombras en Baja.
7. `dpr` limitado (Alta [1,2], Media [1,1.5], Baja 1) y `PerformanceMonitor` para bajar de calidad si cae el fps.
8. Bloom: EffectComposer de `@react-three/postprocessing` con `luminanceThreshold` alto (≈1) y `mipmapBlur`; solo brillan los materiales emisivos con `toneMapped={false}` (pantallas, lámparas). Solo en calidad Alta.
9. Raycast solo sobre objetos «seleccionables» (agentes, Biblioteca); `stopPropagation` en el clic; cursor pointer al pasar.
10. Rótulos: textura de canvas generada (sin fuentes externas; `drei/Text` descarga una fuente de CDN, se evita) o `Html` de drei para etiquetas con contraste garantizado.
11. Alternar visibilidad en vez de desmontar (calidad, overlays) para no recompilar shaders.
