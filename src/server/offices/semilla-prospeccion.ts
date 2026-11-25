/**
 * Siembra inicial de la Biblioteca de la oficina de prospección de ACITMX.
 * Fuente: docs/dungeons (entrevista, roster, ui-spec). SIN precios y SIN modelos ni especificaciones
 * concretas: solo marcas, categorías/familias y casos de uso. Se inserta una sola vez (idempotente).
 */
import type { KbProductoInput } from '../../shared/cerebro';

type P = Omit<KbProductoInput, 'office_id'>;

export const PRODUCTOS_SEMILLA: P[] = [
  {
    marca: 'Lenovo',
    familia: 'ThinkPad',
    descripcion: 'Laptops empresariales para trabajo diario y movilidad.',
    casos_uso: 'Equipos para oficina, personal de campo, directivos y trabajo híbrido.',
    giros_ideales: 'Corporativos, servicios profesionales, financiero, salud, educación privada',
    argumentos_valor:
      'Estandarizar flota, soporte y garantía empresarial, administración centralizada de equipos.',
    advertencias:
      'Proponer la familia; no mencionar modelos concretos sin validar el catálogo PSREF.',
  },
  {
    marca: 'Lenovo',
    familia: 'ThinkCentre',
    descripcion: 'Computadoras de escritorio, todo-en-uno y mini para oficina.',
    casos_uso: 'Puestos fijos, recepción, módulos de atención, aulas y laboratorios.',
    giros_ideales: 'Educación privada, retail con sucursales, despachos, hotelería, salud',
    argumentos_valor:
      'Renovación de parque de escritorio, espacio reducido, confiabilidad en uso continuo.',
    advertencias: 'No inventar configuraciones; validar con PSREF.',
  },
  {
    marca: 'Lenovo',
    familia: 'ThinkStation',
    descripcion: 'Estaciones de trabajo de alto rendimiento.',
    casos_uso: 'Diseño y simulación, ingeniería, edición de video, análisis de datos.',
    giros_ideales:
      'Manufactura, construcción e inmobiliaria (arquitectura/ingeniería), agencias creativas',
    argumentos_valor:
      'Menos tiempos de render y cálculo, certificaciones para software profesional.',
    advertencias: 'Solo si hay evidencia de cargas de trabajo gráficas o de cómputo intensivo.',
  },
  {
    marca: 'Lenovo',
    familia: 'ThinkVision',
    descripcion: 'Monitores profesionales.',
    casos_uso: 'Puestos de trabajo, salas de control, diseño, atención al cliente.',
    giros_ideales:
      'Cualquier empresa con renovación de puestos; corporativos, logística, manufactura',
    argumentos_valor: 'Ergonomía, uniformidad de la flota, compra junto con los equipos.',
    advertencias: 'Complemento: se ofrece junto con equipos, no como motivo principal.',
  },
  {
    marca: 'Lenovo',
    familia: 'ThinkSystem',
    descripcion: 'Servidores y almacenamiento para centros de datos y salas de servidores.',
    casos_uso: 'Virtualización, bases de datos, ERP, respaldos, cargas de aplicaciones críticas.',
    giros_ideales:
      'Manufactura, financiero, salud, logística, empresas con ERP o varias sucursales',
    argumentos_valor:
      'Modernizar infraestructura envejecida, continuidad operativa, consolidación.',
    advertencias: 'Requiere evidencia (ERP, sistemas internos, varias sedes); no suponerlo.',
  },
  {
    marca: 'Lenovo',
    familia: 'ThinkEdge',
    descripcion: 'Cómputo en el borde para sucursales, tiendas y plantas.',
    casos_uso:
      'Procesamiento local en sucursales, punto de venta avanzado, visión por computadora, IoT.',
    giros_ideales: 'Retail con sucursales, manufactura, logística, alimentos y bebidas',
    argumentos_valor:
      'Latencia baja y operación aunque falle el enlace; compacto para espacios pequeños.',
    advertencias: 'Solo con caso de uso claro en sitio (sucursales, planta, almacén).',
  },
  {
    marca: 'Lenovo',
    familia: 'Legion / IdeaPad',
    descripcion: 'Líneas de consumo y gaming; solo casos justificados.',
    casos_uso: 'Programas de equipos para estudiantes o estaciones especializadas puntuales.',
    giros_ideales: 'Educación privada (casos específicos)',
    argumentos_valor: 'Costo-beneficio en volumen cuando no se requiere línea empresarial.',
    advertencias: 'No es la propuesta por defecto: preferir ThinkPad/ThinkCentre.',
  },
  {
    marca: 'Aruba',
    familia: 'Switches de red',
    descripcion: 'Conmutadores para redes de oficina, campus y sucursales.',
    casos_uso: 'Conectividad cableada para oficinas, plantas, almacenes y sucursales.',
    giros_ideales:
      'Manufactura, logística, educación privada, salud, corporativos con varias sedes',
    argumentos_valor: 'Red ordenada y escalable, administración simple, base para Wi-Fi y cámaras.',
    advertencias: 'Proponer categoría; la selección fina se valida con el catálogo vigente.',
  },
  {
    marca: 'Aruba',
    familia: 'Puntos de acceso Wi-Fi',
    descripcion: 'Wi-Fi empresarial para cobertura y densidad de usuarios.',
    casos_uso: 'Oficinas, almacenes, aulas, hoteles, tiendas, naves industriales.',
    giros_ideales: 'Hotelería y turismo, educación privada, retail, logística, manufactura',
    argumentos_valor: 'Cobertura confiable, roaming, mejor experiencia de usuarios e invitados.',
    advertencias: 'Mencionar quejas de conectividad solo si hay evidencia.',
  },
  {
    marca: 'Aruba',
    familia: 'Gestión Aruba Central',
    descripcion: 'Administración centralizada en la nube de redes cableadas e inalámbricas.',
    casos_uso: 'Operar varias sucursales con poco personal de TI.',
    giros_ideales: 'Empresas con varias sucursales, retail, educación, salud',
    argumentos_valor: 'Visibilidad única, cambios remotos, menos visitas técnicas.',
    advertencias: 'Ligado a la compra de red Aruba; no ofrecerlo aislado.',
  },
  {
    marca: 'Aruba',
    familia: 'Control de acceso a red',
    descripcion: 'Políticas de acceso y seguridad para usuarios y dispositivos conectados.',
    casos_uso: 'Redes con muchos dispositivos, invitados, BYOD o requisitos de seguridad.',
    giros_ideales: 'Financiero, salud, educación privada, corporativos',
    argumentos_valor: 'Control de quién se conecta y con qué, apoyo al cumplimiento interno.',
    advertencias: 'Solo si hay indicios de necesidad de seguridad o cumplimiento.',
  },
];

export interface DocSemilla {
  tipo: 'giro' | 'oficinas' | 'voz' | 'objeciones' | 'reglas' | 'glosario' | 'lista';
  titulo: string;
  tags: string;
  contenido_md: string;
}

export const DOCS_SEMILLA: DocSemilla[] = [
  {
    tipo: 'giro',
    titulo: 'Cliente ideal (ICP)',
    tags: 'icp, cliente ideal, tamaño, giro',
    contenido_md: `# Cliente ideal de ACITMX

- Empresas **B2B** privadas, PyME y grandes. **No gobierno** ni escuelas públicas.
- Prioridad: 30 o más empleados probables, **varias sucursales**, o giros intensivos en equipo de cómputo, red o servidores.
- Zona piloto: **CDMX y Estado de México**.
- Señales de oportunidad: apertura de planta o sucursal, crecimiento, sistemas internos (ERP), personal de TI, sitio web con varias sedes.
- Señales de descarte: dependencia pública, negocio unipersonal sin estructura, sin sitio ni dato de contacto verificable.`,
  },
  {
    tipo: 'giro',
    titulo: 'Giros objetivo y qué suelen necesitar',
    tags: 'giros, manufactura, logística, educación, salud, retail, hotelería',
    contenido_md: `# Giros objetivo (casos de uso típicos)

- **Manufactura**: servidores y ERP, workstations de ingeniería, red en planta (switches y Wi-Fi industrial).
- **Logística y transporte**: Wi-Fi en almacén, equipos de escritorio, edge en centros de distribución.
- **Educación privada**: laboratorios y aulas (escritorio, laptops), Wi-Fi de alta densidad.
- **Salud privada**: equipos de recepción y consultorios, servidores de sistemas clínicos, seguridad de red.
- **Corporativo y servicios profesionales**: laptops empresariales, monitores, red de oficina.
- **Retail y comercio**: sucursales con edge, Wi-Fi de tienda, administración centralizada de red.
- **Hotelería y turismo**: Wi-Fi para huéspedes, equipos de recepción.
- **Agroindustria, construcción e inmobiliaria, financiero y seguros, tecnología, alimentos y bebidas**: combinar equipos de trabajo con red y, si hay evidencia, servidores.

Regla: toda propuesta debe ligarse a una necesidad **evidenciada o inferida** de la empresa concreta.`,
  },
  {
    tipo: 'oficinas',
    titulo: 'Oficinas y cobertura de ACITMX',
    tags: 'oficinas, cobertura, cdmx, mérida, querétaro, guanajuato',
    contenido_md: `# Oficinas de ACITMX

Oficinas en **CDMX, Mérida, Estado de México, Querétaro y Guanajuato**. Atiende a toda la República Mexicana.

Uso en el reporte: indicar cuál oficina es la más cercana a la empresa (dato geográfico). **No** sugerir vendedor: el dueño canaliza.
Piloto actual de prospección: solo CDMX y Estado de México.`,
  },
  {
    tipo: 'voz',
    titulo: 'Voz y tono',
    tags: 'voz, tono, estilo, redacción',
    contenido_md: `# Voz y tono

- Español de México, **profesional y claro**; en el reporte interno, cercano ("Oye jefe, encontré...").
- Frases cortas, datos con fuente, sin exageraciones.
- El reporte es **interno** para el dueño; el borrador de correo es para que un **vendedor** lo envíe, nunca un agente.
- Borrador de correo: breve, personalizado, una pregunta abierta, firmado como "[Nombre del vendedor] — ACITMX".
- Inferencias siempre marcadas como inferencias, no como hechos.`,
  },
  {
    tipo: 'objeciones',
    titulo: 'Objeciones y respuestas frecuentes',
    tags: 'objeciones, faq',
    contenido_md: `# Objeciones frecuentes (guía para el borrador del vendedor)

- **"Ya tenemos proveedor"**: proponer una comparación sin compromiso o un piloto en un área.
- **"No es el momento"**: ofrecer revisar la flota actual y planear la renovación por etapas.
- **"Es caro"**: hablar de costo total (soporte, garantía, estandarización); **sin cifras** en el reporte.
- **"No tenemos área de TI"**: destacar administración remota y soporte del distribuidor.`,
  },
  {
    tipo: 'reglas',
    titulo: 'Reglas de negocio',
    tags: 'reglas, candados, seguridad',
    contenido_md: `# Reglas de negocio

1. Los agentes **nunca** contactan prospectos: son asistentes internos.
2. Nunca mencionar **precios** ni prometer disponibilidad.
3. Productos solo de **Lenovo** (catálogo PSREF) y **Aruba**. Si no hay certeza del modelo, proponer la **categoría o familia**.
4. Solo **CDMX y Estado de México** en el piloto. Excluir gobierno y la lista de No contactar.
5. Todo dato de contacto debe tener **fuente** verificable.
6. Máximo 2 devoluciones de QA por prospecto; a la tercera pasa a revisión humana.`,
  },
  {
    tipo: 'glosario',
    titulo: 'Glosario',
    tags: 'glosario, términos',
    contenido_md: `# Glosario

- **PSREF**: catálogo público de especificaciones de Lenovo.
- **Familia**: línea de producto (p. ej. ThinkPad); es la unidad de propuesta cuando no hay certeza del modelo.
- **Paquete**: combinación de 1 a 3 familias/categorías pensada para una empresa concreta.
- **ICP**: cliente ideal.
- **Corrida**: lote acotado de trabajo iniciado por el dueño.
- **QA-1 / QA-2**: revisiones de calidad (expediente y reporte final).`,
  },
  {
    tipo: 'lista',
    titulo: 'Listas de exclusión',
    tags: 'excluir, no contactar, gobierno',
    contenido_md: `# Qué excluir

- Gobierno y dependencias públicas, escuelas públicas.
- Empresas en la lista **No contactar** de la configuración del CRM (fuente de verdad: la tabla, no este texto).
- Empresas fuera de la zona piloto vigente.
- Duplicados del directorio (mismo dominio, teléfono o razón social).`,
  },
];
