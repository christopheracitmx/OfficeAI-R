-- P5: plataforma por oficinas. office_id con 'prospeccion' por defecto (la primera oficina),
-- parámetros de corrida genéricos (JSON) y salidas por agente (alimenta el panel del agente, P6.4).
ALTER TABLE corridas ADD COLUMN office_id TEXT NOT NULL DEFAULT 'prospeccion';
ALTER TABLE corridas ADD COLUMN params TEXT;
UPDATE corridas SET params = json_object('zona', zona, 'giro', giro, 'max_empresas', max_empresas)
  WHERE params IS NULL;

ALTER TABLE actividad_agentes ADD COLUMN office_id TEXT NOT NULL DEFAULT 'prospeccion';
CREATE INDEX idx_actividad_office ON actividad_agentes(office_id, id);

CREATE TABLE salidas_agente (
  id INTEGER PRIMARY KEY,
  office_id TEXT NOT NULL DEFAULT 'prospeccion',
  corrida_id INTEGER REFERENCES corridas(id),
  agente TEXT NOT NULL,
  paso TEXT NOT NULL,
  item_id INTEGER,                         -- elemento de trabajo (en prospección: empresa_id)
  tipo TEXT NOT NULL DEFAULT 'paso',
  resumen TEXT,
  contenido TEXT,
  tokens_estimados INTEGER,
  duracion_ms INTEGER,
  resultado TEXT NOT NULL CHECK (resultado IN ('ok','fallo','timeout','limite','abortado')),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_salidas_corrida ON salidas_agente(corrida_id);
CREATE INDEX idx_salidas_agente ON salidas_agente(office_id, agente, id);
