import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Db } from '../db';
import type { Deps } from '../routes/util';
import { rutaObscura } from '../../shared/obscura';

export interface Diagnostico {
  claude: { disponible: boolean; version: string | null; aviso: string | null };
  obscura: { disponible: boolean; ruta: string; aviso: string | null };
  destinatarios: { activos: number; aviso: string | null };
}

export type ComprobarClaude = () => Promise<string | null>;

/** `claude --version` (no consume plan ni llama a la IA). Devuelve la versión o null si el comando no existe. */
export const comprobarClaudeReal: ComprobarClaude = () =>
  new Promise((resolver) => {
    execFile('claude', ['--version'], { timeout: 8000, windowsHide: true, shell: true }, (e, out) =>
      resolver(e ? null : String(out).trim().split(/\r?\n/)[0] || 'desconocida'),
    );
  });

let cacheClaude: { en: number; version: string | null } | null = null;

/** Avisos de instalación para que el CRM arranque aunque falten piezas (Claude Code, Obscura, destinatarios). */
export async function diagnosticar(
  db: Db,
  raiz: string,
  env: NodeJS.ProcessEnv,
  comprobar: ComprobarClaude | undefined,
): Promise<Diagnostico> {
  let version: string | null = null;
  if (comprobar) {
    const ahora = Date.now();
    if (!cacheClaude || ahora - cacheClaude.en > 60_000)
      cacheClaude = { en: ahora, version: await comprobar() };
    version = cacheClaude.version;
  }
  const ruta = rutaObscura(raiz, env);
  const hayObscura = existsSync(ruta);
  const activos = (
    db.prepare('SELECT COUNT(*) AS n FROM destinatarios_internos WHERE activo = 1').get() as {
      n: number;
    }
  ).n;
  return {
    claude: {
      disponible: comprobar === undefined || version !== null,
      version,
      aviso:
        comprobar === undefined || version !== null
          ? null
          : 'No se encontró el comando «claude» (Claude Code). Los agentes no podrán trabajar hasta instalarlo e iniciar sesión (ver GUIA-INSTALACION.md).',
    },
    obscura: {
      disponible: hayObscura,
      ruta,
      aviso: hayObscura
        ? null
        : `No se encontró Obscura en ${ruta}. El CRM funciona, pero los agentes leerán sitios web solo con la búsqueda web de Claude. Instálalo o ajusta OBSCURA_BIN en crm\.env (ver GUIA-INSTALACION.md).`,
    },
    destinatarios: {
      activos,
      aviso:
        activos > 0
          ? null
          : 'Sin destinatarios: no se enviará ninguna alerta por correo. Agrega al menos uno en Configuración → Correos de reportes (o define CRM_DESTINATARIO_INICIAL en crm\.env antes del primer arranque).',
    },
  };
}

export const diagnosticarDeps = (d: Deps): Promise<Diagnostico> =>
  diagnosticar(d.db, d.raiz ?? process.cwd(), d.env ?? {}, d.comprobarClaude);
