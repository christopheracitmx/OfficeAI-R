export type EstadoFinal =
  | 'terminada'
  | 'detenida'
  | 'pausada_limite_plan'
  | 'pausada_cuota_places'
  | 'pausada_reserva_plan'
  | 'error';

/** Se lanza para cortar la corrida con un estado final (pausa, detención, circuit breaker...). */
export class FinCorrida extends Error {
  constructor(
    public readonly estado: EstadoFinal,
    public readonly motivo: string,
  ) {
    super(motivo);
  }
}
