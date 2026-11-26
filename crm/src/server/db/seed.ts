import type Database from 'better-sqlite3';
import { PRESETS_BASE } from '../../shared/oficina3d/aleatorio-lugares';

export const GIROS_INICIALES = [
  'Manufactura',
  'Logística y transporte',
  'Educación privada',
  'Salud privada',
  'Corporativo y servicios profesionales',
  'Retail y comercio',
  'Hotelería y turismo',
  'Agroindustria',
  'Construcción e inmobiliaria',
  'Financiero y seguros',
  'Tecnología y telecomunicaciones',
  'Alimentos y bebidas',
  'Otro',
];

const CONFIG_INICIAL: Record<string, string> = {
  max_empresas_por_corrida: '10',
  places_tope_pro: '4900',
  zonas_piloto: JSON.stringify(['CDMX', 'Estado de México']),
  motor_ia: 'claude-code',
};

export const DESTINATARIO_INICIAL = 'christopher.rodriguez@acitmx.com';

/** Semillas idempotentes: no pisan valores que el dueño ya cambió. */
export function seed(db: Database.Database): void {
  const insConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
  const insGiro = db.prepare('INSERT OR IGNORE INTO taxonomia_giros (nombre) VALUES (?)');
  const hayDestinatarios = db.prepare('SELECT COUNT(*) AS n FROM destinatarios_internos').get() as {
    n: number;
  };
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(CONFIG_INICIAL)) insConfig.run(k, v);
    for (const g of GIROS_INICIALES) insGiro.run(g);
    if (hayDestinatarios.n === 0) {
      db.prepare('INSERT INTO destinatarios_internos (email, nombre) VALUES (?, ?)').run(
        DESTINATARIO_INICIAL,
        'Christopher',
      );
    }
  });
  tx();
  sembrarPresets(db);
}

/** Presets de apariencia de fábrica (idempotente: por tipo y nombre, solo los `builtin`). */
function sembrarPresets(db: Database.Database): void {
  const existe = db.prepare(
    'SELECT 1 FROM presets_apariencia WHERE builtin = 1 AND tipo = ? AND nombre = ?',
  );
  const ins = db.prepare(
    "INSERT INTO presets_apariencia (tipo, nombre, json, builtin, office_id, creado_en) VALUES (?, ?, ?, 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
  );
  db.transaction(() => {
    for (const p of PRESETS_BASE)
      if (!existe.get(p.tipo, p.nombre)) ins.run(p.tipo, p.nombre, JSON.stringify(p.json));
  })();
}
