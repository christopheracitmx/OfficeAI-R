# Save Point P10a - Herramientas, datos y paquetes

Estado: P10a completa (backend + UI + tests). P10b (Constructor "Nuevo piso") en curso: solo núcleo hecho.

## Hecho
- Migración 008 (colecciones, registros+historial, archivos_carpetas/log, avisos_email, constructor_sesiones; columnas en oficinas). Datos preservados (test con BD de archivo).
- Colecciones tipadas con dedup, archivo (sin borrado), CSV protegido, MCP coleccion_listar/buscar/upsert.
- archivos_* en sandbox con cuarentena reversible; apagado por defecto.
- notificar_interno envía correo (outbox, guardia, tope 10/h) si el piso lo activa.
- Catálogo único (src/shared/catalogo.ts), candados (solo topes_consumo relajable, con confirmación y cambios_log).
- Paquetes JSON (sin ZIP, sin dependencias nuevas) + galería (Vacía, Base de datos, Archivos/CRM, Noticias).
- UI: /datos, Configuración > Herramientas del piso, Edificio > Galería e importar / Exportar paquete.
- Núcleo Constructor: src/shared/constructor.ts, oficina3d/generar.ts, services/constructor-compilar.ts, constructor-prompts.ts.

## Gates
tsc, eslint 0 warnings, vitest 244 pasan, build, audit 0, depcheck, madge OK; react-doctor sin críticos/altos (solo avisos de estilo, mismas clases que el código previo).

## Pendiente (P10b)
1. Prompt versionado "Arquitecta de oficinas" (prompts_agente office '_edificio').
2. Servicio de sesiones + motor (llamarLibre, sonnet/low, 1 llamada por turno, borradorCompacto, motivoReserva, estimado) + modo formulario sin IA.
3. Rutas del Constructor (iniciar, turno, editar borrador, vista previa/compilar, prueba controlada, crear con aprobación; relajar candados con confirmación).
4. UI "Nuevo piso" 9 fases + vista previa 3D.
5. Tests con CLI simulado (test/fixtures/fake-claude.mjs), humo 3D puerto 4099 con capturas en docs/dungeons/04-execution/capturas-p10/.
6. Quality Gate final, pre-deploy, meta-dungeon, GUIA, README, Save Point final.

## Prompt de reanudación
Eres Master Dungeons. Lee este Save Point y microsteps.yaml (P10b-2..4). Continúa P10b desde el motor del Constructor. Sin push; commits con trailer Co-Authored-By: Claude Sonnet 5.5; BD real 4010 intocable; pruebas en 4099 con BD temporal.
