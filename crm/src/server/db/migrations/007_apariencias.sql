-- P9: Personalizador. Capas de apariencia por entidad (personaje|sala|oficina) con historial completo
-- (cada guardado es una versión; `vigente` marca la actual, `descartada` las que quedaron fuera al
-- guardar tras deshacer) y presets (builtin globales + propios de cada oficina). Solo tablas nuevas:
-- no toca ningún dato existente. El JSON de una capa es {"preset": id|null, "overrides": {...}}.
CREATE TABLE apariencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  entidad TEXT NOT NULL CHECK (entidad IN ('personaje','sala','oficina')),
  entidad_id TEXT NOT NULL,
  json TEXT NOT NULL,
  version INTEGER NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1 CHECK (vigente IN (0,1)),
  descartada INTEGER NOT NULL DEFAULT 0 CHECK (descartada IN (0,1)),
  nota TEXT,
  creado_en TEXT NOT NULL,
  UNIQUE (office_id, entidad, entidad_id, version)
);
CREATE UNIQUE INDEX idx_apariencias_vigente
  ON apariencias (office_id, entidad, entidad_id) WHERE vigente = 1;

CREATE TABLE presets_apariencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('personaje','sala','oficina')),
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
  json TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0,1)),
  -- NULL = global (visible en todas las oficinas); si no, solo de esa oficina.
  office_id TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_presets_tipo ON presets_apariencia (tipo, office_id);
