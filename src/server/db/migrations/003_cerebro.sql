-- P6: cerebro de la oficina (Biblioteca, prompts editables, habilidades, lecciones, registro de cambios). Todo por office_id.

CREATE TABLE kb_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  tipo TEXT NOT NULL CHECK (tipo IN ('producto','giro','oficinas','voz','objeciones','reglas','glosario','lista','otro')),
  titulo TEXT NOT NULL,
  contenido_md TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (office_id, titulo)
);
CREATE INDEX idx_kb_doc_office ON kb_documentos (office_id, tipo, activo);

CREATE TABLE kb_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES kb_documentos (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  contenido_md TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  nota TEXT,
  creado_en TEXT NOT NULL,
  UNIQUE (documento_id, version)
);

-- Catálogo por marca/familia. SIN precios (el servidor rechaza montos).
CREATE TABLE kb_productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  marca TEXT NOT NULL,
  familia TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  casos_uso TEXT NOT NULL DEFAULT '',
  giros_ideales TEXT NOT NULL DEFAULT '',
  argumentos_valor TEXT NOT NULL DEFAULT '',
  advertencias TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (office_id, marca, familia)
);

CREATE TABLE agentes (
  office_id TEXT NOT NULL,
  id TEXT NOT NULL,
  nombre_ui TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  genero TEXT NOT NULL DEFAULT 'f' CHECK (genero IN ('f','m')),
  rol TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (office_id, id)
);

-- Una fila por versión; activo=1 en la vigente. `prompt` = nombre del prompt del workflow (p. ej. 'rastreador').
CREATE TABLE prompts_agente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  version INTEGER NOT NULL,
  texto TEXT NOT NULL,
  nota TEXT,
  activo INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL,
  UNIQUE (office_id, prompt, version)
);
CREATE INDEX idx_prompts_activo ON prompts_agente (office_id, prompt, activo);

CREATE TABLE prompt_global (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  texto TEXT NOT NULL,
  nota TEXT,
  activo INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL,
  UNIQUE (office_id, version)
);

CREATE TABLE habilidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  contenido_md TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  base INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (office_id, nombre)
);

CREATE TABLE habilidades_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habilidad_id INTEGER NOT NULL REFERENCES habilidades (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  contenido_md TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  UNIQUE (habilidad_id, version)
);

CREATE TABLE agente_habilidades (
  office_id TEXT NOT NULL,
  agente TEXT NOT NULL,
  habilidad_id INTEGER NOT NULL REFERENCES habilidades (id) ON DELETE CASCADE,
  PRIMARY KEY (office_id, agente, habilidad_id)
);

-- Solo las aprobadas se inyectan en el prompt (máx. 10 por agente). Se alimenta en P6.5.
CREATE TABLE lecciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  agente TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('acierto','error')),
  texto TEXT NOT NULL,
  evidencia TEXT,
  estado TEXT NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta','aprobada','archivada')),
  origen TEXT NOT NULL DEFAULT 'manual',
  creado_en TEXT NOT NULL
);

CREATE TABLE cambios_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_ref TEXT,
  accion TEXT NOT NULL,
  detalle TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_cambios_office ON cambios_log (office_id, id DESC);

-- P6.4: más detalle por salida (tamaño del prompt, turnos, herramientas usadas) y una fila por rol de cada paso.
ALTER TABLE salidas_agente ADD COLUMN rol TEXT;
ALTER TABLE salidas_agente ADD COLUMN prompt_tokens INTEGER;
ALTER TABLE salidas_agente ADD COLUMN turnos INTEGER;
ALTER TABLE salidas_agente ADD COLUMN herramientas TEXT;
