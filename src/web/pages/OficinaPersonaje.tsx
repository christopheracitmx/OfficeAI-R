import { cx } from '../components/ui';
import { type EventoActividad } from '../lib/api';

export const AGENTES = [
  {
    id: 'Cartografo',
    nombre: 'Cartógrafo',
    rol: 'Descubre empresas',
    color: '#00ADA9',
    piel: '#F2C9A5',
  },
  {
    id: 'Explorador',
    nombre: 'Explorador',
    rol: 'Busca por nichos',
    color: '#007F7C',
    piel: '#D9A67A',
  },
  {
    id: 'Guardian',
    nombre: 'Guardián',
    rol: 'Filtra y deduplica',
    color: '#164E5A',
    piel: '#F2C9A5',
  },
  {
    id: 'Rastreador',
    nombre: 'Rastreador',
    rol: 'Busca contactos',
    color: '#D98E04',
    piel: '#B9805A',
  },
  {
    id: 'Analista',
    nombre: 'Analista',
    rol: 'Analiza la empresa',
    color: '#00ADA9',
    piel: '#E8B88F',
  },
  {
    id: 'Estratega',
    nombre: 'Estratega',
    rol: 'Elige productos',
    color: '#7A8F97',
    piel: '#D9A67A',
  },
  { id: 'Armador', nombre: 'Armador', rol: 'Arma paquetes', color: '#007F7C', piel: '#F2C9A5' },
  { id: 'QA-1', nombre: 'QA-1', rol: 'Revisa la propuesta', color: '#D64545', piel: '#B9805A' },
  {
    id: 'Calificador',
    nombre: 'Calificador',
    rol: 'Da el score',
    color: '#164E5A',
    piel: '#E8B88F',
  },
  {
    id: 'Redactor',
    nombre: 'Redactor',
    rol: 'Escribe el reporte',
    color: '#00ADA9',
    piel: '#F2C9A5',
  },
  { id: 'QA-2', nombre: 'QA-2', rol: 'Revisión final', color: '#D64545', piel: '#D9A67A' },
  {
    id: 'Coordinador',
    nombre: 'Coordinador',
    rol: 'Coordina la oficina',
    color: '#0F3D47',
    piel: '#E8B88F',
  },
] as const;

export interface Viaje {
  id: number;
  de: number;
  a: number;
  fase: 'sale' | 'viaja';
}
export interface Estado {
  ev: EventoActividad;
  t: number;
}

export function Personaje({
  color,
  piel,
  activo,
  alerta,
}: {
  color: string;
  piel: string;
  activo: boolean;
  alerta: boolean;
}) {
  return (
    <svg
      width="64"
      height="72"
      viewBox="0 0 64 72"
      className={cx(activo && !alerta && 'anim-bob')}
      aria-hidden
    >
      <rect x="14" y="38" width="36" height="30" rx="10" fill={color} />
      <rect x="6" y="42" width="12" height="20" rx="6" fill={color} opacity=".85" />
      <rect x="46" y="42" width="12" height="20" rx="6" fill={color} opacity=".85" />
      <circle cx="32" cy="24" r="15" fill={piel} />
      <path d="M17 22c1-10 8-14 15-14s14 4 15 14c-4-5-9-7-15-7s-11 2-15 7z" fill="#0F3D47" />
      <circle cx="26" cy="26" r="1.8" fill="#0F3D47" />
      <circle cx="38" cy="26" r="1.8" fill="#0F3D47" />
      {alerta ? (
        <path
          d="M27 33q5-3 10 0"
          stroke="#0F3D47"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M27 32q5 4 10 0"
          stroke="#0F3D47"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
