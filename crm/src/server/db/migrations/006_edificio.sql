-- P8-edificio: Edificio -> Pisos -> Oficinas. Tabla `oficinas` (una fila por piso, nunca se borra físicamente)
-- y office_id en lo que faltaba (empresas, prospectos, busquedas_realizadas). Conserva todos los datos:
-- lo existente pertenece a 'prospeccion' (DEFAULT). Sin FK nuevas (SQLite no las admite en ALTER con default).
CREATE TABLE oficinas (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 40 AND id NOT GLOB '*[^a-z0-9_-]*'),
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  icono TEXT NOT NULL DEFAULT 'building',
  orden INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','archivada')),
  plantilla_origen TEXT,
  -- Planta 3D (esquema zod de shared/oficina3d). NULL = se genera al arrancar o una planta mínima.
  definicion_json TEXT,
  -- 'archivo:<carpeta>' (config/offices/<carpeta>/workflow.json) o 'bd' (workflow_json, editable en la UI avanzada).
  workflow_ref TEXT NOT NULL DEFAULT 'bd',
  workflow_json TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_oficinas_orden ON oficinas (estado, orden, id);

INSERT INTO oficinas (id, nombre, descripcion, icono, orden, workflow_ref)
VALUES ('prospeccion', 'Oficina de prospección',
        'Descubre, investiga, califica y reporta prospectos B2B para el equipo de ventas.',
        'search', 1, 'archivo:prospeccion');

ALTER TABLE empresas ADD COLUMN office_id TEXT NOT NULL DEFAULT 'prospeccion';
ALTER TABLE prospectos ADD COLUMN office_id TEXT NOT NULL DEFAULT 'prospeccion';
ALTER TABLE busquedas_realizadas ADD COLUMN office_id TEXT NOT NULL DEFAULT 'prospeccion';
CREATE INDEX idx_empresas_office ON empresas (office_id, etapa);
CREATE INDEX idx_prospectos_office ON prospectos (office_id, estado);
CREATE INDEX idx_corridas_office ON corridas (office_id, estado);
