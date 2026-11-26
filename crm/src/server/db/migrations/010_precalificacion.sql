-- Precalificación por código de los registros de los datasets locales (sin IA): orden y filtro previos a los agentes.
ALTER TABLE dataset_registros ADD COLUMN pre_score INTEGER;
ALTER TABLE dataset_registros ADD COLUMN pre_descarte TEXT;
ALTER TABLE dataset_registros ADD COLUMN pre_desglose TEXT;
CREATE INDEX idx_dataset_pre ON dataset_registros (fuente_id, pre_score);
