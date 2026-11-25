import type Database from 'better-sqlite3';

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
}
