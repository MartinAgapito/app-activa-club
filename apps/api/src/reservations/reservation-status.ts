// Semántica de "activas a efectos de cruces" de una reserva (sprint-3.md,
// "Aclaraciones de reglas incorporadas en este sprint": "Se consideran
// activas, a efectos de cruces y disponibilidad, las reservas `CONFIRMED`,
// `PENDING_APPROVAL` y `APPROVED`; las `CANCELLED` y `REJECTED` no
// bloquean").
//
// Se centraliza en una sola constante porque la misma pregunta ("¿esta
// reserva ocupa la agenda?") se repite en tres lugares que, si se
// implementaran cada uno con su propio `if`, tarde o temprano se
// desincronizarían: disponibilidad por recurso (US-029/RN-RES-07), creación
// de reserva -cruces por recurso y superposición de participantes-
// (US-030/US-031, RN-RES-07/08) y devolución del cupo de invitado al
// cancelar o rechazar (US-033/US-034, RN-RES-05).
//
// La razón de negocio de incluir `PENDING_APPROVAL`: si no ocupara franja,
// dos solicitudes de la misma parrilla y horario podrían aprobarse ambas
// (violaría RN-RES-07). La de excluir `REJECTED`: el rechazo administrativo
// también devuelve el cupo del invitado (US-034, nuevo caso R-29) porque el
// club nunca llegó a aprobar esa reserva.

import type { ReservationStatus } from '@activa-club/shared-types';

/** Estados que ocupan agenda y bloquean cruces/superposiciones/aforo. */
export const ACTIVE_RESERVATION_STATUSES: ReadonlySet<ReservationStatus> = new Set([
  'CONFIRMED',
  'PENDING_APPROVAL',
  'APPROVED',
]);

/** `true` si `status` cuenta como activa a efectos de cruces y disponibilidad. */
export function isActiveReservationStatus(status: ReservationStatus): boolean {
  return ACTIVE_RESERVATION_STATUSES.has(status);
}
