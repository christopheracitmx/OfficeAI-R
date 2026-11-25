/** Datos de demostración de P6.5 para la base TEMPORAL de la demo (nunca la real): prospectos, QA, opiniones, lecciones, métricas. */
import type { Db } from '../src/server/db';
import {
  feedbackDeQa,
  feedbackDeResultado,
  registrarFeedbackManual,
} from '../src/server/services/feedback';
import { cambiarEstado, crearLeccion } from '../src/server/services/lecciones';

const EMPRESAS: [string, string, number, string][] = [
  ['Manufacturas Ejemplo SA', 'Manufactura', 82, 'Ganado'],
  ['Transportes Ejemplo del Valle SA', 'Logística y transporte', 74, 'Perdido'],
  ['Colegio Ejemplo Anáhuac AC', 'Educación privada', 61, 'Canalizado'],
  ['Distribuidora Demo Norte SA', 'Retail y comercio', 55, 'Reportado'],
];

export function sembrarDemo(db: Db): void {
  const corrida = Number(
    db
      .prepare(
        "INSERT INTO corridas (zona, giro, max_empresas, motor, estado, params) VALUES ('CDMX','Cualquiera',4,'claude-code','terminada','{}')",
      )
      .run().lastInsertRowid,
  );
  const pids: number[] = [];
  for (const [nombre, giro, score, estado] of EMPRESAS) {
    const e = Number(
      db
        .prepare(
          "INSERT INTO empresas (nombre, metodo_descubrimiento, etapa, zona, municipio, corrida_id) VALUES (?, 'nicho_web', 'prospecto', 'CDMX Norte', 'Naucalpan', ?)",
        )
        .run(nombre, corrida).lastInsertRowid,
    );
    void giro;
    pids.push(
      Number(
        db
          .prepare(
            'INSERT INTO prospectos (empresa_id, corrida_id, estado, score, nivel) VALUES (?,?,?,?,?)',
          )
          .run(e, corrida, estado, score, score >= 75 ? 'A' : 'B').lastInsertRowid,
      ),
    );
    for (const [agente, n, tok, ms] of [
      ['Rastreador', 'rastreador', 38000, 41000],
      ['Analista', 'analista', 29000, 33000],
      ['Armador', 'estratega_armador', 31000, 36000],
      ['QA-1', 'qa1', 22000, 25000],
      ['Redactor', 'calificador_redactor', 27000, 30000],
      ['QA-2', 'qa2', 18000, 21000],
    ] as const)
      db.prepare(
        "INSERT INTO salidas_agente (office_id, corrida_id, agente, rol, paso, item_id, tipo, resumen, tokens_estimados, duracion_ms, resultado) VALUES ('prospeccion',?,?,?,?,?,'paso','ok',?,?,'ok')",
      ).run(corrida, agente, agente, n, e, tok, ms);
  }
  feedbackDeQa(db, pids[0]!, 'qa1', false, 'Rastreador', ['Teléfono sin fuente verificable']);
  feedbackDeQa(db, pids[0]!, 'qa1', true, null, undefined);
  feedbackDeQa(db, pids[1]!, 'qa1', false, 'Armador', ['Paquete mezcla equipos sin relación']);
  feedbackDeQa(db, pids[1]!, 'qa1', true, null, undefined);
  db.prepare(
    "INSERT INTO revisiones_qa (prospecto_id, etapa, aprobado, devolver_a, motivos) VALUES (?, 'qa1', 0, 'Rastreador', '[\"Teléfono sin fuente\"]'), (?, 'qa1', 0, 'Armador', '[\"Paquete incoherente\"]'), (?, 'qa1', 1, NULL, '[]'), (?, 'qa1', 1, NULL, '[]'), (?, 'qa2', 1, NULL, '[]'), (?, 'qa2', 1, NULL, '[]')",
  ).run(pids[0], pids[1], pids[0], pids[1], pids[0], pids[1]);
  feedbackDeResultado(db, pids[0]!, 'Ganado', 'Cerró con el vendedor de Edomex');
  feedbackDeResultado(db, pids[1]!, 'Perdido', 'Ya tenían proveedor');
  const op = (
    etapa: 'contactos' | 'ficha' | 'paquetes' | 'reporte',
    valor: 1 | -1,
    p: number,
    etiqueta?: string,
    nota?: string,
  ) =>
    registrarFeedbackManual(db, {
      office_id: 'prospeccion',
      prospecto_id: pids[p]!,
      etapa,
      valor,
      ...(etiqueta ? { etiqueta } : {}),
      ...(nota ? { nota } : {}),
    });
  op('contactos', -1, 1, 'Falta fuente', 'El teléfono vino de un directorio sin fecha');
  op('contactos', 1, 0, 'Buen hallazgo');
  op('paquetes', -1, 1, 'Paquete incoherente', 'Mezcló switches con laptops de ingeniería');
  op('reporte', 1, 0, 'Tono adecuado', 'El «Oye jefe» quedó muy claro');
  op('ficha', 1, 2);

  const L = (
    agente: string,
    tipo: 'acierto' | 'error',
    texto: string,
    aprobar: boolean,
    origen: 'manual' | 'reflexion',
  ) => {
    const l = crearLeccion(db, { office_id: 'prospeccion', agente, tipo, texto }, origen);
    if (aprobar) cambiarEstado(db, l.id, 'aprobar');
  };
  L(
    'Rastreador',
    'error',
    'Guarda un teléfono solo si aparece en la misma página que cita su fuente.',
    true,
    'manual',
  );
  L(
    'Redactor',
    'acierto',
    'Mantén el saludo «Oye jefe» y los puntos cortos en el reporte.',
    true,
    'manual',
  );
  L(
    'Armador',
    'error',
    'No combines switches de red con laptops de ingeniería en el mismo paquete.',
    false,
    'reflexion',
  );
  L(
    'Rastreador',
    'error',
    'Prefiere el correo del sitio oficial antes que el de directorios públicos.',
    false,
    'reflexion',
  );
  L(
    'Analista',
    'acierto',
    'Anota siempre si el tamaño de la empresa es evidencia o inferencia.',
    false,
    'reflexion',
  );

  const ev = Number(
    db
      .prepare(
        "INSERT INTO evaluaciones (office_id, etiqueta, cambio, modo, modelo, casos, aprobados, criterios_total, criterios_ok, tokens, estado, creado_en) VALUES ('prospeccion','Línea base',NULL,'real','claude-sonnet-5-5',6,3,22,17,41000,'terminada',?)",
      )
      .run(new Date().toISOString()).lastInsertRowid,
  );
  db.prepare(
    'INSERT INTO evaluaciones_casos (evaluacion_id, caso_id, caso_nombre, salida, resultados, ok) VALUES (?,1,\'Reporte de manufactura sin precios y con fuente\',\'Oye jefe...\',\'[{"criterio":"sin_precios","ok":true,"detalle":"sin precios"}]\',1)',
  ).run(ev);
}
