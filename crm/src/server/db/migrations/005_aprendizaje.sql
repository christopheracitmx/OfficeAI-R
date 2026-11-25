-- P6.5: retroalimentación, lecciones versionadas, casos dorados y evaluaciones. Todo por office_id.
-- Conserva los datos existentes: solo agrega columnas y tablas nuevas.

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  prospecto_id INTEGER REFERENCES prospectos (id),
  empresa_id INTEGER REFERENCES empresas (id),
  etapa TEXT NOT NULL,                 -- contactos | ficha | paquetes | reporte | qa1 | qa2 | resultado | otro
  agente TEXT,                         -- rol al que se atribuye (puede ser NULL en resultados generales)
  valor INTEGER NOT NULL CHECK (valor IN (-1, 0, 1)),
  etiqueta TEXT,
  nota TEXT,
  origen TEXT NOT NULL CHECK (origen IN ('qa','resultado','manual')),
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_feedback_office ON feedback (office_id, agente, id DESC);
CREATE INDEX idx_feedback_prospecto ON feedback (prospecto_id);

-- lecciones: versiones, edición y fechas (tabla creada en P6; las filas existentes se conservan).
ALTER TABLE lecciones ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lecciones ADD COLUMN actualizado_en TEXT;
ALTER TABLE lecciones ADD COLUMN nota TEXT;
UPDATE lecciones SET actualizado_en = creado_en WHERE actualizado_en IS NULL;
CREATE INDEX idx_lecciones_office ON lecciones (office_id, agente, estado);

CREATE TABLE lecciones_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leccion_id INTEGER NOT NULL REFERENCES lecciones (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  texto TEXT NOT NULL,
  estado TEXT NOT NULL,
  accion TEXT NOT NULL,                -- creada | editada | aprobada | archivada | descartada | fusionada | restaurada
  nota TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_lec_hist ON lecciones_historial (leccion_id, id);

-- Casos dorados: expedientes de ejemplo con criterios verificables por código.
CREATE TABLE casos_dorados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  nombre TEXT NOT NULL,
  agente TEXT NOT NULL,                -- rol cuyo resultado se evalúa
  paso TEXT NOT NULL,                  -- paso del workflow cuyo prompt se usa
  entrada TEXT NOT NULL,               -- expediente de ejemplo (texto)
  salida_esperada TEXT NOT NULL DEFAULT '',
  criterios TEXT NOT NULL DEFAULT '[]',-- JSON [{tipo, valor?}]
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (office_id, nombre)
);

CREATE TABLE evaluaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  etiqueta TEXT NOT NULL,
  cambio TEXT,                         -- texto de prompt/lección evaluado (NULL = línea base)
  modo TEXT NOT NULL DEFAULT 'real',
  modelo TEXT,
  casos INTEGER NOT NULL DEFAULT 0,
  aprobados INTEGER NOT NULL DEFAULT 0,
  criterios_total INTEGER NOT NULL DEFAULT 0,
  criterios_ok INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'terminada',
  nota TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_eval_office ON evaluaciones (office_id, id DESC);

CREATE TABLE evaluaciones_casos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluacion_id INTEGER NOT NULL REFERENCES evaluaciones (id) ON DELETE CASCADE,
  caso_id INTEGER NOT NULL,
  caso_nombre TEXT NOT NULL,
  salida TEXT NOT NULL DEFAULT '',
  resultados TEXT NOT NULL DEFAULT '[]', -- JSON [{criterio, ok, detalle}]
  ok INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_eval_casos ON evaluaciones_casos (evaluacion_id);
