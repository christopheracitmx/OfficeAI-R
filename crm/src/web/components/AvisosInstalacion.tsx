import { Link } from 'react-router-dom';
import type { EstadoApp } from '../lib/types';
import { Card } from './ui';

/** Avisos de instalación (Claude Code, Obscura, destinatarios): el CRM funciona, pero esto explica qué falta. */
export function AvisosInstalacion({ estado }: { estado: EstadoApp | null }) {
  const d = estado?.diagnostico;
  if (!d) return null;
  const avisos = [
    { id: 'claude', texto: d.claude.aviso, corto: 'Claude Code no instalado' },
    { id: 'obscura', texto: d.obscura.aviso, corto: 'Obscura no instalado' },
    { id: 'dest', texto: d.destinatarios.aviso, corto: 'Sin destinatarios de reportes' },
  ].filter((a) => a.texto);
  if (avisos.length === 0) return null;
  return (
    <div
      role="status"
      className="mx-3 mb-3 space-y-1 rounded-lg bg-warn/90 px-3 py-2 text-xs text-deep"
    >
      {avisos.map((a) => (
        <p key={a.id} title={a.texto ?? ''}>
          <b>Aviso:</b> {a.corto}.
        </p>
      ))}
      <Link to="/configuracion" className="font-semibold underline">
        Ver detalles en Configuración
      </Link>
    </div>
  );
}

export function DiagnosticoInstalacion({ estado }: { estado: EstadoApp }) {
  const d = estado.diagnostico;
  return (
    <Card>
      <div className="text-muted">Diagnóstico de instalación</div>
      <ul className="mt-1 space-y-1 text-sm">
        <li>Claude Code: {d?.claude.version ?? d?.claude.aviso ?? '—'}</li>
        <li>Obscura: {d?.obscura.aviso ?? `listo (${d?.obscura.ruta ?? ''})`}</li>
        <li>
          Destinatarios de reportes:{' '}
          {d?.destinatarios.aviso ?? `${d?.destinatarios.activos ?? 0} activo(s)`}
        </li>
      </ul>
    </Card>
  );
}
