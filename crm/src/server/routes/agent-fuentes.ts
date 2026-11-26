import type { Router } from 'express';
import { z } from 'zod';
import { descubrirPorFuentes, type ResultadoFuente } from '../fuentes/descubrir';
import { correoNorm, nombreNorm, telefonoNorm, webNorm } from '../fuentes/normalizar';
import { FUENTES } from '../fuentes/registro';
import { registrarCandidato } from '../fuentes/registrar';
import { herramientaPermitida } from '../offices/herramientas';
import { corridaActivaId } from '../services/admin';
import { registrarActividad } from '../services/events';
import { oficinaAgente, agenteDe } from './agente-util';
import { ah, HttpError, parse, type Deps } from './util';

const METODOS_AGENTE = [
  'nicho_web',
  'directorio_publico',
  'parque_industrial',
  'noticia_expansion',
  'hallazgo_oportunista',
] as const;

const buscarInput = z.object({
  fuente: z.enum(FUENTES.map((f) => f.id) as [string, ...string[]]),
  zona: z.string().trim().max(80).optional(),
  giro: z.string().trim().max(80).optional(),
  texto: z.string().trim().max(80).optional(),
  max: z.number().int().min(1).max(20).default(10),
});

const importarInput = z.object({
  metodo: z.enum(METODOS_AGENTE),
  consulta: z.string().trim().min(2).max(200),
  candidatos: z
    .array(
      z.object({
        nombre: z.string().trim().min(2).max(200),
        direccion: z.string().trim().max(400).optional(),
        telefono: z.string().trim().max(60).optional(),
        correo: z.string().trim().max(120).optional(),
        sitio_web: z.string().trim().max(300).optional(),
        giro: z.string().trim().max(80).optional(),
        fuente_url: z.string().trim().url().max(1000),
      }),
    )
    .min(1)
    .max(20),
});

/** Resumen corto para el agente (cuida tokens): sin listas largas. */
const compacto = (r: ResultadoFuente) => ({
  fuente: r.fuente_id,
  estado: r.estado,
  encontrados: r.encontrados,
  nuevos: r.nuevos,
  fusionados: r.fusionados,
  ya_existian: r.existentes,
  rechazados: r.rechazados,
  ...(r.detalle ? { detalle: r.detalle } : {}),
  registradas: r.empresas.slice(0, 20),
});

/** Herramientas de agente de las fuentes gratuitas: fuente_buscar y directorio_importar_candidatos. */
export function agentFuentes(r: Router, d: Deps): void {
  const { db, bus } = d;
  const exigir = (nombre: string, office: string): void => {
    if (!herramientaPermitida(db, office, nombre))
      throw new HttpError(403, `La herramienta ${nombre} no está permitida en esta oficina`);
  };

  r.post(
    '/fuentes/buscar',
    ah(async (q, res) => {
      const office = oficinaAgente(q);
      exigir('fuente_buscar', office);
      const b = parse(buscarInput, q.body);
      const corridaId = corridaActivaId(db, office);
      const params = corridaId
        ? (JSON.parse(
            (
              db.prepare('SELECT params FROM corridas WHERE id = ?').get(corridaId) as {
                params: string | null;
              }
            ).params ?? '{}',
          ) as { zona?: string; giro?: string })
        : {};
      const out = await descubrirPorFuentes({
        db,
        env: d.env ?? process.env,
        officeId: office,
        corridaId: corridaId ?? undefined,
        zona: b.zona ?? params.zona ?? 'CDMX',
        giro: b.giro ?? params.giro ?? 'Cualquiera',
        texto: b.texto,
        max: b.max,
        fuentes: [b.fuente],
        fetchFn: d.fuentes?.fetchFn,
        esperar: d.fuentes?.esperar,
      });
      const f = out.fuentes[0]!;
      registrarActividad(db, bus, {
        agente: agenteDe(q),
        accion: 'consultó una fuente gratuita',
        detalle: `${b.fuente}: ${f.estado} · ${f.nuevos} nuevas`,
        corrida_id: corridaId ?? undefined,
        office_id: office,
      });
      res.json(compacto(f));
    }),
  );

  r.post(
    '/fuentes/importar-candidatos',
    ah((q, res) => {
      const office = oficinaAgente(q);
      exigir('directorio_importar_candidatos', office);
      const b = parse(importarInput, q.body);
      const corridaId = corridaActivaId(db, office) ?? undefined;
      const out = {
        nuevas: 0,
        fusionadas: 0,
        existentes: 0,
        rechazadas: [] as { nombre: string; motivo: string }[],
        ids: [] as number[],
      };
      for (const c of b.candidatos) {
        const x = registrarCandidato(
          db,
          {
            nombre: c.nombre,
            direccion: c.direccion ?? '',
            telefono: telefonoNorm(c.telefono),
            correo: correoNorm(c.correo),
            sitio_web: webNorm(c.sitio_web),
            giro: c.giro ?? 'Otro',
            fuente_id: b.metodo,
            registro_id: `${c.fuente_url}#${nombreNorm(c.nombre)}`.slice(0, 300),
            fuente_url: c.fuente_url,
            licencia: 'Página pública citada por el agente',
            atribucion: c.fuente_url,
          },
          { officeId: office, corridaId, consulta: b.consulta },
        );
        if (x.status === 'creada') {
          out.nuevas++;
          out.ids.push(x.id);
        } else if (x.status === 'fusionada') out.fusionadas++;
        else if (x.status === 'existente') out.existentes++;
        else if (x.status === 'rechazada')
          out.rechazadas.push({ nombre: c.nombre, motivo: x.motivo });
      }
      res.json(out);
    }),
  );
}
