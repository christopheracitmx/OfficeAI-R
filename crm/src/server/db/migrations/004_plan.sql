-- P7b: medidor de suscripción y reserva. Estado de límites del plan que informa el CLI, modelo por paso.

-- Permite el estado 'pausada_reserva_plan': SQLite no altera CHECK, se reconstruye la tabla
-- (migrate() desactiva foreign_keys mientras corre cada migración; ver 12 pasos de la doc de SQLite).
CREATE TABLE corridas_nueva (
  id INTEGER PRIMARY KEY,
  zona TEXT NOT NULL,
  giro TEXT NOT NULL,
  max_empresas INTEGER NOT NULL CHECK (max_empresas BETWEEN 1 AND 50),
  motor TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso','terminada','detenida','pausada_limite_plan','pausada_cuota_places','pausada_reserva_plan','error')),
  motivo_fin TEXT,
  iniciada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  terminada_en TEXT,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  params TEXT
);
INSERT INTO corridas_nueva (id, zona, giro, max_empresas, motor, estado, motivo_fin, iniciada_en, terminada_en, office_id, params)
  SELECT id, zona, giro, max_empresas, motor, estado, motivo_fin, iniciada_en, terminada_en, office_id, params FROM corridas;
DROP TABLE corridas;
ALTER TABLE corridas_nueva RENAME TO corridas;

-- Último estado conocido de cada ventana del plan (five_hour, seven_day), tal como lo emite el CLI.
CREATE TABLE limites_plan (
  ventana TEXT PRIMARY KEY,
  utilizacion REAL,                 -- 0..1 si el CLI lo informa; NULL si no
  reinicia_en INTEGER,              -- epoch en segundos
  estado TEXT NOT NULL,             -- allowed | allowed_warning | rejected
  modelo TEXT,                      -- modelo de la llamada que emitió el dato
  actualizado_en TEXT NOT NULL
);

ALTER TABLE salidas_agente ADD COLUMN modelo TEXT;
