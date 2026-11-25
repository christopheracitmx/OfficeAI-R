// Validación de lecciones: una lección NUNCA puede introducir precios, contacto externo ni relajar los candados.
// Las reglas son por frase: una frase que niega («nunca menciones precios») refuerza el candado y se permite.
import { contienePrecio } from './cerebro';

export const LECCION_MAX = 300;
export const LECCION_MIN = 10;

const NEGACION = /\b(no|nunca|jam[aá]s|evita\w*|sin|prohib\w*|nada de|tampoco|ni)\b/i;

interface Regla {
  motivo: string;
  patron: RegExp;
  /** true: aunque la frase niegue, se rechaza (p. ej. «ignora los candados» nunca es válido). */
  ignoraNegacion?: boolean;
}

const REGLAS: Regla[] = [
  {
    motivo: 'Instruye hablar de precios, costos, descuentos o cotizaciones',
    patron:
      /\b(menciona\w*|incluye\w*|incluir|dar|da|indica\w*|ofrece\w*|comparte\w*|cita\w*|agrega\w*|pon\w*|escribe\w*|anota\w*|usa\w*)\b[^.;]{0,40}\b(precios?|costos?|descuentos?|cotizaci\w+|tarifas?|presupuestos?)\b/i,
  },
  {
    motivo: 'Instruye contactar o responder a prospectos (el contacto externo está prohibido)',
    patron:
      /\b(contacta\w*|cont[aá]cta\w*|escribe\w*|llama\w*|responde\w*|env[ií]a\w*|manda\w*|invita\w*|saluda\w*|avisa\w*)\b[^.;]{0,50}\b(al|a la|a los|a las|con el|con la)\s+(prospecto|prospectos|cliente|clientes|empresa|empresas|contacto|contactos|responsable|gerente)\b/i,
  },
  {
    motivo: 'Instruye enviar correos o mensajes a destinatarios externos',
    patron:
      /\b(env[ií]a\w*|manda\w*|escribe\w*)\b[^.;]{0,30}\b(correos?|mails?|whatsapp|mensajes?|llamadas?)\b[^.;]{0,40}\b(prospect\w+|client\w+|extern\w+)/i,
  },
  {
    motivo: 'Intenta relajar, ignorar o desactivar los candados fijos',
    patron:
      /\b(ignora\w*|omite\w*|desactiva\w*|salta\w*|relaja\w*|quita\w*|elimina\w*|desobedece\w*|anula\w*|olvida\w*|suspende\w*)\b[^.;]{0,40}\b(candados?|reglas? fijas?|restricciones|l[ií]mites|seguridad)\b/i,
    ignoraNegacion: true,
  },
  {
    motivo: 'Dice que prevalece sobre los candados o sobre otras instrucciones de seguridad',
    patron:
      /\b(prevalece\w*|prioridad|por encima)\b[^.;]{0,40}\b(candados?|reglas? fijas?)\b|\bCANDADOS FIJOS\b/i,
    ignoraNegacion: true,
  },
  {
    motivo: 'Permite datos sin fuente o inventados',
    patron:
      /\b(inventa\w*|supone\w*|asume\w*|adivina\w*)\b[^.;]{0,40}\b(datos?|contactos?|correos?|tel[eé]fonos?|fuentes?)\b|\b(puedes?|se puede|se permite|acepta\w*|guarda\w*|registra\w*|agrega\w*)\b[^.;]{0,50}\bsin\s+(citar\s+)?fuente/i,
  },
  {
    motivo: 'Amplía el alcance fuera de CDMX/Estado de México o hacia gobierno',
    patron:
      /\b(incluye\w*|busca\w*|prospecta\w*|considera\w*|acepta\w*)\b[^.;]{0,50}\b(gobierno|dependencias|fuera de (la )?(cdmx|ciudad de m[eé]xico|edomex|estado de m[eé]xico)|otros estados|otras ciudades|monterrey|guadalajara|jalisco|nuevo le[oó]n|puebla)\b/i,
  },
];

/** Devuelve el motivo del rechazo, o null si la lección es válida. */
export function motivoLeccionInvalida(texto: string): string | null {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t.length < LECCION_MIN) return `La lección es muy corta (mínimo ${LECCION_MIN} caracteres)`;
  if (t.length > LECCION_MAX) return `La lección es muy larga (máximo ${LECCION_MAX} caracteres)`;
  if (contienePrecio(t)) return 'Una lección no puede contener precios ni montos';
  for (const frase of t.split(/(?<=[.;!?])\s+/)) {
    for (const r of REGLAS) {
      if (!r.patron.test(frase)) continue;
      // «sin fuente» es parte de lo que se prohíbe: no cuenta como negación de la frase.
      if (!r.ignoraNegacion && NEGACION.test(frase.replace(/sin\s+(citar\s+)?fuente/gi, '')))
        continue;
      return r.motivo;
    }
  }
  return null;
}

export const normalizarLeccion = (t: string): string => t.replace(/\s+/g, ' ').trim();
