import { z } from 'zod';
import { derivarZona } from '../services/zona';
import { DENUE_ATRIBUCION, DENUE_LICENCIA } from './import-denue';
import { pedirJson, ErrorFuente } from './http';
import { correoNorm, nombreNorm, num, telefonoNorm, webNorm } from './normalizar';
import { esGobierno, estratoDe, giroDeScian, personalDeEstrato, scianDeGiro } from './scian';
import type { BusquedaFuente, Candidato, CtxFuente, FuenteAdapter } from './tipos';
import { resolverZona } from './zona-filtro';

const BASE = 'https://www.inegi.org.mx/app/api/denue/v1/consulta';
const ENTIDAD = { CDMX: '09', 'Estado de México': '15' } as const;

// Respuesta externa: se valida con Zod antes de usarla (campos desconocidos se ignoran).
const registro = z
  .object({
    Id: z.coerce.string(),
    Nombre: z.string().nullish(),
    Razon_social: z.string().nullish(),
    Clase_actividad: z.string().nullish(),
    Estrato: z.string().nullish(),
    Tipo_vialidad: z.string().nullish(),
    Calle: z.string().nullish(),
    Num_Exterior: z.string().nullish(),
    Colonia: z.string().nullish(),
    CP: z.coerce.string().nullish(),
    Ubicacion: z.string().nullish(),
    Telefono: z.string().nullish(),
    Correo_e: z.string().nullish(),
    Sitio_internet: z.string().nullish(),
    Longitud: z.coerce.string().nullish(),
    Latitud: z.coerce.string().nullish(),
    CLASE_ACTIVIDAD_ID: z.coerce.string().nullish(),
  })
  .passthrough();
const respuesta = z.array(registro);

const token = (ctx: CtxFuente): string => (ctx.env['DENUE_TOKEN'] ?? '').trim();

/** Prefijo SCIAN -> segmentos de la URL (sector/subsector/rama/clase; 0 = todos). */
function segmentosScian(p: string): string {
  const s = [p.slice(0, 2), p.length >= 3 ? p.slice(0, 3) : '0', p.length >= 4 ? p.slice(0, 4) : '0'];
  return `${s[0]}/${s[1]}/${s[2]}/${p.length >= 6 ? p : '0'}`;
}

function aCandidato(r: z.infer<typeof registro>, estado: string): Candidato | null {
  const nombre = r.Nombre?.trim();
  if (!nombre) return null;
  const scian = r.CLASE_ACTIVIDAD_ID?.trim() || null;
  const est = estratoDe(r.Estrato);
  const calle = [r.Tipo_vialidad, r.Calle, r.Num_Exterior].filter(Boolean).join(' ');
  const cp = r.CP?.replace(/\D/g, '').slice(0, 5);
  const direccion = [calle, r.Colonia, cp ? `C.P. ${cp}` : '', r.Ubicacion, estado]
    .filter(Boolean)
    .join(', ');
  return {
    nombre,
    razon_social: r.Razon_social ?? undefined,
    direccion,
    municipio: derivarZona(direccion).municipio ?? undefined,
    codigo_postal: cp,
    estado_mx: estado,
    telefono: telefonoNorm(r.Telefono),
    correo: correoNorm(r.Correo_e),
    sitio_web: webNorm(r.Sitio_internet),
    giro: giroDeScian(scian ?? undefined),
    scian: scian ?? undefined,
    tamano_est: personalDeEstrato(est),
    estrato: est,
    lat: num(r.Latitud),
    lng: num(r.Longitud),
    fuente_id: 'denue_api',
    registro_id: r.Id,
    fuente_url: `https://www.inegi.org.mx/app/mapa/denue/?id=${encodeURIComponent(r.Id)}`,
    licencia: DENUE_LICENCIA,
    atribucion: DENUE_ATRIBUCION,
  };
}

export const denueApi: FuenteAdapter = {
  id: 'denue_api',
  nombre: 'DENUE (API de INEGI)',
  tipo: 'api',
  requiere_token: true,
  env_token: 'DENUE_TOKEN',
  limites:
    'Token gratuito de INEGI. Cuota oficial no publicada: se aplica un tope mensual propio (editable). Máx. 1 solicitud por actividad y entidad.',
  tope_defecto: 2000,
  metodo: 'denue_api',
  licencia: DENUE_LICENCIA,
  atribucion: DENUE_ATRIBUCION,
  info_url: 'https://www.inegi.org.mx/servicios/api_denue.html',

  async buscar(q: BusquedaFuente, ctx: CtxFuente): Promise<Candidato[]> {
    const t = token(ctx);
    if (!t) throw new ErrorFuente('Falta DENUE_TOKEN en crm/.env');
    const z = resolverZona(q.zona);
    const prefijos = (q.scian?.length ? q.scian : scianDeGiro(q.giro)).slice(0, 6);
    const nombre = q.texto ? encodeURIComponent(q.texto.trim().slice(0, 60)) : '0';
    const fin = Math.min(Math.max(q.max * 4, 10), 200);
    const out: Candidato[] = [];
    for (const estado of z.estados)
      for (const p of prefijos) {
        ctx.consumir(1); // tope duro ANTES de la solicitud
        const url = `${BASE}/BuscarAreaAct/${ENTIDAD[estado]}/0/0/0/0/${segmentosScian(p)}/${nombre}/1/${fin}/0/${t}`;
        const json = await pedirJson(ctx, url, { secretos: [t], intentos: 2, esperaMs: 2000 });
        const r = respuesta.safeParse(json);
        if (!r.success) throw new ErrorFuente('Respuesta de DENUE con formato inesperado');
        for (const x of r.data) {
          const c = aCandidato(x, estado);
          if (c && !esGobierno(c.nombre, c.scian)) out.push(c);
        }
        if (out.length >= q.max * 3) return out;
      }
    return out.sort((a, b) => (b.tamano_est ?? -1) - (a.tamano_est ?? -1));
  },

  async probar(ctx: CtxFuente) {
    const t = token(ctx);
    if (!t) return { ok: false, detalle: 'Falta DENUE_TOKEN en crm/.env' };
    try {
      ctx.consumir(1);
      const url = `${BASE}/BuscarAreaAct/09/0/0/0/0/0/0/0/0/oxxo/1/1/0/${t}`;
      const json = await pedirJson(ctx, url, { secretos: [t], intentos: 1 });
      const r = respuesta.safeParse(json);
      return r.success
        ? { ok: true, detalle: `Conexión correcta (${r.data.length} registro de prueba).` }
        : { ok: false, detalle: 'Respondió, pero con un formato inesperado.' };
    } catch (e) {
      return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
    }
  },
};

export { nombreNorm };
