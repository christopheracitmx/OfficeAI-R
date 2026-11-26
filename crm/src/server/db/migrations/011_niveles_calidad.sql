-- Niveles por score: A >= 80, B 60-79, C < 60 (objetivo del dueño: base llena de prospectos clase A).
UPDATE prospectos SET nivel = CASE WHEN score >= 80 THEN 'A' WHEN score >= 60 THEN 'B' ELSE 'C' END WHERE score IS NOT NULL;
