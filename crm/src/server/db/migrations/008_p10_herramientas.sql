-- P10a: herramientas genéricas (colecciones, archivos seguros, avisos por correo) y ajustes por oficina.
-- Solo tablas nuevas y columnas con DEFAULT: conserva todos los datos existentes. Nada se borra físicamente.
CREATE TABLE colecciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 60),
  descripcion TEXT NOT NULL DEFAULT '',
  -- Esquema: [{nombre, etiqueta, tipo, requerido, opciones?}] (validado con zod en el servidor).
  campos_json TEXT NOT NULL,
  -- Campo cuyo valor identifica un registro (deduplicación); NULL = sin deduplicación.
  clave TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','archivada')),
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (office_id, nombre)
);
CREATE INDEX idx_colecciones_office ON colecciones (office_id, estado);

CREATE TABLE coleccion_registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coleccion_id INTEGER NOT NULL REFERENCES colecciones (id),
  office_id TEXT NOT NULL,
  datos_json TEXT NOT NULL,
  -- Valor normalizado del campo clave (NULL si la colección no deduplica).
  clave_valor TEXT,
  fuente_url TEXT,
  nota TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','archivado')),
  version INTEGER NOT NULL DEFAULT 1,
  creado_por TEXT NOT NULL DEFAULT 'dueño',
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX idx_registros_coleccion ON coleccion_registros (coleccion_id, estado, id);
CREATE UNIQUE INDEX idx_registros_clave
  ON coleccion_registros (coleccion_id, clave_valor) WHERE clave_valor IS NOT NULL;

CREATE TABLE coleccion_registros_hist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registro_id INTEGER NOT NULL REFERENCES coleccion_registros (id),
  version INTEGER NOT NULL,
  datos_json TEXT NOT NULL,
  fuente_url TEXT,
  nota TEXT,
  accion TEXT NOT NULL,
  actor TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  UNIQUE (registro_id, version)
);

-- Carpetas que el dueño autoriza a los agentes de una oficina (ruta absoluta). Desactivadas por defecto.
CREATE TABLE archivos_carpetas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  ruta TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  UNIQUE (office_id, ruta)
);

CREATE TABLE archivos_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  accion TEXT NOT NULL,
  ruta TEXT NOT NULL,
  destino TEXT,
  detalle TEXT,
  agente TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_archivos_log_office ON archivos_log (office_id, id);

-- Avisos por correo de las oficinas (outbox: se guarda ANTES de enviar). Solo a destinatarios internos.
CREATE TABLE avisos_email (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL,
  agente TEXT,
  destinatario TEXT NOT NULL,
  asunto TEXT NOT NULL,
  texto TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','fallido')),
  resend_id TEXT,
  error TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX idx_avisos_office ON avisos_email (office_id, id);

-- Ajustes por oficina: herramientas MCP permitidas (NULL = las de la plantilla base), archivos, correo.
ALTER TABLE oficinas ADD COLUMN herramientas_json TEXT;
ALTER TABLE oficinas ADD COLUMN archivos_activo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE oficinas ADD COLUMN correo_activo INTEGER NOT NULL DEFAULT 0;
-- Candados relajados por el dueño (JSON con la lista de candados opcionales desactivados). NULL = todos activos.
ALTER TABLE oficinas ADD COLUMN candados_json TEXT;

-- Asistente «Nuevo piso» (Constructor): sesiones con el borrador de especificación estructurado.
CREATE TABLE constructor_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','creada','descartada')),
  modo TEXT NOT NULL DEFAULT 'ia' CHECK (modo IN ('ia','formulario')),
  fase INTEGER NOT NULL DEFAULT 1,
  borrador_json TEXT NOT NULL,
  mensajes_json TEXT NOT NULL DEFAULT '[]',
  turnos INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  office_id TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
