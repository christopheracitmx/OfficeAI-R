import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db';
import { guardarPrompt, promptActivo, versionesPrompt } from '../services/prompts-db';

const MARCA = 'fuente_buscar';

const BLOQUE: Record<string, string> = {
  cartografo:
    'FUENTES GRATUITAS (P11): antes de ti el sistema ya consultó DENUE, Overture y OpenStreetMap por código y registró lo encontrado (filtrado y sin duplicados); cuenta para el lote. Para completar usa primero fuente_buscar (si responde quota_exceeded o sin_datos, cambia de fuente) y solo si aún faltan, places_search.',
  explorador:
    'FUENTES GRATUITAS (P11): DENUE, Overture y OpenStreetMap ya los consulta el sistema por código; para otra consulta usa fuente_buscar. Si una página pública lista varias empresas, regístralas juntas con directorio_importar_candidatos (hasta 20, cada una con fuente_url). Nunca Facebook/Instagram.',
};

/**
 * P11: añade a los prompts sembrados del Cartógrafo y el Explorador lo de las fuentes gratuitas, SIN pisar versiones previas:
 * si el dueño nunca los editó se guarda la nueva semilla; si los editó, se agrega un párrafo al final de su texto vigente.
 * Siempre es una versión nueva (las anteriores se conservan y se pueden restaurar). Los candados viven en código.
 */
export function actualizarPromptsFuentes(db: Db, dirOficinas: string): void {
  const office = 'prospeccion';
  for (const prompt of Object.keys(BLOQUE)) {
    const activo = promptActivo(db, office, prompt);
    if (activo === undefined || activo.includes(MARCA)) continue;
    const vigente = versionesPrompt(db, office, prompt).find((v) => v.activo === 1);
    const sinEditar = vigente?.nota === 'Semilla inicial';
    let nuevo = `${activo.trim()}\n${BLOQUE[prompt]}`;
    if (sinEditar) {
      try {
        nuevo = readFileSync(join(dirOficinas, office, 'agents', `${prompt}.md`), 'utf8').trim();
      } catch {
        /* sin archivo: se usa el párrafo agregado */
      }
    }
    if (!nuevo.includes(MARCA)) nuevo = `${activo.trim()}\n${BLOQUE[prompt]}`;
    guardarPrompt(db, office, prompt, nuevo, 'P11: fuentes gratuitas de descubrimiento');
  }
}
