# Save Point — P12 Instalación desde cero y distribución (2026-11-26)

## Estado
P12 completo. Commits locales (sin push) desde `db5bd73` (feat P12-1/2/3) hasta el `docs(P12)` final.

## Hecho
- `GUIA-INSTALACION.md` (Windows 10/11; macOS/Linux sin verificar) enlazada desde README y GUIA-PUESTA-EN-MARCHA.
- Arranque sin `tools\`: `iniciar-crm.bat` usa `tools\node22` o el Node del sistema (22-24, mensajes en español), lee `CRM_PORT`, ejecuta `npm ci`/build si faltan. `crm/.npmrc` (`ignore-scripts=true`) evita compilar `better-sqlite3`.
- `OBSCURA_BIN` configurable (`src/shared/obscura.ts`); sin binario, el CRM arranca y avisa; el MCP devuelve error claro.
- `CRM_DESTINATARIO_INICIAL` reemplaza al correo fijo del seed; `RESEND_FROM` vacío = `onboarding@resend.dev`. `/api/estado` incluye `diagnostico` (claude, obscura, destinatarios) y la UI lo muestra (barra lateral y Configuración).
- Pisos nuevos sin marca ACITMX (logo solo en Prospección, título y paleta renombrados). `mcp-config.example.json` sin rutas absolutas.
- Verificación en clon limpio: `docs/dungeons/04-execution/verificacion-instalacion.md` (+ capturas-p12).
- Prueba intermitente p8 estabilizada; 5 pruebas nuevas (`p12-instalacion`, p0). Total 290 pasan.

## Pendiente / mejoras
- El dueño decide el `git push` y revisa la guía antes de compartir (ver lista en la entrega).
- Sin verificar: macOS/Linux, Windows ARM, instalación de Git/Node/Claude en equipo virgen, Resend/Places/DENUE reales, asistente IA de Nuevo piso en otra máquina.
- Textos de ACITMX que permanecen por diseño en el piso de Prospección (migración 001, marcas Lenovo/Aruba, correo de alerta «ACITMX · Nuevo prospecto», user agent de OSM).
- Botón de importar datasets en la UI (heredado de P11).

## Reglas vigentes
No push sin autorización. Puerto 4010 y `crm\data\crm.db` reales: nunca tocar en pruebas (4099 con BD temporal). Sin llamadas a Claude real en pruebas. Sin tokens en archivos versionados.

## Prompt de reanudación
Lee este Save Point, `docs/dungeons/00-meta-dungeon/meta-dungeon.yaml` (decisiones_p12) y `docs/dungeons/04-execution/verificacion-instalacion.md`. Si el dueño ya compartió la guía, recoge el feedback de la otra área (qué falló al instalar) y corrige `GUIA-INSTALACION.md`; después, atiende "Pendiente". Commits con trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, sin push, sin Opus.
