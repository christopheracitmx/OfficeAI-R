import { harness as harnessVacio, type H } from './helpers';

const ROSTER = [
  ['Coordinador', 'Michael', 'm', 'Dirección'],
  ['Cartografo', 'Camila', 'f', 'Descubrimiento'],
  ['Explorador', 'Mateo', 'm', 'Descubrimiento'],
  ['Guardian', 'Gabriela', 'f', 'Investigación'],
  ['Rastreador', 'Rodrigo', 'm', 'Investigación'],
  ['Analista', 'Ana', 'f', 'Investigación'],
  ['Estratega', 'Esteban', 'm', 'Estrategia'],
  ['Armador', 'Alejandra', 'f', 'Estrategia'],
  ['QA-1', 'Iván', 'm', 'Calidad'],
  ['QA-2', 'Valeria', 'f', 'Calidad'],
  ['Calificador', 'Carla', 'f', 'Reporte'],
  ['Redactor', 'Hugo', 'm', 'Reporte'],
] as const;

/** Harness con los 12 agentes de prospección (en producción los siembra el cargador de oficinas). */
export function harness(): H {
  const h = harnessVacio();
  const ins = h.db.prepare(
    "INSERT OR IGNORE INTO agentes (office_id, id, nombre_ui, persona, genero, rol, area) VALUES ('prospeccion', ?, ?, ?, ?, ?, ?)",
  );
  for (const [id, persona, g, area] of ROSTER) ins.run(id, id, persona, g, id, area);
  return h;
}

export const efectiva = async (h: H, office = 'prospeccion') =>
  (await h.owner.get(`/api/oficinas/${office}/definicion`)).body;
