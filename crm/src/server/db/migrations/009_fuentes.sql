-- P11: fuentes de descubrimiento gratuitas (DENUE, OSM, Overture). Conserva TODOS los datos.
-- 1) empresas: se reconstruye para ampliar el CHECK de metodo_descubrimiento y añadir campos de fuente.
CREATE TABLE empresas_nueva (
  id INTEGER PRIMARY KEY,
  place_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  metodo_descubrimiento TEXT NOT NULL DEFAULT 'places' CHECK (metodo_descubrimiento IN
    ('places','nicho_web','directorio_publico','parque_industrial','noticia_expansion','hallazgo_oportunista','referido','manual',
     'denue_local','denue_api','osm_overpass','overture_local')),
  origen_url TEXT,
  origen_nota TEXT,
  etapa TEXT NOT NULL DEFAULT 'descubierta' CHECK (etapa IN
    ('descubierta','filtrada','enriquecida','analizada','prospecto','descartada')),
  giro_id INTEGER REFERENCES taxonomia_giros(id),
  direccion TEXT,
  municipio TEXT,
  codigo_postal TEXT,
  ciudad TEXT,
  estado_mx TEXT,
  zona TEXT,
  sitio_web TEXT,
  sitio_verificado INTEGER NOT NULL DEFAULT 0 CHECK (sitio_verificado IN (0,1)),
  dominio TEXT,
  tamano TEXT CHECK (tamano IN ('micro','pequena','mediana','grande')),
  sucursales INTEGER,
  resumen TEXT,
  corrida_id INTEGER REFERENCES corridas(id),
  descartada_motivo TEXT,
  fusionada_con INTEGER REFERENCES empresas(id),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  -- P11: datos que aportan las fuentes (con la fuente de cada campo en campos_fuente, JSON {campo: fuente_id})
  nombre_norm TEXT,
  fuente_id TEXT,
  scian TEXT,
  estrato INTEGER,
  personal_est INTEGER,
  telefono TEXT,
  correo TEXT,
  lat REAL,
  lng REAL,
  campos_fuente TEXT
);
INSERT INTO empresas_nueva (id, place_id, nombre, metodo_descubrimiento, origen_url, origen_nota, etapa, giro_id,
    direccion, municipio, codigo_postal, ciudad, estado_mx, zona, sitio_web, sitio_verificado, dominio, tamano,
    sucursales, resumen, corrida_id, descartada_motivo, fusionada_con, creado_en, actualizado_en, office_id)
  SELECT id, place_id, nombre, metodo_descubrimiento, origen_url, origen_nota, etapa, giro_id,
    direccion, municipio, codigo_postal, ciudad, estado_mx, zona, sitio_web, sitio_verificado, dominio, tamano,
    sucursales, resumen, corrida_id, descartada_motivo, fusionada_con, creado_en, actualizado_en, office_id
  FROM empresas;
DROP TABLE empresas;
ALTER TABLE empresas_nueva RENAME TO empresas;
CREATE INDEX idx_empresas_dominio ON empresas(dominio);
CREATE INDEX idx_empresas_zona ON empresas(zona);
CREATE INDEX idx_empresas_etapa ON empresas(etapa);
CREATE INDEX idx_empresas_office ON empresas (office_id, etapa);
CREATE INDEX idx_empresas_nombre_norm ON empresas (office_id, nombre_norm);
CREATE INDEX idx_empresas_telefono ON empresas (office_id, telefono);
CREATE INDEX idx_empresas_fuente ON empresas (office_id, fuente_id);

-- 2) Qué fuente aportó qué a cada empresa (atribución y licencia por registro).
CREATE TABLE empresa_fuentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  fuente_id TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  url TEXT,
  licencia TEXT NOT NULL,
  atribucion TEXT NOT NULL,
  campos_json TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  UNIQUE (empresa_id, fuente_id, registro_id)
);
CREATE INDEX idx_empresa_fuentes_reg ON empresa_fuentes (office_id, fuente_id, registro_id);

-- 3) Activación por oficina y contadores/cuotas por fuente (el tope mensual vive en configuracion: fuente_tope_<id>).
CREATE TABLE fuentes_config (
  fuente_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  activa INTEGER NOT NULL CHECK (activa IN (0,1)),
  PRIMARY KEY (fuente_id, office_id)
);
CREATE TABLE fuentes_uso (
  fuente_id TEXT NOT NULL,
  mes TEXT NOT NULL,
  contador INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (fuente_id, mes)
);

-- 4) Datasets locales (DENUE, Overture): una sola tabla, filtrada a CDMX/Edomex y sin gobierno.
CREATE TABLE dataset_meta (
  fuente_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  fecha_dataset TEXT,
  importado_en TEXT NOT NULL,
  registros INTEGER NOT NULL,
  descartados INTEGER NOT NULL DEFAULT 0,
  archivo TEXT,
  nota TEXT
);
CREATE TABLE dataset_registros (
  fuente_id TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  nombre_norm TEXT NOT NULL,
  scian TEXT,
  categoria TEXT,
  giro TEXT NOT NULL DEFAULT 'Otro',
  estrato INTEGER,
  personal_est INTEGER,
  direccion TEXT,
  codigo_postal TEXT,
  municipio TEXT,
  municipio_norm TEXT,
  estado_mx TEXT,
  telefono TEXT,
  correo TEXT,
  sitio_web TEXT,
  lat REAL,
  lng REAL,
  licencia TEXT NOT NULL,
  atribucion TEXT NOT NULL,
  url TEXT,
  PRIMARY KEY (fuente_id, registro_id)
);
CREATE INDEX idx_dataset_nombre ON dataset_registros (fuente_id, nombre_norm);
CREATE INDEX idx_dataset_municipio ON dataset_registros (fuente_id, municipio_norm);
CREATE INDEX idx_dataset_scian ON dataset_registros (fuente_id, scian);
CREATE INDEX idx_dataset_giro ON dataset_registros (fuente_id, giro);
CREATE INDEX idx_dataset_cp ON dataset_registros (fuente_id, codigo_postal);

-- 5) Bitácora de lo que cada fuente aportó en cada consulta/corrida (panel de Corrida).
CREATE TABLE candidatos_fuente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  corrida_id INTEGER REFERENCES corridas(id),
  fuente_id TEXT NOT NULL,
  consulta TEXT NOT NULL,
  encontrados INTEGER NOT NULL DEFAULT 0,
  nuevos INTEGER NOT NULL DEFAULT 0,
  fusionados INTEGER NOT NULL DEFAULT 0,
  rechazados INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL CHECK (estado IN ('ok','sin_datos','quota_exceeded','error','omitida')),
  detalle TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_candidatos_fuente_corrida ON candidatos_fuente (office_id, corrida_id);
