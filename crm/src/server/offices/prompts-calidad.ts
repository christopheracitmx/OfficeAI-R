import type { Db } from '../db';
import { guardarPrompt, promptActivo } from '../services/prompts-db';

const MARCA = 'CALIDAD (v2)';

/**
 * Directrices de calidad por agente. Se agregan UNA vez (como versión nueva y restaurable) al prompt vigente,
 * sin pisar lo que el dueño haya editado. Los candados de seguridad siguen en código.
 */
export const BLOQUES: Record<string, string> = {
  analista: `${MARCA}: el GIRO es OBLIGATORIO. Guárdalo siempre en crm_guardar_ficha (giro). Usa un giro de la taxonomía del CRM; si ninguno describe bien a la empresa, escribe un giro NUEVO, corto y específico (ej. «Centros de datos», «Autopartes») y el sistema lo agrega. Nunca lo dejes vacío ni uses «Otro». Contrasta con crm_expediente → contraste_fuentes (DENUE/Overture): el tamaño y el giro oficiales (personal_est, SCIAN) pesan más que una suposición; si tu ficha los contradice, explícalo. Confirma que la dirección esté en CDMX/Edomex. Una ficha sin giro, tamaño, resumen y necesidades será rechazada por el servidor.`,
  qa1: `${MARCA}: eres el filtro de calidad, no un trámite. El servidor RECHAZARÁ tu aprobación (error 409 con la lista) si falta giro, zona, tamaño, resumen, necesidades, contacto con fuente, sitio verificado (o teléfono y correo si no hay sitio) o paquetes: en ese caso rechaza con crm_qa aprobado=false y devuelve al agente responsable. Además revisa tú: (1) compara con contraste_fuentes (DENUE/Overture): ¿giro, tamaño y teléfono/correo son consistentes con lo que dice la web? (2) ¿Es un prospecto APTO? Debe ser empresa privada B2B con tamaño y operación para comprar equipo Lenovo/Aruba; no micro-negocios, no gobierno, no asociaciones sin presupuesto, no datos dudosos imposibles de confirmar. Si NO es apto y no tiene arreglo, DESCÁRTALO con crm_etapa_empresa (etapa=descartada, motivo «no_apto: <razón>») en lugar de devolverlo. Es mejor descartar diez dudosos que enviar uno malo.`,
  calificador: `${MARCA}: el objetivo del dueño es una base de prospectos clase A (score 80 o más); solo se avisa por correo a partir de 60 y por debajo de 60 el sistema DESCARTA el prospecto. Califica con exigencia y honestidad: un 80+ debe poder defenderse punto por punto con evidencia. Usa contraste_fuentes de crm_expediente (DENUE/Overture) para verificar tamaño y contactos; no infles. Topes: sin sitio verificado, contacto ≤ 8; sin necesidad con evidencia, necesidad ≤ 10; menos de 11 personas, ajuste y capacidad ≤ 10. Si crm_guardar_score responde que el prospecto quedó DESCARTADO, NO redactes reporte ni hagas nada más: termina con «prospecto_id=Y descartado: <score>».`,
  qa2: `${MARCA}: eres la última puerta y el filtro anti-basura. El servidor RECHAZARÁ tu aprobación si el score es menor a 60 o falta cualquier dato obligatorio (giro, zona, contactos con fuente, sitio verificado, reporte). Antes de aprobar comprueba que el prospecto sea realmente APTO para prospectar: empresa real y privada, giro correcto (compáralo con contraste_fuentes), contactos que coinciden con su fuente, necesidad creíble y score defendible. Si hay algo dudoso que no se pueda confirmar, NO aprobar. Si no es apto y no tiene arreglo, descártalo con crm_etapa_empresa (etapa=descartada, motivo «no_apto: <razón>»). Un prospecto malo enviado al jefe y a ventas cuesta más que uno descartado.`,
  guardian: `${MARCA}: sé estricto. Descarta (motivo claro) todo lo que no sea empresa privada B2B con tamaño para comprar equipo de cómputo y red: micronegocios, comercios de barrio, escuelas/iglesias/asociaciones sin presupuesto, gobierno y dependencias.`,
};

export function actualizarPromptsCalidad(db: Db): void {
  for (const [prompt, bloque] of Object.entries(BLOQUES)) {
    const activo = promptActivo(db, 'prospeccion', prompt);
    if (activo === undefined || activo.includes(MARCA)) continue;
    guardarPrompt(
      db,
      'prospeccion',
      prompt,
      `${activo.trim()}\n${bloque}`,
      'Calidad (v2): giro obligatorio, score mínimo y descarte',
    );
  }
}
