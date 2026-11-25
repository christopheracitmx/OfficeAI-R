# OfficeAI-R — Oficina virtual de agentes de IA (3D)

Plataforma local para operar "oficinas" de agentes de IA con un mini-CRM, una oficina 3D (Three.js) y un runner propio
que usa tu suscripción de Claude Code. La primera oficina es la de **prospección B2B de ACITMX** (Lenovo y Aruba);
la arquitectura es dirigida por datos para crear más oficinas (pisos) con otros flujos.

## Estructura
- `crm/` — aplicación (Express + SQLite + React + Three.js, MCP para agentes, runner). Ver `crm/package.json`.
- `docs/dungeons/` — documentación por capas (metodología Dungeons): especificación, decisiones, Save Points.
- `GUIA-PUESTA-EN-MARCHA.md` — cómo instalar y operar. `iniciar-crm.bat` — arranque en Windows.
- `CONFIGURACION-MUNDER.md` — referencia histórica (Munder Difflin ya no se usa).

## No incluido en el repositorio
`tools/` (Node portable, Obscura y clones de referencia), `.env` (claves), `crm/data/` (base SQLite, token del agente) y
skills de terceros en `.claude/`. Reinstálalos siguiendo la guía; crea `crm/.env` desde `crm/.env.example`.

## Seguridad
Los agentes son asistentes internos: no contactan prospectos ni mencionan precios; los correos salen solo a los
destinatarios internos configurados. El servidor escucha únicamente en `127.0.0.1`.

Estado: en desarrollo activo (ver el último Save Point en `docs/dungeons/SAVEPOINTS/`). Sin licencia definida todavía.
