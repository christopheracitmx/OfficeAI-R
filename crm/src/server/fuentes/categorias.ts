/** Categoría libre (Overture, etiquetas OSM) -> giro de la taxonomía del CRM. */
const REGLAS: [RegExp, string][] = [
  [/(factory|manufactur|industrial|plant|workshop|craft|machin)/i, 'Manufactura'],
  [/(logist|warehouse|transport|shipping|freight|courier|truck|cargo)/i, 'Logística y transporte'],
  [/(school|college|university|education|kindergarten|academy)/i, 'Educación privada'],
  [/(hospital|clinic|medical|dentist|doctor|health|laborator|pharmac)/i, 'Salud privada'],
  [/(hotel|motel|hostel|resort|lodging|tourism)/i, 'Hotelería y turismo'],
  [/(restaurant|food|bakery|cafe|beverage|brewery|bar_)/i, 'Alimentos y bebidas'],
  [/(bank|insurance|financ|credit|accounting_firm)/i, 'Financiero y seguros'],
  [/(software|telecom|computer|internet|data_center|electronics_store|it_)/i, 'Tecnología y telecomunicaciones'],
  [/(real_estate|construction|building_material|architect|contractor)/i, 'Construcción e inmobiliaria'],
  [/(agri|farm|livestock|greenhouse)/i, 'Agroindustria'],
  [/(shop|store|retail|supermarket|mall|market|dealer|wholesale)/i, 'Retail y comercio'],
  [/(office|professional|consult|lawyer|legal|business|company|coworking|agency)/i, 'Corporativo y servicios profesionales'],
];

export function giroDeCategoria(...categorias: (string | undefined | null)[]): string {
  const t = categorias.filter(Boolean).join(' ');
  return REGLAS.find(([re]) => re.test(t))?.[1] ?? 'Otro';
}
