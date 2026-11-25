-- ACITMX Prospecting Office — esquema SQLite v1 (borrador capa 15)
-- Reglas: FKs activas (PRAGMA foreign_keys=ON), timestamps UTC ISO-8601, sin borrado físico
-- (descartar = cambiar estado), SIN columnas de precio (los precios son del equipo de ventas),
-- SIN lat/lng de Places (no se necesitan; evita el límite de caché de Google).

PRAGMA foreign_keys = ON;

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Semillas: max_empresas_por_corrida=10, places_tope_pro=4900,
--           zonas_piloto=["CDMX","Estado de México"], motor_ia=claude-code  (el motor real lo lee config/engine.yaml; esto es espejo para la UI)

CREATE TABLE destinatarios_internos (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Semilla: christopher.rodriguez@acitmx.com

CREATE TABLE no_contactar (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('dominio','correo','telefono','nombre')),
  valor TEXT NOT NULL COLLATE NOCASE,
  motivo TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tipo, valor)
);

CREATE TABLE taxonomia_giros (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);
-- Semilla propuesta: Manufactura, Logística y transporte, Educación privada, Salud privada,
-- Corporativo/Servicios profesionales, Retail y comercio, Hotelería y turismo, Agroindustria,
-- Construcción e inmobiliaria, Financiero y seguros, Tecnología y telecom, Alimentos y bebidas, Otro

CREATE TABLE corridas (
  id INTEGER PRIMARY KEY,
  zona TEXT NOT NULL,
  giro TEXT NOT NULL,
  max_empresas INTEGER NOT NULL CHECK (max_empresas BETWEEN 1 AND 50),
  motor TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso','terminada','detenida','pausada_limite_plan','pausada_cuota_places','error')),
  motivo_fin TEXT,
  iniciada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  terminada_en TEXT
);

-- Contador de cuota de Places por mes (tope duro en código). Solo se usa el SKU Pro de descubrimiento.
CREATE TABLE places_uso (
  mes TEXT NOT NULL,                       -- 'YYYY-MM'
  sku TEXT NOT NULL CHECK (sku IN ('pro')),
  contador INTEGER NOT NULL DEFAULT 0 CHECK (contador >= 0),
  PRIMARY KEY (mes, sku)
);

CREATE TABLE empresas (
  id INTEGER PRIMARY KEY,
  place_id TEXT UNIQUE,                    -- NULL si no vino de Places
  nombre TEXT NOT NULL,
  metodo_descubrimiento TEXT NOT NULL DEFAULT 'places' CHECK (metodo_descubrimiento IN
    ('places','nicho_web','directorio_publico','parque_industrial','noticia_expansion','hallazgo_oportunista','referido','manual')),
  origen_url TEXT,                         -- donde se encontro
  origen_nota TEXT,                        -- ej. 'aparecio investigando a X' / 'proveedor de Y'
  etapa TEXT NOT NULL DEFAULT 'descubierta' CHECK (etapa IN
    ('descubierta','filtrada','enriquecida','analizada','prospecto','descartada')),
  giro_id INTEGER REFERENCES taxonomia_giros(id),
  direccion TEXT,                          -- dirección de Places
  municipio TEXT,                          -- alcaldía/municipio, extraído de la dirección por código (sin gastar Places)
  codigo_postal TEXT,
  ciudad TEXT,
  estado_mx TEXT,
  zona TEXT,                               -- agrupación derivada por código (ej. 'CDMX Norte', 'Edomex - Naucalpan')
  sitio_web TEXT,                          -- lo encuentra el Rastreador con web_search + Obscura
  sitio_verificado INTEGER NOT NULL DEFAULT 0 CHECK (sitio_verificado IN (0,1)),
  dominio TEXT,
  tamano TEXT CHECK (tamano IN ('micro','pequena','mediana','grande')),
  sucursales INTEGER,
  resumen TEXT,
  corrida_id INTEGER REFERENCES corridas(id),
  descartada_motivo TEXT,                  -- gobierno | no_contactar | no_b2b | duplicada | otro
  fusionada_con INTEGER REFERENCES empresas(id),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_empresas_dominio ON empresas(dominio);
CREATE INDEX idx_empresas_zona ON empresas(zona);
CREATE INDEX idx_empresas_etapa ON empresas(etapa);

-- Directorio propio: lo ya buscado no se vuelve a buscar (ahorra tokens y cuota)
CREATE TABLE busquedas_realizadas (
  id INTEGER PRIMARY KEY,
  corrida_id INTEGER REFERENCES corridas(id),
  metodo TEXT NOT NULL,                    -- places | web_search | obscura_directorio | ...
  consulta TEXT NOT NULL,
  resultados INTEGER NOT NULL DEFAULT 0,
  nuevas_empresas INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (metodo, consulta)
);

-- Cache local de paginas leidas con Obscura (texto compacto, no HTML crudo)
CREATE TABLE paginas_cache (
  url TEXT PRIMARY KEY,
  texto_compacto TEXT NOT NULL,
  emails TEXT,                             -- JSON, extraidos por regex en codigo
  telefonos TEXT,                          -- JSON, extraidos por regex en codigo
  hash TEXT,
  obtenida_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE contactos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('telefono','correo','persona')),
  valor TEXT NOT NULL,
  nombre TEXT,
  puesto TEXT,
  fuente_url TEXT NOT NULL,                -- obligatorio: sin fuente no se guarda
  fecha_fuente TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (empresa_id, tipo, valor)
);

CREATE TABLE necesidades (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('evidencia','inferencia'))
);

CREATE TABLE prospectos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id),
  corrida_id INTEGER REFERENCES corridas(id),
  estado TEXT NOT NULL DEFAULT 'Nuevo' CHECK (estado IN
    ('Nuevo','Calificado','Reportado','Canalizado','En contacto','Propuesta',
     'Ganado','Perdido','Descartado','Revision humana')),
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  nivel TEXT CHECK (nivel IN ('A','B','C')),
  score_desglose TEXT,                     -- JSON {ajuste, necesidad, contacto, cercania, capacidad}
  justificacion TEXT,
  reporte_md TEXT,                         -- reporte completo "Oye jefe..." (fallback si el correo no llega)
  borrador_correo TEXT,                    -- borrador para el vendedor
  canalizado_a TEXT,                       -- texto libre, lo escribe el dueño
  notas_dueno TEXT,
  devoluciones_qa1 INTEGER NOT NULL DEFAULT 0,
  devoluciones_qa2 INTEGER NOT NULL DEFAULT 0,
  visto_por_dueno INTEGER NOT NULL DEFAULT 0 CHECK (visto_por_dueno IN (0,1)),
  reportado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_prospectos_estado ON prospectos(estado);
CREATE INDEX idx_prospectos_score ON prospectos(score);

CREATE TABLE propuestas_producto (
  id INTEGER PRIMARY KEY,
  prospecto_id INTEGER NOT NULL REFERENCES prospectos(id),
  marca TEXT NOT NULL CHECK (marca IN ('Lenovo','Aruba')),
  categoria TEXT NOT NULL,
  razon TEXT NOT NULL,
  prioridad TEXT NOT NULL CHECK (prioridad IN ('alta','media','baja'))
);

CREATE TABLE paquetes (
  id INTEGER PRIMARY KEY,
  prospecto_id INTEGER NOT NULL REFERENCES prospectos(id),
  nombre TEXT NOT NULL,
  componentes TEXT NOT NULL,               -- JSON array de categorías
  argumento TEXT NOT NULL,
  dirigido_a TEXT,
  orden INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE revisiones_qa (
  id INTEGER PRIMARY KEY,
  prospecto_id INTEGER NOT NULL REFERENCES prospectos(id),
  etapa TEXT NOT NULL CHECK (etapa IN ('qa1','qa2')),
  aprobado INTEGER NOT NULL CHECK (aprobado IN (0,1)),
  devolver_a TEXT,
  motivos TEXT,                            -- JSON array
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Patrón outbox: el prospecto se guarda ANTES de enviar. El correo es solo una alerta.
CREATE TABLE envios_email (
  id INTEGER PRIMARY KEY,
  prospecto_id INTEGER NOT NULL REFERENCES prospectos(id),
  destinatario TEXT NOT NULL,              -- copia del correo al momento del envío
  resend_id TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','fallido')),
  error TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE actividad_agentes (
  id INTEGER PRIMARY KEY,
  corrida_id INTEGER REFERENCES corridas(id),
  agente TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id INTEGER,
  detalle TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_actividad_corrida ON actividad_agentes(corrida_id);
