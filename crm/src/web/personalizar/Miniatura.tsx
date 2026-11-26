import type { AparienciaPersonaje } from '../../shared/oficina3d/apariencia';

/** Miniatura SVG de un peinado con la piel y el color de cabello actuales (selector con previsualización). */
export function MiniaturaPeinado({
  peinado,
  piel,
  pelo,
}: {
  peinado: AparienciaPersonaje['peinado'];
  piel: string;
  pelo: string;
}) {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      {peinado === 'largo' && <rect x="5" y="9" width="24" height="22" rx="8" fill={pelo} />}
      {peinado === 'coleta' && <ellipse cx="29" cy="22" rx="3.5" ry="8" fill={pelo} />}
      {peinado === 'chongo' && <circle cx="17" cy="4.5" r="4.5" fill={pelo} />}
      {peinado === 'rizado' &&
        [8, 13, 17, 21, 26].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 7 : 9} r="4.6" fill={pelo} />
        ))}
      <circle cx="17" cy="19" r="9.5" fill={piel} stroke="rgba(0,0,0,.25)" strokeWidth=".8" />
      {peinado !== 'calvo' && (
        <path d="M7.5 17.5 A9.6 9.6 0 0 1 26.5 17.5 Q17 11 7.5 17.5Z" fill={pelo} />
      )}
      <circle cx="13.5" cy="19.5" r="1.2" fill="#2B1B10" />
      <circle cx="20.5" cy="19.5" r="1.2" fill="#2B1B10" />
      <path d="M13.5 24 Q17 26.5 20.5 24" stroke="#7A3B2E" strokeWidth="1.1" fill="none" />
    </svg>
  );
}
